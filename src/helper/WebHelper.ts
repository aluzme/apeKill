import Display from "../helper/Display";

export default class WebHelper {
	public static ping = require("ping");

	public static async testNetworkLantency(RPC_URL: string) {
		return new Promise(async (resolve, reject) => {
			let host = RPC_URL;

			try {
				let res = await this.ping.promise.probe(host);
				resolve(res.avg);
			} catch (error) {
				reject(error);
			}
		});
	}
}
