import Web3 from "web3";
import { Account, TransactionReceipt, TransactionConfig } from "web3-core";
import { fromWei, toWei } from "web3-utils";
import { Topics, Reserve } from "./helper/Models";
import BN, { BigNumber } from "bignumber.js";
import Logger from "./helper/Logger";
import Utils from "./helper/Utils";
import chalk from "chalk";
import Display from "./helper/display";
import WebHelper from "./helper/WebHelper";

export default class Web3Helper {
	public abiDecoder = require("abi-decoder");
	public logger: Logger = new Logger("Web3Helper");
	public Symbols: any;
	public SymbolName: string;
	public RPC_Lantency: any;

	// Wallet info
	public account: Account;
	public nonce: number;

	// Network config
	public defaultGas = toWei(process.env.GAS_PRICE, "gwei");
	public gasLimit: string = process.env.GAS_LIMIT;
	public network: string;
	public wbnbAddress: string = "0x0";

	// DEX info
	public routerAddress: string;
	public factoryAddress: string;
	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);

	constructor(public web3: Web3) {
		this.Init();
	}

	public setRouterAddr(routerAddr: string) {
		this.routerAddress = routerAddr;
	}

	public async setNetwork(network: string, RPC_URL: string) {
		this.network = network;
		this.RPC_Lantency = await WebHelper.testNetworkLantency(new URL(RPC_URL).hostname);
	}

	public setSymbolName(symbolName: string) {
		this.SymbolName = symbolName;
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
		this.abiDecoder.addABI(require("../ABIs/IBEP20.json"));
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
					Display.stopSpinner();
					this.logger.log(`Txn Hash ${hash} (${fromWei(gasPrice, "gwei")}gwei)`);
					Display.setSpinner(chalk.grey("Presale joining..."));
					Display.startSpinner();
				})
				.on("receipt", (receipt) => {
					resolve(receipt);
				})
				.on("error", async (error) => {
					Display.setSpinner(chalk.grey(`Error: ${error.message}. Retrying...`));

					if (!TXSubmitted && error.message.indexOf("insufficient funds for gas") !== -1) {
						this.nonce--;
					}
					if (error.message.indexOf("Transaction has been reverted") !== -1) {
						this.logger.error("Transaction has been reverted by the EVM.");
						Display.startSpinner();

						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendETH(account, to, gas, gasPrice, value)
							.then((retryResult) => {
								resolve(retryResult);
							})
							.catch((retryError) => reject(retryError));
						return;
					}

					if (!TXSubmitted && error.message.indexOf("transaction underpriced") !== -1) {
						Display.startSpinner();

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

					if (!TXSubmitted && error) {
						Display.startSpinner();

						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendETH(account, to, gas, gasPrice, value)
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
					Display.stopSpinner();
					this.logger.log(`Txn Hash ${hash} (${fromWei(gasPrice, "gwei")}gwei)`);
					Display.setSpinner(chalk.grey("Buying..."));
					Display.startSpinner();
				})
				.on("receipt", (receipt) => {
					resolve(receipt);
				})
				.on("error", async (error) => {
					Display.setSpinner(chalk.grey(`Error: ${error.message}. Retrying...`));

					if (!TXSubmitted && error.message.indexOf("insufficient funds for gas") !== -1) {
						this.nonce--;
					}
					// if (!TXSubmitted && error.message.toLowerCase().indexOf("nonce too low") !== -1) {

					if (!TXSubmitted && error.message.indexOf("transaction underpriced") !== -1) {
						Display.startSpinner();

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

					if (!TXSubmitted && error) {
						Display.startSpinner();

						this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
						this.sendSignedTX(account, to, gas, gasPrice, methodCall, value)
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

	private tokenContract(token: string) {
		return new this.web3.eth.Contract(require("../ABIs/IBEP20.json"), token);
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
		Display.displayLogo();
		this.logger.log(`Network: ${chalk.yellow(this.network)}(${chalk.green(this.RPC_Lantency)}ms)`);
		this.logger.log(`GAS: Price-${chalk.yellow(process.env.GAS_PRICE)} gwei | Limit-${chalk.yellow(this.gasLimit)}`);
		this.logger.log(`Buy Amount: ${chalk.yellow(process.env.BUY_IN_AMOUNT)} ${this.SymbolName}`);
		this.logger.log(`Bot Address: ${chalk.green(this.account.address)}`);
		await this.checkBalance();
	}

	public async checkBalance() {
		try {
			Display.setSpinner("Checking Balance...");
			Display.startSpinner();
			const balance = await this.web3.eth.getBalance(this.account.address);
			Display.stopSpinner();
			this.logger.log(`Bot balance: ${chalk.green(fromWei(new BigNumber(balance).toFixed()))} ${this.SymbolName}`);
		} catch (error) {
			this.logger.error(error);
		}
	}

	public balanceOf(token: string) {
		return new Promise<BigNumber>((resolve, reject) => {
			const contract = this.tokenContract(token);
			contract.methods
				.balanceOf(this.account.address)
				.call()
				.then((result: string) => {
					resolve(new BigNumber(result));
				})
				.catch((error: any) => {
					reject(error);
				});
		});
	}
}
