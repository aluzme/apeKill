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
import DXSalePresale from "./DXSalePresale";
import SnipeNewToken from "./SnipeNewToken";

export default class Entry {
	// web3 provider
	public web3: Web3;
	public logger: Logger = new Logger("Entry");

	public RPC_URL: string;

	public constructor() {
		this.Init();
	}

	public async fixBug() {
		setTimeout(() => {
			process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
		}, 1);
	}

	public async Init() {
		// select network‘
		this.fixBug();
		await this.sleep(10);
		const network = await this.selectNetwork();
		this.fixBug();
		this.RPC_URL = network.RPC_URL;
		const web3 = new Web3(this.RPC_URL);
		const web3Helper = new Web3Helper(web3);
		web3Helper.setRouterAddr(network.Rourter_Address);

		const result = await this.selectFeature();
		switch (result.feature) {
			case "SnipeOnDex":
				process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
				//await this.displayInfo();
				const NewTokenSniperBot = new SnipeNewToken(web3, web3Helper);
				await NewTokenSniperBot.SnipeOnDEX();
				break;
			case "SnipeOnDXSale":
				process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
				// this.displayInfo();
				const DXSalePresaleBot = new DXSalePresale(web3, web3Helper);
				await DXSalePresaleBot.SnipeOnDXSale();
				break;
			default:
				break;
		}
	}

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

	public sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	public async selectNetwork() {
		this.displayLogo();
		const networkList = [
			{
				name: "BSC Mainnet",
				value: {
					Network: "BSC_MAINNET",
					RPC_URL: "https://bsc-dataseed1.binance.org/",
					Rourter_Address: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
				},
			},
			{
				name: "BSC Testnet",
				value: {
					Network: "BSC_TESTNET",
					RPC_URL: "https://data-seed-prebsc-1-s1.binance.org:8545/",
					Rourter_Address: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3",
				},
			},
			{
				name: "Matic Mainnet",
				value: {
					Network: "Matic_MAINNET",
					RPC_URL: "https://rpc-mainnet.maticvigil.com/",
					Rourter_Address: "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff",
				},
			},
			{
				name: "Matic Mainnet Backup",
				value: {
					Network: "Matic_MAINNET_Backup",
					RPC_URL: "https://matic.getblock.io/mainnet/?api_key=212a00f7-19e6-4c91-987f-1b1ea412c586",
					Rourter_Address: "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff",
				},
			},
		];
		const result = new ListNode("Select Network:", networkList);
		return await result.run();
	}

	public async selectFeature() {
		const featureList = [
			{
				name: "Snipe on DEX",
				value: {
					feature: "SnipeOnDex",
				},
			},
			{
				name: "Snipe on DXSale Presale",
				value: {
					feature: "SnipeOnDXSale",
				},
			},
		];
		const result = new ListNode("Select Feature:", featureList);
		return await result.run();
	}
}
