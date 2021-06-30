import Ape from './Ape';
import LoadConfig from "./LoadConfig"
import Inquirer from 'inquirer'

// load .env config
new LoadConfig();

(async () => {

    let targetAddress;

    Inquirer.prompt([{
        type: "input",
        message: "Input the token address to fuck:",
        name: "address",
        default: "0x0000"
    }]).then(anwsers => {
        targetAddress = anwsers;
        const ApeKiller = new Ape(targetAddress);
    }).catch(error => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
            console.log(error)
        } else {
            // Something else went wrong
            console.log(error)
        }
    })
})();
