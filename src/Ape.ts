import Web3 from "web3";
import { Account, TransactionReceipt, TransactionConfig } from "web3-core";
import { fromWei, toWei } from "web3-utils";
import { Topics, Reserve } from "./Models";
import BN, { BigNumber } from "bignumber.js";
import Utils from "./Utils";
import Logger from "./Logger";
import { throws } from "assert/strict";
import ora from "ora";
import inquirer from "inquirer";

export default class Ape {
	// web3 provider
	private web3: Web3;
	private account: Account;
	private abiDecoder = require("abi-decoder");
	private logger: Logger = new Logger("Ape");

	private pair: string;
	private token0: string;
	private token1: string;

	private routerAddress: string = process.env.NODE_ENV == "development" ? process.env.ROUTER_TEST_ADDRESS : process.env.ROUTER_MAIN_ADDRESS;
	private factoryAddress: string = process.env.NODE_ENV == "development" ? process.env.FACTORY_TEST_ADDRESS : process.env.FACTORY_MAIN_ADDRESS;
	private defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	private tartgetTokenAddress: string;
	private defaultGas = toWei(process.env.GAS_PRICE, "gwei");
	private gasLimit: string = process.env.GAS_LIMIT;
	private Symbols = { wbnb: process.env.WBNB_ADDRESS };
	private spinner = ora("Searching for pair...");

	//private getBlockAPIKEY = "212a00f7-19e6-4c91-987f-1b1ea412c586";
	// private BSC_MAINNET_WS: string = `wss://bsc.getblock.io/mainnet/?api_key={$getBlockAPIKEY}`;
	// private BSC_TEST_WS: string = `wss://bsc.getblock.io/mainnet/?api_key={$getBlockAPIKEY}`;

	private BSC_MAIN_HTTP: string = process.env.WEB3_HTTP_MAINNET_PROVIDER;
	private BSC_TEST_HTTP: string = process.env.WEB3_HTTP_TESTNET_PROVIDER;
	private RPC_URL: string;

	public constructor() {
		inquirer
			.prompt([
				{
					type: "input",
					name: "targetToken",
					message: "Input Target Token Address:",
					default: "0x00a57F51A122f2Bfc6FFe59D86e2f97e9cA61C04",
				},
			])
			.then(async (address) => {
				const data = address.targetToken.toLowerCase();

				if (Web3.utils.isAddress(data)) {
					this.tartgetTokenAddress = data;

					if (process.env.NODE_ENV == "development") {
						this.RPC_URL = this.BSC_TEST_HTTP;
						console.log(this.RPC_URL);
						this.web3 = new Web3(this.RPC_URL);
					} else {
						this.RPC_URL = this.BSC_MAIN_HTTP;
						this.web3 = new Web3(this.RPC_URL);
					}

					this.account = this.web3.eth.accounts.privateKeyToAccount(process.env.ACCOUNT_PK);

					// load ABIs into decoder
					this.abiDecoder.addABI(require("../ABIs/IPancakeFactoryV2.json"));
					this.abiDecoder.addABI(require("../ABIs/IPancakeRouterV2.json"));

					this.logger.log(`Network => ${this.RPC_URL}`);
					this.logger.log(`RouterAddress => ${this.routerAddress}`);
					this.logger.log(`FactoryAddress => ${this.factoryAddress}`);
					this.logger.log(`Target Token: ${this.tartgetTokenAddress}`);
					this.logger.log(`------- Bot Info ----------`);
					this.logger.log(`Current Bot Address => ${this.account.address}`);
					await this.checkBalance();

					this.InputTargetAddress();

					this.watchOne();
				} else {
					console.log("Not An Address.");
				}
			});
	}

	private InputTargetAddress() {}

	public async watchOne() {
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

			targetTokenReserve = fromWei(targetTokenReserve.toFixed());
			bnbReserve = fromWei(bnbReserve.toFixed());

			if (parseInt(bnbReserve) == 0) {
				this.logger.log(`Pair Info: ${this.pair} reserve: BNB:${bnbReserve} - Target:${targetTokenReserve}`);
				await this.sleep(300);
				this.watchOne();
			} else if (parseInt(bnbReserve) > 0) {
				this.logger.log(`Pair Info: ${this.pair} reserve: BNB:${bnbReserve} - Target:${targetTokenReserve}`);
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
				.then((reveived) => {
					this.logger.log(reveived.toString());
				})
				.catch((error) => {
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
					const decodedLogs = this.abiDecoder.decodedLogs(receipt.logs);
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

			const signedTX = await account.signTransaction(tx);

			let TXSubmitted = false;

			this.web3.eth
				.sendSignedTransaction(signedTX.rawTransaction)
				.on("transactionHash", (hash) => {
					TXSubmitted = true;
					this.logger.log(`Txn Hash ${hash} (${fromWei(gasPrice, "gwei")}gwei)`);
				})
				.on("receipt", (receipt) => {
					//this.logger.log(receipt)
				})
				.on("error", async (error) => {
					this.logger.log(error.message);
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
