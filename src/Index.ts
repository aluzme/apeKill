import Entry from "./Entry";
import LoadConfig from "./helper/LoadConfig";
import We3 from "web3";

// load .env config
new LoadConfig();

(async () => {
	const newEntry = new Entry();
})();
