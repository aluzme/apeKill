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
import moment from "moment";
export default class SnipeNewToken {
	public logger: Logger = new Logger("DXPreSale");

	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public presaleAddress: string;
	public presaleStartTime: any = 0;
	public currentTime: any = 0;

	public constructor(public web3: Web3, public web3Helper: Web3Helper) {
		// input presale start time
		inquirer.registerPrompt("datetime", require("inquirer-datepicker-prompt"));
	}

	public async SnipeOnDXSale() {
		//input presale address
		const address = await this.inputPresaleAddr();
		this.presaleAddress = address;

		let questions = [
			{
				type: "datetime",
				name: "dt",
				message: "When does the presale start?",
				//initial: new Date("2021-07-10 12:30"),
				initial: new Date(this.getCurrentTime()),
				format: ["yyyy", "-", "mm", "-", "dd", " ", "hh", ":", "MM", " ", "TT"],
				time: {
					minutes: {
						interval: 1,
					},
				},
			},
		];

		const answers = await inquirer.prompt(questions);
		this.presaleStartTime = new Date(answers.dt).getTime() / 1000;

		// check shoud we start join presale
		await this.checkTime2Start();
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

	public async checkTime2Start() {
		this.currentTime = new Date().getTime() / 1000;
		Display.setSpinner(`currentTime: ${this.currentTime} presaleStartTime:${this.presaleStartTime}`);
		Display.startSpinner();
		if (this.currentTime >= this.presaleStartTime) {
			await this.JoinPresale();
		} else {
			await this.sleep(100);
			this.checkTime2Start();
		}
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

	public getCurrentTime() {
		var date = new Date(); //当前时间
		var month = this.zeroFill(date.getMonth() + 1); //月
		var day = this.zeroFill(date.getDate()); //日
		var hour = this.zeroFill(date.getHours()); //时
		var minute = this.zeroFill(date.getMinutes()); //分
		var second = this.zeroFill(date.getSeconds()); //秒

		//当前时间
		var curTime = date.getFullYear() + "-" + month + "-" + day + " " + hour + ":" + minute;

		return curTime;
	}

	public zeroFill(i: number) {
		if (i >= 0 && i <= 9) {
			return "0" + i;
		} else {
			return i;
		}
	}
}
