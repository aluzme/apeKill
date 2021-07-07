import Web3 from "web3";
import Web3Helper from "./Web3Helper";
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
import chalk from "chalk";

export default class SnipeNewToken {
	public logger: Logger = new Logger("Entry");

	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public presaleAddress: string;

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

	public async SnipeOnDXSale() {
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

	public async JoinPresale() {
		return new Promise<BN>((resolve, reject) => {
			this.web3Helper
				.sendETH(this.web3Helper.account, this.presaleAddress, this.web3Helper.gasLimit, this.web3Helper.defaultGas, this.defaultBuyIn)
				.then((receipt) => {
					this.logger.log("Done.");
				})
				.catch((error) => {
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
