import Web3 from "web3";
import Web3Helper from "./Web3Helper";
import Logger from "./helper/Logger";
import ListNode from "./helper/ListNode";
import chalk from "chalk";
import DXSalePresale from "./features/DXSalePresale";
import SnipeNewToken from "./features/TokenSniper";
import Display from "./helper/Display";
export default class Entry {
	// web3 provider
	public web3: Web3;
	public logger: Logger = new Logger("Entry");
	public symbolName: string = "BNB";

	public constructor() {
		const { GAS_LIMIT, GAS_PRICE, BUY_IN_AMOUNT, ACCOUNT_PK, PROFIT_MULTIPLIER, AUTO_SELL_PERCENTAGE } = process.env;
		//config guard
		if (GAS_PRICE && GAS_LIMIT && BUY_IN_AMOUNT && ACCOUNT_PK && ACCOUNT_PK.length > 32 && PROFIT_MULTIPLIER && AUTO_SELL_PERCENTAGE) {
			this.Init();
		} else {
			console.log("Please check your config.");
		}
	}

	public async fixBug() {
		setTimeout(() => {
			process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
		}, 1);
	}

	public async Init() {
		// select network‘
		this.fixBug();
		await this.sleep(1);
		const network = await this.selectNetwork();
		this.fixBug();

		let web3: Web3;
		let web3Helper: Web3Helper;

		const { CUSTOMIZE_NETWORK_RPC, CUSTOMIZE_NETWORK_SYMBOL, CUSTOMIZE_DEX_ROUTER } = process.env;

		if (network.Network === "Customize" && CUSTOMIZE_NETWORK_RPC && CUSTOMIZE_NETWORK_SYMBOL && CUSTOMIZE_DEX_ROUTER) {
			web3 = new Web3(process.env.CUSTOMIZE_NETWORK_RPC);
			web3Helper = new Web3Helper(web3);

			web3Helper.setRouterAddr(process.env.CUSTOMIZE_DEX_ROUTER);
			web3Helper.setNetwork(network.Network, process.env.CUSTOMIZE_NETWORK_RPC);
			web3Helper.setSymbolName(process.env.CUSTOMIZE_NETWORK_SYMBOL);
		} else if (network.Network !== "Customize") {
			// set network token symbol
			switch (network.Network) {
				case "BSC_MAINNET":
					this.symbolName = "BNB";
					break;
				case "BSC_TESTNET":
					this.symbolName = "TBNB";
					break;
				case "Matic_MAINNET":
					this.symbolName = "Matic";
				default:
					break;
			}

			web3 = new Web3(network.RPC_URL);
			web3Helper = new Web3Helper(web3);

			web3Helper.setRouterAddr(network.Rourter_Address);
			web3Helper.setNetwork(network.Network, network.RPC_URL);
			web3Helper.setSymbolName(this.symbolName);
		} else {
			Display.setSpinner("Pls check your config.");
			Display.startSpinner();
			await this.sleep(2000);
			process.exit(1);
		}

		await this.sleep(1);
		const result = await this.selectFeature();
		switch (result.feature) {
			case "SnipeOnDex":
				process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
				await web3Helper.displayInfo();
				const NewTokenSniperBot = new SnipeNewToken(web3, web3Helper);
				await NewTokenSniperBot.SnipeOnDEX();
				break;
			case "SnipeOnDXSale":
				process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
				await web3Helper.displayInfo();
				const DXSalePresaleBot = new DXSalePresale(web3, web3Helper);
				await DXSalePresaleBot.SnipeOnDXSale();
				break;
			default:
				break;
		}
	}

	public sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	public async selectNetwork() {
		Display.displayLogo();
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
				name: "Customize Network",
				value: {
					Network: "Customize",
				},
			},
		];
		const result = new ListNode("Select Network:", networkList);
		return await result.run();
	}

	public async selectFeature() {
		Display.displayLogo();
		const featureList = [
			{
				name: "DEX Token Sniper",
				value: {
					feature: "SnipeOnDex",
				},
			},
			{
				name: "DXSale Presale",
				value: {
					feature: "SnipeOnDXSale",
				},
			},
		];
		const result = new ListNode("Select Feature:", featureList);
		return await result.run();
	}
}
