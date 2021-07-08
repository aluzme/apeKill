import chalk from "chalk";
import ora from "ora";

export default class Display {
	private static spinner = ora("DisplayHelperInited.");

	constructor() {}

	public static displayLogo() {
		console.log(
			chalk.green(`    ___               __ __ _ ____
   /   |  ____  ___  / //_/(_) / /__  _____
  / /| | / __ \/ _ \/ ,<  / / / / _ \/ ___/
 / ___ |/ /_/ /  __/ /| |/ / / /  __/ /
/_/  |_/ .___/\___/_/ |_/_/_/_/\___/_/
      /_/                                  \n`)
		);
	}

	public static setSpinner(msg: string) {
		this.spinner = ora(msg);
	}

	public static startSpinner() {
		this.spinner.start();
	}

	public static stopSpinner() {
		this.spinner.stop();
	}
}
