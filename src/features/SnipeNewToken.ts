import Web3 from "web3";
import Web3Helper from "../Web3Helper";
import { fromWei, toWei } from "web3-utils";
import Logger from "../helper/Logger";
import inquirer from "inquirer";
import chalk from "chalk";
import Display from "../helper/display";
import { Reserve } from "../helper/Models";
import BigNumber from "bignumber.js";
export default class SnipeNewToken {
	public logger: Logger = new Logger("TokenSniper");
	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public tartgetTokenAddress: string;
	public reserveEnter: any;
	public initalReverse: Reserve;

	// pair info
	public pair: string;
	public token0: string;
	public token1: string;

	public constructor(public web3: Web3, public web3Helper: Web3Helper) {}

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
					//this.watchPosition();
					//await this.watchOne();
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
				Display.setSpinner(
					chalk.grey(`Pair Info: ${this.pair} reserve: ${this.web3Helper.SymbolName}:${fromWei(bnbReserve.toFixed())} - Target:${fromWei(targetTokenReserve.toFixed())}`)
				);
				Display.startSpinner();
				await this.sleep(300);
				this.watchOne();
			} else {
				Display.stopSpinner();
				this.Buy();
			}
		}
	}

	public sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	public async Buy() {
		try {
			const reserve = await this.web3Helper.getReserve(this.pair);
			this.reserveEnter = this.getReserveAmount(this.initalReverse).toFixed();

			this.logger.log(`BUY Token: ${this.getOtherSideToken()} with ${fromWei(this.defaultBuyIn)} ${this.web3Helper.SymbolName}`);
			this.web3Helper
				.swapExactETHForTokens(this.getOtherSideToken(), this.defaultBuyIn)
				.then(async (reveived) => {
					Display.stopSpinner();
					this.logger.log(`Spent ${fromWei(this.defaultBuyIn)} ${this.web3Helper.SymbolName}`);
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

	public async watchPosition() {
		const tokenBalance = await this.web3Helper.balanceOf(this.tartgetTokenAddress);
		console.log(`Token Balance: ${fromWei(tokenBalance.toFixed())}`);

		if (tokenBalance.eq(0)) {
			this.logger.error(`0 tokens remaining for ${this.tartgetTokenAddress}`);
			return;
		}

		const reserve = await this.web3Helper.getReserve(this.pair);

		const bnbReserve = this.token0 === this.web3Helper.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
		const bnbReserveRemaining = bnbReserve.multipliedBy(100).dividedBy(this.reserveEnter);
	}

	public Sell() {
		try {
		} catch (error) {}
	}

	public getOtherSideToken = () => (this.token0 === this.web3Helper.Symbols.wbnb ? this.token1 : this.token0);

	private getReserveAmount(reserve: Reserve): BigNumber {
		return this.token0 === this.web3Helper.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
	}
}
