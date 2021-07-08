import Web3 from "web3";
import Web3Helper from "../Web3Helper";
import { fromWei, toWei } from "web3-utils";
import { Topics, Reserve } from "../helper/Models";
import Utils from "../helper/Utils";
import Logger from "../helper/Logger";
import chalk from "chalk";
import Display from "../helper/display";
export default class SnipeMultiTokens {
	public logger: Logger = new Logger("TokenSniper");
	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public tartgetTokenAddress: string;

	// pair info
	public pair: string;
	public token0: string;
	public token1: string;

	public constructor(public web3: Web3, public web3Helper: Web3Helper) {}

	// Start monitoring pair created events
	public watchAll() {
		this.web3.eth
			.subscribe("logs", {
				address: this.web3Helper.factoryAddress,
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

	public sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	public async handleLogs(log: any) {
		const decodedData = this.web3Helper.abiDecoder.decodeLogs([log]);
		const values = Utils.decodedEventsToArray(decodedData[0]);

		this.token0 = values.token0;
		this.token1 = values.token1;
		this.pair = values.pair;

		// currently support WBNB pairs
		if (values.token0 !== this.web3Helper.Symbols.wbnb && values.token1 !== this.web3Helper.Symbols.wbnb) {
			return;
		}

		const reserve = await this.web3Helper.getReserve(values.pair);

		const bnbReserve = values.token0 === this.web3Helper.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;

		this.logger.log(`New pair created: ${values.pair} reserve: ${fromWei(bnbReserve.toFixed())} BNB`);

		// if LP == 0
		if (bnbReserve.eq(0)) {
			return;
		}

		//this.Buy();

		return;
	}

	public Buy() {
		try {
			this.logger.log(`BUY Token: ${this.getOtherSideToken()} with ${fromWei(this.defaultBuyIn)} BNB`);
			this.web3Helper
				.swapExactETHForTokens(this.getOtherSideToken(), this.defaultBuyIn)
				.then(async (reveived) => {
					Display.stopSpinner();
					this.logger.log(`Spent ${fromWei(this.defaultBuyIn)} BNB`);
					await this.web3Helper.checkBalance();
				})
				.catch((error) => {
					Display.stopSpinner();
					this.logger.error(error);
				});
		} catch (error) {
			this.logger.error(error);
		}
	}

	public getOtherSideToken = () => (this.token0 === this.web3Helper.Symbols.wbnb ? this.token1 : this.token0);
}
