import Web3 from "web3";
import { Account, TransactionReceipt, TransactionConfig } from "web3-core";
import { fromWei, toWei } from "web3-utils";
import { Topics, Reserve } from "./helper/Models";
import BN, { BigNumber } from "bignumber.js";
import Logger from "./helper/Logger";
import Utils from "./helper/Utils";
import ora from "ora";
import chalk from "chalk";

export default class Web3Helper {
	public abiDecoder = require("abi-decoder");
	public spinner = ora("Searching token liquidity...");
	public logger: Logger = new Logger("Ape");
	public Symbols: any;

	// Wallet info
	public account: Account;
	public nonce: number;

	// Network config
	public defaultGas = toWei(process.env.GAS_PRICE, "gwei");
	public gasLimit: string = process.env.GAS_LIMIT;
	public wbnbAddress: string = "0x0";

	// DEX info
	public routerAddress: string;
	public factoryAddress: string;
	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);

	constructor(public web3: Web3) {
		this.Init();
	}

	public setRouterAddr(RouterAddr: string) {
		this.routerAddress = RouterAddr;
	}

	public async Init() {
		this.account = this.web3.eth.accounts.privateKeyToAccount(process.env.ACCOUNT_PK);
		this.nonce = await this.web3.eth.getTransactionCount(this.account.address);

		this.factoryAddress = await this.router().methods.factory().call();
		this.wbnbAddress = await this.router().methods.WETH().call();
		this.Symbols = { wbnb: this.wbnbAddress };

		// load ABIs into decoder
		this.abiDecoder.addABI(require("../ABIs/IPancakeFactoryV2.json"));
		this.abiDecoder.addABI(require("../ABIs/IPancakeRouterV2.json"));
		this.abiDecoder.addABI(require("../ABIs/IPancakePair.json"));
	}

	public swapExactETHForTokens(token: string, amount: string) {
		return new Promise<BN>((resolve, reject) => {
			const router = this.router();

			const methodCall = router.methods.swapExactETHForTokens(
				// amountOutMin
				"0",
				// path
				[this.Symbols.wbnb, token],
				// to address
				this.account.address,
				// deadline
				Math.round(new Date().getTime() / 1000) + 30
			);

			this.sendSignedTX(this.account, this.routerAddress, this.gasLimit, this.defaultGas, methodCall, amount)
				.then((receipt) => {
					const decodedLogs = this.abiDecoder.decodeLogs(receipt.logs);
					const swapped = this.getSwappedAmount(decodedLogs);

					if (swapped) {
						resolve(swapped);
						return;
					}

					this.logger.error(`Failed to decode swapped amount for txn ${receipt.transactionHash}`);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	public sendETH(account: Account, to: string, gas: string, gasPrice: string, value: string) {
		return new Promise<TransactionReceipt>(async (resolve, reject) => {
			const tx: TransactionConfig = {
				from: account.address,
				to: to,
				gas: gas,
				value: value,
				gasPrice: gasPrice,
			};

			if (this.nonce !== null) {
				tx.nonce = this.nonce;
				this.nonce++;
			}

			const signedTX = await account.signTransaction(tx);
			let newGasPrice: any = parseInt(gasPrice);

			let TXSubmitted = false;

			this.web3.eth
				.sendSignedTransaction(signedTX.rawTransaction)
				.on("transactionHash", (hash) => {
					TXSubmitted = true;
					this.logger.log(`Txn Hash ${hash} (${fromWei(gasPrice, "gwei")}gwei)`);
					this.spinner = ora("Presale joining...").start();
				})
				.on("receipt", (receipt) => {
					resolve(receipt);
				})
				.on("error", async (error) => {
					if (!TXSubmitted && error.message.indexOf("insufficient funds for gas") !== -1) {
						this.nonce--;
					}

					if (!TXSubmitted && error.message.indexOf("Transaction has been reverted by the EVM") !== -1) {
						this.logger.error("Transaction has been reverted by the EVM.");
						this.logger.error(`Error: ${error.message}. Retrying...`);

						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendETH(account, to, gas, gasPrice, value)
							.then((retryResult) => {
								resolve(retryResult);
							})
							.catch((retryError) => reject(retryError));
						return;
					}

					if (!TXSubmitted && error) {
						this.logger.error(`Error: ${error.message}. Retrying...`);

						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendETH(account, to, gas, gasPrice, value)
							.then((retryResult) => {
								resolve(retryResult);
							})
							.catch((retryError) => reject(retryError));
						return;
					}

					if (!TXSubmitted && error.message.indexOf("transaction underpriced") !== -1) {
						this.logger.error(`${error.message}. Retrying...`);

						newGasPrice += 1000000000;
						newGasPrice = newGasPrice.toString();
						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendETH(account, to, gas, newGasPrice, value)
							.then((retryResult) => {
								resolve(retryResult);
							})
							.catch((retryError) => reject(retryError));
						return;
					}

					this.logger.error(`${error.message}`);
					reject(error);
				});
		});
	}

	public sendSignedTX(account: Account, to: string, gas: string, gasPrice: string, methodCall: any, value: string = "0") {
		return new Promise<TransactionReceipt>(async (resolve, reject) => {
			const encodedABI = methodCall.encodeABI();
			const tx: TransactionConfig = {
				from: account.address,
				to: to,
				gas: gas,
				data: encodedABI,
				value: value,
				gasPrice: gasPrice,
			};

			if (this.nonce !== null) {
				tx.nonce = this.nonce;
				this.nonce++;
			}

			const signedTX = await account.signTransaction(tx);
			let newGasPrice: any = parseInt(gasPrice);

			let TXSubmitted = false;

			this.web3.eth
				.sendSignedTransaction(signedTX.rawTransaction)
				.on("transactionHash", (hash) => {
					TXSubmitted = true;
					this.logger.log(`Txn Hash ${hash} (${fromWei(gasPrice, "gwei")}gwei)`);
					this.spinner = ora("Buying...").start();
				})
				.on("receipt", (receipt) => {
					resolve(receipt);
				})
				.on("error", async (error) => {
					if (!TXSubmitted && error.message.indexOf("insufficient funds for gas") !== -1) {
						this.nonce--;
					}
					// if (!TXSubmitted && error.message.toLowerCase().indexOf("nonce too low") !== -1) {

					if (!TXSubmitted && error) {
						this.logger.error(`Error: ${error.message}. Retrying...`);

						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendSignedTX(account, to, gas, gasPrice, methodCall, value)
							.then((retryResult) => {
								resolve(retryResult);
							})
							.catch((retryError) => reject(retryError));
						return;
					}

					if (!TXSubmitted && error.message.indexOf("transaction underpriced") !== -1) {
						this.logger.error(`${error.message}. Retrying...`);

						newGasPrice += 1000000000;
						newGasPrice = newGasPrice.toString();
						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendSignedTX(account, to, gas, newGasPrice, methodCall, value)
							.then((retryResult) => {
								resolve(retryResult);
							})
							.catch((retryError) => reject(retryError));
						return;
					}

					this.logger.error(`${error.message}`);
					reject(error);
				});
		});
	}

	public sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	public getPair(tokenA: string, tokenB: string) {
		return new Promise<string>(async (resolve, reject) => {
			const factory = this.factory();
			try {
				const Pair = await factory.methods.getPair(tokenA, tokenB).call();
				resolve(Pair);
			} catch (error) {
				reject(error);
			}
		});
	}

	public async checkBalance() {
		try {
			const balance = await this.web3.eth.getBalance(this.account.address);
			this.logger.log(`Current account balance: ${fromWei(new BigNumber(balance).toFixed())} BNB`);
		} catch (error) {
			this.logger.error(error);
		}
	}

	public getSwappedAmount(decodedLogs: any): BigNumber {
		let swappedAmount: BigNumber = null;
		decodedLogs.forEach((log: any) => {
			if (log.name !== "Swap") {
				return;
			}

			const props = Utils.decodedEventsToArray(log);
			swappedAmount = new BigNumber(props.amount0In === "0" ? props.amount0Out : props.amount1Out);
		});

		return swappedAmount;
	}

	// Pancake Router Contract Instantce
	public router() {
		return new this.web3.eth.Contract(require("../ABIs/IPancakeRouterV2.json"), this.routerAddress);
	}

	// pancake Facotry Contract Instance
	public factory() {
		return new this.web3.eth.Contract(require("../ABIs/IPancakeFactoryV2.json"), this.factoryAddress);
	}

	public getReserve(pair: string) {
		return new Promise<Reserve>((resolve, reject) => {
			const PairContract = new this.web3.eth.Contract(require("../ABIs/IPancakePair.json"), pair);
			PairContract.methods
				.getReserves()
				.call()
				.then((result: any) => {
					resolve(new Reserve(result[0], result[1]));
				})
				.catch((error: any) => {
					reject(error);
				});
		});
	}

	public async displayInfo() {
		this.displayLogo();
		this.logger.log(`Current Bot Address: ${this.account.address}`);
		await this.checkBalance();
	}

	public displayLogo() {
		console.log(
			chalk.green(`    ___               __ __ _ ____
   /   |  ____  ___  / //_/(_) / /__  _____
  / /| | / __ \/ _ \/ ,<  / / / / _ \/ ___/
 / ___ |/ /_/ /  __/ /| |/ / / /  __/ /
/_/  |_/ .___/\___/_/ |_/_/_/_/\___/_/
      /_/                                  \n`)
		);
	}
}
