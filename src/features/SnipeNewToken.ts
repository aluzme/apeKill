import Web3 from "web3";
import Web3Helper from "../Web3Helper";
import { fromWei, toWei } from "web3-utils";
import Logger from "../helper/Logger";
import inquirer from "inquirer";
import chalk from "chalk";
import Display from "../helper/display";
import { Reserve } from "../helper/Models";
import BigNumber from "bignumber.js";
import Pricer from "../helper/Pricer";
import InputNode from "../helper/InputNode";
import axios from "axios";
export default class SnipeNewToken {
	public logger: Logger = new Logger("TokenSniper");
	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public tartgetTokenAddress: string;

	public spent: any;
	public reserveEnter: any;

	// pair info
	public pair: string;
	public token0: string;
	public token1: string;

	public tokenContract: any;
	public tokenName: string = "?";
	public maxTxAmount: string = "?";
	public liquidityFee: string = "?";
	public taxFee: string = "?";

	public constructor(public web3: Web3, public web3Helper: Web3Helper) {}

	public async SnipeOnDEX() {
		// input target address
		const address = await this.inputTargetTokenAddr();

		this.tartgetTokenAddress = address;

		try {
			this.tokenContract = await this.web3Helper.loadContractfromEtherScan(this.tartgetTokenAddress);
			this.tokenName = await this.tokenContract.methods.name().call();

			this.maxTxAmount = await this.tokenContract.methods._maxTxAmount().call();
			this.liquidityFee = await this.tokenContract.methods._liquidityFee().call();
			this.taxFee = await this.tokenContract.methods._taxFee().call();

			Display.stopSpinner();
			this.logger.log(`Token: ${this.tokenName} maxTxAmount: ${this.maxTxAmount} liquidityFee: ${this.liquidityFee}% taxFee: ${this.taxFee}%`);
		} catch (error) {}

		if (this.maxTxAmount != "?") {
			Display.stopSpinner();
			this.logger.log(`Contract Type: ${chalk.blue.bold("Safemoon Clone")}`);
		}

		await this.watchOne();
	}

	public async inputTargetTokenAddr() {
		const result = new InputNode("Input Target Token Address:", {
			validate: function (value: any) {
				if (Web3.utils.isAddress(value)) {
					return true;
				}
				return "Input isn't a valid Address";
			},
		});
		return await result.run();
	}

	public async watchOne() {
		this.token0 = this.tartgetTokenAddress;
		this.token1 = this.web3Helper.Symbols.wbnb;

		const PairLP: string = await this.web3Helper.getPair(this.token0, this.token1);
		if (PairLP == "0x0000000000000000000000000000000000000000") {
			Display.setSpinner(chalk.grey("Searching token liquidity..."));
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
					chalk.grey(`Pair Info: ${this.pair} reserve: ${fromWei(bnbReserve.toFixed())} ${this.web3Helper.SymbolName} - Target:${fromWei(targetTokenReserve.toFixed())}`)
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
			this.reserveEnter = this.getReserveAmount(reserve).toFixed();

			this.logger.log(`Buy Token: ${this.getOtherSideToken()} with ${fromWei(this.defaultBuyIn)} ${this.web3Helper.SymbolName}`);
			this.web3Helper
				.swapExactETHForTokens(this.getOtherSideToken(), this.defaultBuyIn)
				.then(async (reveived) => {
					Display.stopSpinner();
					this.spent = this.defaultBuyIn;
					this.logger.log(`Spent ${fromWei(this.defaultBuyIn)} ${this.web3Helper.SymbolName}`);
					await this.web3Helper.checkBalance();
					await this.watchPosition();
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

		if (tokenBalance.eq(0)) {
			this.logger.error(`0 tokens remaining for ${this.tartgetTokenAddress}`);
			return;
		}

		const reserve = await this.web3Helper.getReserve(this.pair);

		const bnbReserve = this.token0 === this.web3Helper.Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
		const bnbReserveRemaining = bnbReserve.multipliedBy(100).dividedBy(this.reserveEnter);

		const bnbOut = Pricer.getOutGivenIn(
			reserve,
			this.token0 === this.web3Helper.Symbols.wbnb ? new BigNumber(0) : tokenBalance,
			this.token0 === this.web3Helper.Symbols.wbnb ? tokenBalance : new BigNumber(0)
		);

		const profitLoss = bnbOut.minus(this.spent);

		if (bnbReserveRemaining.lte(0.5) && profitLoss.lte(0)) {
			// less than 0.5% of initial BNB reserve remaining - calling it a rug pull
			Display.stopSpinner();
			this.logger.log(`${chalk.white.bgRed.bold("Rug Pulled!!!!")} (BNB reserve: ${bnbReserveRemaining.toFixed(2)}%)`);
			return;
		}

		Display.setSpinnerColor("green");
		Display.setSpinner(
			`Token Balance: ${fromWei(tokenBalance.toFixed())} \tPNL:${
				profitLoss.gt(0) ? chalk.green.bgWhite(fromWei(profitLoss.toFixed())) : chalk.red.bgWhite(fromWei(profitLoss.toFixed()))
			} ${this.web3Helper.SymbolName}`
		);
		Display.startSpinner();
		await this.sleep(300);
		this.watchPosition();
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
