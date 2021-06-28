import Ape from './Ape';
import LoadConfig from "./LoadConfig"

// load .env config
new LoadConfig();

(async () => {
    const ApeKiller = new Ape();
    ApeKiller.run();
})();
