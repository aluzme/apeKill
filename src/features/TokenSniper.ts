import Web3 from "web3";
import Web3Helper from "../Web3Helper";
import { fromWei, toWei } from "web3-utils";
import Logger from "../helper/Logger";
import inquirer from "inquirer";
import chalk from "chalk";
import Display from "../helper/display";
import { Reserve } from "../helper/Models";
import BigNumber from "bignumber.js";
import InputNode from "../helper/InputNode";
import axios from "axios";
import { type } from "os";
export default class SnipeNewToken {
	public logger: Logger = new Logger("TokenSniper");
	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public tartgetTokenAddress: string;
	public coingeckoSymboID: string;

	// position
	public profitMultiplier = parseInt(process.env.PROFIT_MULTIPLIER);
	public sellPercentage = parseInt(process.env.AUTO_SELL_PERCENTAGE);
	public spent: any;
	public reserveEnter: any;
	public tokenBalance: any;

	// pair info
	public pair: string;

	// contract token info
	public tokenContract: any;
	public tokenName: string = "?";
	public maxTxAmount: string = "?";
	public liquidityFee: string = "?";
	public taxFee: string = "?";

	public constructor(public web3: Web3, public web3Helper: Web3Helper) {
		this.logger.log(`Profit Multiplier: ${chalk.yellow(this.profitMultiplier)} X AutoSellPercentage: ${chalk.yellow(this.sellPercentage)} %`);
		this.setCoingeckoSymbolID();
	}

	public async SnipeOnDEX() {
		// input target address
		const address = await this.inputTargetTokenAddr();

		this.tartgetTokenAddress = address;

		// try to get token contract info
		try {
			this.tokenContract = await this.web3Helper.loadContractfromEtherScan(this.tartgetTokenAddress);
			this.tokenName = await this.tokenContract.methods.name().call();

			this.maxTxAmount = await this.tokenContract.methods._maxTxAmount().call();
			this.liquidityFee = await this.tokenContract.methods._liquidityFee().call();
			this.taxFee = await this.tokenContract.methods._taxFee().call();

			Display.stopSpinner();
			this.logger.log(`Token: ${chalk.white.bold(this.tokenName)} maxTxAmount: ${this.maxTxAmount} liquidityFee: ${this.liquidityFee}% taxFee: ${this.taxFee}%`);
		} catch (error) {
			// allow fail
		}

		// check contract type
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
		// this.token0 = this.tartgetTokenAddress;
		// this.token1 = this.web3Helper.Symbols.wbnb;

		const PairLP: string = await this.web3Helper.getPair(this.tartgetTokenAddress, this.web3Helper.Symbols.wbnb);
		if (PairLP == "0x0000000000000000000000000000000000000000") {
			Display.setSpinner(chalk.grey("Searching token liquidity..."));
			Display.startSpinner();
			await this.sleep(300);
			this.watchOne();
		} else if (PairLP != "0x0000000000000000000000000000000000000000") {
			this.pair = PairLP;
			const reserve = await this.web3Helper.getReserve(this.pair);

			let targetTokenReserve: any = reserve.reserve1;
			let bnbReserve: any = reserve.reserve0;

			if (bnbReserve.eq(0)) {
				Display.stopSpinner();
				Display.setSpinner(
					chalk.grey(
						`Pool Info: ${this.pair} reserve: ${fromWei(bnbReserve.toFixed())} ${this.web3Helper.SymbolName} - ${this.tokenName ?? "?"}:${targetTokenReserve.toFixed()}`
					)
				);
				Display.startSpinner();
				await this.sleep(300);
				this.watchOne();
			} else {
				Display.stopSpinner();
				this.logger.log(`Pool Info: ${fromWei(bnbReserve.toFixed())} ${this.web3Helper.SymbolName} - ${this.tokenName ?? "?"}:${targetTokenReserve.toFixed()}`);
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
			this.reserveEnter = reserve.reserve1.toFixed();

			this.logger.log(`Buy Token: ${this.tartgetTokenAddress} with ${fromWei(this.defaultBuyIn)} ${this.web3Helper.SymbolName}`);
			this.web3Helper
				.swapExactETHForTokens(this.tartgetTokenAddress, this.defaultBuyIn)
				.then(async (reveived) => {
					Display.stopSpinner();
					this.spent = this.defaultBuyIn;
					this.logger.log(`Spent ${fromWei(this.defaultBuyIn)} ${this.web3Helper.SymbolName}`);

					// try to get approved number
					const approvedNum = await this.web3Helper
						.tokenContract(this.tartgetTokenAddress)
						.methods.allowance(this.web3Helper.account.address, this.web3Helper.routerAddress)
						.call();

					this.logger.log(approvedNum);

					// if not approved, approve it.
					if (approvedNum === "0") {
						this.logger.log("Approving Token...");
						await this.web3Helper.approveToRouter(this.tartgetTokenAddress, "-1");
					} else {
						this.logger.log("Token Already Approved.");
					}

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
		this.tokenBalance = await this.web3Helper.balanceOf(this.tartgetTokenAddress);
		if (this.tokenBalance.eq(0)) {
			this.logger.error(`0 tokens remaining for ${this.tartgetTokenAddress}`);
			await this.web3Helper.checkBalance();
			return;
		}
		const reserve = await this.web3Helper.getReserve(this.pair);

		const bnbReserve: BigNumber = reserve.reserve0;

		const bnbReserveRemaining = bnbReserve.multipliedBy(100).dividedBy(this.reserveEnter);

		const tokenO: string = await this.web3Helper.getToken0(this.pair);

		let bnbOut: any;
		if (tokenO.toLowerCase() == this.tartgetTokenAddress.toLowerCase()) {
			bnbOut = await this.web3Helper.getAmountOut(this.tokenBalance, reserve.reserve0, reserve.reserve1);
		} else {
			bnbOut = await this.web3Helper.getAmountOut(this.tokenBalance, reserve.reserve1, reserve.reserve0);
		}

		bnbOut = new BigNumber(bnbOut);

		const profitLoss = bnbOut.minus(this.spent);
		const currentProfitMultipler = profitLoss.dividedBy(this.spent);

		// calc PNL in usd
		let networkTokenPrice,
			pnlInFloat,
			PNL_In_UDS = 0;
		try {
			networkTokenPrice = await this.getNetWorkTokenPriceInUSD(this.coingeckoSymboID);
			pnlInFloat = parseFloat(fromWei(profitLoss.toFixed()));
			PNL_In_UDS = parseFloat(networkTokenPrice.toString()) * pnlInFloat;
		} catch (error) {
			// allow async price fetching fail
		}

		if (bnbReserveRemaining.lte(0.5) && profitLoss.lte(0)) {
			// less than 0.5% of initial BNB reserve remaining - calling it a rug pull
			Display.stopSpinner();
			this.logger.log(`${chalk.white.bgRed.bold("Rug Pulled!!!!")} (BNB reserve: ${bnbReserveRemaining.toFixed(2)}%)`);
			return;
		}

		Display.setSpinnerColor("green");
		Display.setSpinner(
			`Token Balance: ${this.tokenBalance.toFixed()} \tPNL:${profitLoss.gt(0) ? chalk.green(fromWei(profitLoss.toFixed())) : chalk.red(fromWei(profitLoss.toFixed()))} ${
				this.web3Helper.SymbolName
			} ($${PNL_In_UDS == 0 ? "?" : PNL_In_UDS.toFixed(2)}) (${currentProfitMultipler.toFixed(2)}X)`
		);
		Display.startSpinner();
		await this.sleep(1000);

		if (currentProfitMultipler.gt(this.profitMultiplier)) {
			Display.stopSpinner();
			this.logger.log(
				`Token Balance: ${this.tokenBalance.toFixed()} \tPNL:${profitLoss.gt(0) ? chalk.green(fromWei(profitLoss.toFixed())) : chalk.red(fromWei(profitLoss.toFixed()))} ${
					this.web3Helper.SymbolName
				} ($${PNL_In_UDS == 0 ? "?" : PNL_In_UDS.toFixed(2)}) (${currentProfitMultipler.toFixed(2)}X)`
			);
			this.logger.log(
				chalk.green(`Current Profit Multipler:${currentProfitMultipler.toFixed(2)}X. Estimated Profit:${fromWei(profitLoss.toFixed())} ${this.web3Helper.SymbolName}`)
			);
			this.logger.log("Auto Selling Triggered.");
			await this.Sell(this.sellPercentage);
			await this.web3Helper.checkBalance();
			process.exit(1);
		}
		this.watchPosition();
	}

	public async Sell(sellPercentage: number) {
		const token = this.tartgetTokenAddress;

		const sellAmount = new BigNumber(this.tokenBalance).multipliedBy(sellPercentage).dividedBy(100).integerValue();
		try {
			const sold = await this.web3Helper.swapExactTokensForETHSupportingFeeOnTransferTokens(token, sellAmount.toFixed());
			const remainder = await this.web3Helper.balanceOf(token);

			Display.stopSpinner();
			this.logger.log(`Sold ${sellPercentage}% of ${this.tokenName ?? "?"} for ${fromWei(sold.toFixed())} ${this.web3Helper.SymbolName}`);
		} catch (error) {
			Display.stopSpinner();
			this.logger.log(`Error while selling ${this.pair}`);
		}
	}

	public async getNetWorkTokenPriceInUSD(symbolID: string) {
		return new Promise(async (resolve, reject) => {
			let tokenprice: number;
			try {
				const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price/?vs_currencies=usd&ids=${symbolID}`);
				tokenprice = res.data[symbolID].usd;
				resolve(tokenprice);
			} catch (error) {
				reject(error);
			}
		});
	}

	public setCoingeckoSymbolID() {
		switch (this.web3Helper.SymbolName) {
			case "BNB":
			case "TBNB":
				this.coingeckoSymboID = "binancecoin";
				break;
			case "Matic":
				this.coingeckoSymboID = "matic-network";
			default:
				break;
		}
	}
}
