import Ape from "./Ape";
import LoadConfig from "./LoadConfig";
import We3 from "web3";

// load .env config
new LoadConfig();

(async () => {
	console.log(`    ___               __ __ _ ____
   /   |  ____  ___  / //_/(_) / /__  _____
  / /| | / __ \/ _ \/ ,<  / / / / _ \/ ___/
 / ___ |/ /_/ /  __/ /| |/ / / /  __/ /
/_/  |_/ .___/\___/_/ |_/_/_/_/\___/_/
      /_/                                  \n`);
	const ApeKiller = new Ape();
})();
