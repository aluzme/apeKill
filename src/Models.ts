import BigNumber from "bignumber.js";

export class Reserve {
    public reserve0: BigNumber;
    public reserve1: BigNumber;

    constructor(r0: string, r1: string) {
        this.reserve0 = new BigNumber(r0);
        this.reserve1 = new BigNumber(r1);
    }
}

export const Symbols = {
    //wbnb: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // mainnet
    wbnb: '0xae13d989dac2f0debff460ac112a837c89baa7cd', // testnet
}

// pair created event
export const Topics = {
    PairCreated: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9',
};