import Web3 from "web3";
import Web3Helper from "../Web3Helper";
import { fromWei, toWei } from "web3-utils";
import { Topics, Reserve } from "../helper/Models";
import Utils from "../helper/Utils";
import Logger from "../helper/Logger";
import inquirer from "inquirer";
import chalk from "chalk";
import Display from "../helper/display";
export default class SnipeNewToken {
	public logger: Logger = new Logger("TokenSniper");
	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public tartgetTokenAddress: string;

	// pair info
	public pair: string;
	public token0: string;
	public token1: string;

	public constructor(public web3: Web3, public web3Helper: Web3Helper) {}

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

	public async displayInfo() {
		this.displayLogo();
		this.logger.log(`Current Bot Address: ${this.web3Helper.account.address}`);
		await this.web3Helper.checkBalance();
	}

	public async SnipeOnDEX() {
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

					Display.setSpinner(chalk.grey("Searching token liquidity..."));
					await this.watchOne();
				} else {
					console.log("Not An Address.");
					await this.SnipeOnDEX();
				}
			});
	}

	public async watchOne() {
		this.token0 = this.tartgetTokenAddress;
		this.token1 = this.web3Helper.Symbols.wbnb;

		const PairLP: string = await this.web3Helper.getPair(this.token0, this.token1);
		if (PairLP == "0x0000000000000000000000000000000000000000") {
			Display.startSpinner();
			await this.sleep(300);
			this.watchOne();
		} else if (PairLP != "0x0000000000000000000000000000000000000000") {
			this.pair = PairLP;
			const reserve = await this.web3Helper.getReserve(this.pair);

			let targetTokenReserve: any = this.token0 === this.web3Helper.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
			let bnbReserve: any = this.token1 === this.web3Helper.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;

			if (bnbReserve.eq(0)) {
				Display.stopSpinner();
				Display.setSpinner(chalk.grey(`Pair Info: ${this.pair} reserve: BNB:${fromWei(bnbReserve.toFixed())} - Target:${fromWei(targetTokenReserve.toFixed())}`));
				Display.startSpinner();
				await this.sleep(300);
				this.watchOne();
			} else {
				Display.stopSpinner();
				this.Buy();
			}
		}
	}

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
