import Ape from "./Ape";
import LoadConfig from "./LoadConfig";
import We3 from "web3";

// load .env config
new LoadConfig();

(async () => {
	const ApeKiller = new Ape();
})();
