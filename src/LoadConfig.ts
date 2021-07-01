import * as fs from "fs";
import * as dotenv from "dotenv";

export default class LoadConfig {
    constructor() {
        const path = fs.existsSync('config.env') ? 'config.env' : '../config.env';

        if (!fs.existsSync(path)) {
            console.error('config.env file does not exist');
            process.exit(1);
        }

        dotenv.config({
            path,
        });
    }
}
