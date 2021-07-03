import Web3 from "web3";
import { Account, TransactionReceipt, TransactionConfig } from "web3-core";
import { fromWei, toWei } from "web3-utils";
import { Topics, Symbols, Reserve } from "./Models";
import BN, { BigNumber } from "bignumber.js";
import Utils from "./Utils";
import Logger from "./Logger";
import { throws } from "assert/strict";
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
	private tartgetTokenAddress: string = process.env.TARGET_TOKEN_TOBUY;
	private defaultGas = toWei(process.env.GAS_PRICE, "gwei");
	private gasLimit: string = process.env.GAS_LIMIT;

	private getBlockAPIKEY = "212a00f7-19e6-4c91-987f-1b1ea412c586";
	private BSC_MAINNET_WS: string = `wss://bsc.getblock.io/mainnet/?api_key={$getBlockAPIKEY}`;
	private BSC_TEST_WS: string = `wss://bsc.getblock.io/mainnet/?api_key={$getBlockAPIKEY}`;

	private BSC_TEST_HTTP: string = "https://data-seed-prebsc-1-s1.binance.org:8545/";

	public constructor() {
		if (process.env.NODE_ENV == "development") {
			this.web3 = new Web3(this.BSC_TEST_HTTP);
		} else {
			this.web3 = new Web3(this.BSC_MAINNET_WS);
		}

		this.account = this.web3.eth.accounts.privateKeyToAccount(process.env.ACCOUNT_PK);

		// load ABIs into decoder
		this.abiDecoder.addABI(require("../ABIs/IPancakeFactoryV2.json"));
		this.abiDecoder.addABI(require("../ABIs/IPancakeRouterV2.json"));

		this.logger.log(`ENV => ${process.env.NODE_ENV}`);
		this.logger.log(`Current Bot Address => ${this.account.address}`);
		this.logger.log(`routerAddress => ${this.routerAddress}`);
		this.logger.log(`factoryAddress => ${this.factoryAddress}`);
		this.logger.log(`Target Token: ${this.tartgetTokenAddress}`);

		this.watchOne();
		this.checkBalance();
	}

	public async watchOne() {
		this.token0 = this.tartgetTokenAddress;
		this.token1 = Symbols.wbnb;

		const PairLP: string = await this.getPair(this.token0, this.token1);
		if (PairLP == "0x0000000000000000000000000000000000000000") {
			this.logger.log("Searching for pair...");
			await this.sleep(300);
			this.watchOne();
		} else if (PairLP != "0x0000000000000000000000000000000000000000") {
			this.pair = PairLP;
			const reserve = await this.getReserve(this.pair);
			let bnbReserve: any = this.token1 === Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
			bnbReserve = fromWei(bnbReserve.toFixed());
			if (bnbReserve == 0) {
				this.logger.log(`Pair Info: ${this.pair} reserve: ${bnbReserve} BNB`);
				await this.sleep(300);
				this.watchOne();
			} else if (bnbReserve >= 0) {
				this.logger.log(`Pair Info: ${this.pair} reserve: ${bnbReserve} BNB`);
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
		if (values.token0 !== Symbols.wbnb && values.token1 !== Symbols.wbnb) {
			return;
		}

		const reserve = await this.getReserve(values.pair);

		const bnbReserve = values.token0 === Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;

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
			this.logger.log(`BUY Token: ${this.getOtherSideToken()} with ${fromWei(this.defaultBuyIn)} wei BNB`);
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
				[Symbols.wbnb, token],
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

		setTimeout(() => {
			this.checkBalance();
		}, 60 * 1000);
	}

	private getOtherSideToken = () => (this.token0 === Symbols.wbnb ? this.token1 : this.token0);
}
