import inquire from "inquirer";

export default class InputNode {
	public title: string;
	public config: any;

	constructor(title: string, config?: any) {
		this.title = title;
		this.config = config || {};
	}

	async run() {
		const { title, config } = this;
		const { value } = await inquire.prompt([
			{
				type: "input",
				name: "value",
				message: title,
				validate: config.validate,
			},
		]);

		return value;
	}
}

module.exports = InputNode;
