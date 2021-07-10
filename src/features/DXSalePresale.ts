import Web3 from "web3";
import Web3Helper from "../Web3Helper";
import { fromWei, toWei } from "web3-utils";
import BN, { BigNumber } from "bignumber.js";
import Logger from "../helper/Logger";
import ora from "ora";
import inquirer from "inquirer";
import chalk from "chalk";
import Display from "../helper/display";
import InputNode from "../helper/InputNode";

export default class SnipeNewToken {
	public logger: Logger = new Logger("DXPreSale");

	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public presaleAddress: string;

	public constructor(public web3: Web3, public web3Helper: Web3Helper) {}

	public async SnipeOnDXSale() {
		// input target address
		const address = await this.inputPresaleAddr();
		this.presaleAddress = address;
		await this.JoinPresale();
	}

	public async inputPresaleAddr() {
		const result = new InputNode("Input DXSale PreSale Address:", {
			validate: function (value: any) {
				if (Web3.utils.isAddress(value)) {
					return true;
				}
				return "Input isn't a valid Address";
			},
		});
		return await result.run();
	}

	public async JoinPresale() {
		return new Promise<BN>((resolve, reject) => {
			this.web3Helper
				.sendETH(this.web3Helper.account, this.presaleAddress, this.web3Helper.gasLimit, this.web3Helper.defaultGas, this.defaultBuyIn)
				.then((receipt) => {
					Display.stopSpinner();
					this.logger.log("Done.");
				})
				.catch(async (error) => {
					reject(error);
				});
		});
	}

	public sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}
}
