import Ape from "./Ape";
import LoadConfig from "./LoadConfig";
import inquirer from "inquirer";
import We3 from "web3";

// load .env config
new LoadConfig();

const Input = () => {
	inquirer
		.prompt([
			{
				type: "input",
				name: "targetToken",
				message: "Input Target Token Address:",
			},
		])
		.then((address) => {
			const data = address.targetToken.toLowerCase();
			if (We3.utils.isAddress(data)) {
				const ApeKiller = new Ape(data);
			} else {
				console.log("Not An Address.");
				Input();
			}
		});
};

(async () => {
	console.log(`    ___               __ __ _ ____
   /   |  ____  ___  / //_/(_) / /__  _____
  / /| | / __ \/ _ \/ ,<  / / / / _ \/ ___/
 / ___ |/ /_/ /  __/ /| |/ / / /  __/ /
/_/  |_/ .___/\___/_/ |_/_/_/_/\___/_/
      /_/                                  `);
	Input();
})();
