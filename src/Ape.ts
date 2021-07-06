import Web3 from "web3";
import { Account, TransactionReceipt, TransactionConfig } from "web3-core";
import { fromWei, toWei } from "web3-utils";
import { Topics, Reserve } from "./Models";
import BN, { BigNumber } from "bignumber.js";
import Utils from "./Utils";
import Logger from "./Logger";
import ora from "ora";
import inquirer from "inquirer";
import ListNode from "./ListNode";
import { title } from "process";

export default class Ape {
	// web3 provider
	private web3: Web3;
	private abiDecoder = require("abi-decoder");
	private logger: Logger = new Logger("Ape");
	private spinner = ora("Searching token liquidity...");

	// pair info
	private pair: string;
	private token0: string;
	private token1: string;

	private routerAddress: string;
	private factoryAddress: string;
	private defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	private tartgetTokenAddress: string;
	private presaleAddress: string;

	// Wallet info
	private account: Account;
	private nonce: number;

	// private getBlockAPIKEY = "212a00f7-19e6-4c91-987f-1b1ea412c586";
	// private BSC_MAINNET_WS: string = `wss://bsc.getblock.io/mainnet/?api_key={$getBlockAPIKEY}`;
	// private BSC_TEST_WS: string = `wss://bsc.getblock.io/mainnet/?api_key={$getBlockAPIKEY}`;

	// Network config
	private defaultGas = toWei(process.env.GAS_PRICE, "gwei");
	private gasLimit: string = process.env.GAS_LIMIT;
	private wbnbAddress: string = "0x0";
	private Symbols: any;
	private RPC_URL: string;

	public constructor() {
		this.Entry();
	}

	private async Entry() {
		// select network
		const network = await this.selectNetwork();
		this.RPC_URL = network.RPC_URL;
		this.web3 = new Web3(this.RPC_URL);
		this.routerAddress = network.Rourter_Address;

		this.account = this.web3.eth.accounts.privateKeyToAccount(process.env.ACCOUNT_PK);
		this.nonce = await this.web3.eth.getTransactionCount(this.account.address);

		this.factoryAddress = await this.router().methods.factory().call();
		this.wbnbAddress = await this.router().methods.WETH().call();
		this.Symbols = { wbnb: this.wbnbAddress };

		// load ABIs into decoder
		this.abiDecoder.addABI(require("../ABIs/IPancakeFactoryV2.json"));
		this.abiDecoder.addABI(require("../ABIs/IPancakeRouterV2.json"));
		this.abiDecoder.addABI(require("../ABIs/IPancakePair.json"));

		this.logger.log(`Network => ${this.RPC_URL}`);
		this.logger.log(`RouterAddress => ${this.routerAddress}`);
		this.logger.log(`Target Token => ${this.tartgetTokenAddress}`);
		this.logger.log(`------- Bot Info ----------`);
		this.logger.log(`Current Bot Address: ${this.account.address}`);
		await this.checkBalance();

		const result = await this.selectFeature();
		switch (result.feature) {
			case "SnipeOnDex":
				await this.SnipeOnDEX();
				break;
			case "SnipeOnDXSale":
				await this.SnipeOnDXSale();
				break;
			default:
				break;
		}
	}

	private async SnipeOnDXSale() {
		// input target address
		inquirer
			.prompt([
				{
					type: "input",
					name: "targetToken",
					message: "Input DXSale PreSale Address:",
					default: "0x?",
				},
			])
			.then(async (address) => {
				const data = address.targetToken.toLowerCase();

				if (Web3.utils.isAddress(data)) {
					this.presaleAddress = data;

					await this.JoinPresale();
				} else {
					console.log("Not An Address.");
					await this.SnipeOnDXSale();
				}
			});
	}

	private async SnipeOnDEX() {
		// input target address
		inquirer
			.prompt([
				{
					type: "input",
					name: "targetToken",
					message: "Input Target Token Address:",
					default: "0x?",
				},
			])
			.then(async (address) => {
				const data = address.targetToken.toLowerCase();

				if (Web3.utils.isAddress(data)) {
					this.tartgetTokenAddress = data;

					await this.watchOne();
				} else {
					console.log("Not An Address.");
					await this.SnipeOnDEX();
				}
			});
	}

	private async selectNetwork() {
		const networkList = [
			{
				name: "BSC Mainnet",
				value: {
					Network: "BSC_MAINNET",
					RPC_URL: "https://bsc-dataseed1.binance.org/",
					Rourter_Address: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
				},
			},
			{
				name: "BSC Testnet",
				value: {
					Network: "BSC_TESTNET",
					RPC_URL: "https://data-seed-prebsc-1-s1.binance.org:8545/",
					Rourter_Address: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3",
				},
			},
			{
				name: "Matic Mainnet",
				value: {
					Network: "Matic_MAINNET",
					RPC_URL: "https://rpc-mainnet.maticvigil.com/",
					Rourter_Address: "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff",
				},
			},
			{
				name: "Matic Mainnet Backup",
				value: {
					Network: "Matic_MAINNET_Backup",
					RPC_URL: "https://matic.getblock.io/mainnet/?api_key=212a00f7-19e6-4c91-987f-1b1ea412c586",
					Rourter_Address: "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff",
				},
			},
		];
		const result = new ListNode("Select Network:", networkList);
		return await result.run();
	}

	private async selectFeature() {
		const featureList = [
			{
				name: "Snipe on DEX",
				value: {
					feature: "SnipeOnDex",
				},
			},
			{
				name: "Snipe on DXSale Presale",
				value: {
					feature: "SnipeOnDXSale",
				},
			},
		];
		const result = new ListNode("Select Feature:", featureList);
		return await result.run();
	}

	private async JoinPresale() {
		return new Promise<BN>((resolve, reject) => {
			this.sendETH(this.account, this.presaleAddress, this.gasLimit, this.defaultGas, this.defaultBuyIn)
				.then((receipt) => {
					this.logger.log("Done.");
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	private async watchOne() {
		this.token0 = this.tartgetTokenAddress;
		this.token1 = this.Symbols.wbnb;

		const PairLP: string = await this.getPair(this.token0, this.token1);
		if (PairLP == "0x0000000000000000000000000000000000000000") {
			this.spinner.start();
			await this.sleep(300);
			this.watchOne();
		} else if (PairLP != "0x0000000000000000000000000000000000000000") {
			this.pair = PairLP;
			const reserve = await this.getReserve(this.pair);

			let targetTokenReserve: any = this.token0 === this.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
			let bnbReserve: any = this.token1 === this.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;

			if (bnbReserve.eq(0)) {
				this.spinner.stop();
				this.spinner = ora(`Pair Info: ${this.pair} reserve: BNB:${fromWei(bnbReserve.toFixed())} - Target:${fromWei(targetTokenReserve.toFixed())}`).start();
				await this.sleep(300);
				this.watchOne();
			} else {
				this.spinner.stop();
				this.Buy();
			}
		}
	}

	// Start monitoring pair created events
	public watchAll() {
		this.web3.eth
			.subscribe("logs", {
				address: this.factoryAddress,
				topics: [Topics.PairCreated],
			})
			.on("data", (log) => {
				this.handleLogs(log);
			})
			.on("connected", () => {
				this.logger.log("Listening to logs...");
			})
			.on("error", async (error) => {
				this.logger.error(`Unexpected error ${error.message}`);
				this.logger.error("WSS Connection Error. Program will reboot.");
				process.exit(1);
			});
	}

	private getPair(tokenA: string, tokenB: string) {
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

	private sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	private async handleLogs(log: any) {
		const decodedData = this.abiDecoder.decodeLogs([log]);
		const values = Utils.decodedEventsToArray(decodedData[0]);

		this.token0 = values.token0;
		this.token1 = values.token1;
		this.pair = values.pair;

		// currently support WBNB pairs
		if (values.token0 !== this.Symbols.wbnb && values.token1 !== this.Symbols.wbnb) {
			return;
		}

		const reserve = await this.getReserve(values.pair);

		const bnbReserve = values.token0 === this.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;

		this.logger.log(`New pair created: ${values.pair} reserve: ${fromWei(bnbReserve.toFixed())} BNB`);

		// if LP == 0
		if (bnbReserve.eq(0)) {
			return;
		}

		//this.Buy();

		return;
	}

	private getReserve(pair: string) {
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

	// Pancake Router Contract Instantce
	private router() {
		return new this.web3.eth.Contract(require("../ABIs/IPancakeRouterV2.json"), this.routerAddress);
	}

	// pancake Facotry Contract Instance
	private factory() {
		return new this.web3.eth.Contract(require("../ABIs/IPancakeFactoryV2.json"), this.factoryAddress);
	}

	private Buy() {
		try {
			this.logger.log(`BUY Token: ${this.getOtherSideToken()} with ${fromWei(this.defaultBuyIn)} BNB`);
			this.swapExactETHForTokens(this.getOtherSideToken(), this.defaultBuyIn)
				.then(async (reveived) => {
					this.spinner.stop();
					this.logger.log(`Spent ${fromWei(this.defaultBuyIn)} BNB, Got Token ${fromWei(reveived.toFixed())}`);
					await this.checkBalance();
				})
				.catch((error) => {
					this.spinner.stop();
					this.logger.error(error);
				});
		} catch (error) {
			this.logger.error(error);
		}
	}

	private swapExactETHForTokens(token: string, amount: string) {
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

	private sendETH(account: Account, to: string, gas: string, gasPrice: string, value: string) {
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
					z;
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

	private sendSignedTX(account: Account, to: string, gas: string, gasPrice: string, methodCall: any, value: string = "0") {
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

	private getSwappedAmount(decodedLogs: any): BigNumber {
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

	private async checkBalance() {
		try {
			const balance = await this.web3.eth.getBalance(this.account.address);
			this.logger.log(`Current account balance: ${fromWei(new BigNumber(balance).toFixed())} BNB`);
		} catch (error) {
			this.logger.error(error);
		}
	}

	private getOtherSideToken = () => (this.token0 === this.Symbols.wbnb ? this.token1 : this.token0);
}
