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
import axios from "axios";
export default class SnipeNewToken {
	public logger: Logger = new Logger("DXPreSale");

	public defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT);
	public presaleAddress: string;

	public presaleStartTime: any = 0;
	public currentTime: any = 0;

	public startBlock: number = 0;
	public currentBlock: number = 0;
	public counter: number = 0;

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
		this.currentBlock = await this.web3.eth.getBlockNumber();

		let blockCountdown = this.startBlock - this.currentBlock;
		let secondCountdown = this.presaleStartTime - this.currentTime;
		let duration = moment.duration(secondCountdown * 1000, "milliseconds");

		await this.getStartBlock();
		Display.setSpinner(
			`Countdown(H:M:S) ${duration.hours() + ":" + duration.minutes() + ":" + duration.seconds()} LastestBlock:${this.currentBlock} TartgetBlock:${
				this.startBlock == 0 ? "?" : this.startBlock
			} Blockleft:${blockCountdown < 0 ? "?" : blockCountdown}`
		);
		Display.startSpinner();
		if (this.currentTime >= this.presaleStartTime) {
			await this.JoinPresale();
		} else {
			await this.sleep(100);
			this.checkTime2Start();
		}
	}

	public async getStartBlock() {
		try {
			const res = await axios.get(
				`https://api.bscscan.com/api?module=block&action=getblocknobytime&timestamp=${this.presaleStartTime}&closest=before&apikey=AXKS8D1723Z6N6VB4D8NE4YH24HYMDSVTK`
			);
			if (res.data.status == 1) {
				this.startBlock = res.data.result;
			}
		} catch (error) {
			// allow fail
		}
	}

	public async JoinPresale() {
		return new Promise<BN>((resolve, reject) => {
			const { account, gasLimit, defaultGas } = this.web3Helper;
			this.web3Helper
				.sendSignedTX(account, this.presaleAddress, gasLimit, defaultGas, "0x", this.defaultBuyIn)
				.then(async (receipt) => {
					Display.stopSpinner();
					this.logger.log("Presale Joined success.");
					Display.setSpinner("Try to claim tokens...");
					Display.startSpinner();
					await this.claimToken();
					Display.stopSpinner();
				})
				.catch(async (error) => {
					reject(error);
				});
		});
	}

	public async claimToken() {
		return new Promise((resolve, reject) => {
			const MethodID = "0x48c54b9d";
			const { account, gasLimit, defaultGas } = this.web3Helper;

			this.web3Helper
				.sendSignedTX(account, this.presaleAddress, gasLimit, defaultGas, MethodID)
				.then((receipt) => {
					this.logger.log("Token Claimed.");
					resolve(receipt);
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

	public getCurrentTime() {
		let date = new Date(); //当前时间
		let month = this.zeroFill(date.getMonth() + 1); //月
		let day = this.zeroFill(date.getDate()); //日
		let hour = this.zeroFill(date.getHours()); //时
		let minute = this.zeroFill(date.getMinutes()); //分
		let second = this.zeroFill(date.getSeconds()); //秒

		//当前时间
		let curTime = date.getFullYear() + "-" + month + "-" + day + " " + hour + ":" + minute;

		return curTime;
	}

	public zeroFill(i: number) {
		if (i >= 0 && i <= 9) {
			return "0" + i;
		} else {
			return i;
		}
	}

	public timeConverter(UNIX_timestamp: number) {
		let a = new Date(UNIX_timestamp * 1000);
		let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		let year = a.getFullYear();
		let month = months[a.getMonth()];
		let date = a.getDate();
		let hour = a.getHours();
		let min = a.getMinutes();
		let sec = a.getSeconds();
		//let time = year + "-" + month + "-" + date + " " + hour + ":" + min + ":" + sec;
		let time = hour + ":" + min + ":" + sec;
		return time;
	}
}
