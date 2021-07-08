import Entry from "./Entry";
import LoadConfig from "./helper/LoadConfig";

// load .env config
new LoadConfig();

(async () => {
	const newEntry = new Entry();
})();
