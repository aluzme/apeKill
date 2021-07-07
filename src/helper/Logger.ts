import chalk from "chalk";
export default class Logger {
	constructor(public name: string) {}

	public log(line: string) {
		console.log(chalk.magenta(new Date().toLocaleString()) + " " + `[${this.name}] ${line}`);
	}

	public error(line: string, exception: any = null) {
		console.error(chalk.magenta(new Date().toLocaleString()) + " " + `${this.name}] ${line}`);
		if (exception) {
			console.error(exception);
		}
	}
}
