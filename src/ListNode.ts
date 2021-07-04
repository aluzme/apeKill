import inquire from "inquirer";

export default class ListNode {
	private title;
	private choices;

	constructor(title: string, choices: any) {
		this.title = title;
		this.choices = choices;
	}

	async run() {
		const { title, choices } = this;
		const { value } = await inquire.prompt([
			{
				type: "list",
				name: "value",
				message: title,
				choices: choices,
			},
		]);

		return value;
	}
}
