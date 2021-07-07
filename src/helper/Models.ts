import BigNumber from "bignumber.js";

export class Reserve {
	public reserve0: BigNumber;
	public reserve1: BigNumber;

	constructor(r0: string, r1: string) {
		this.reserve0 = new BigNumber(r0);
		this.reserve1 = new BigNumber(r1);
	}
}

// pair created event
export const Topics = {
	PairCreated: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
};
