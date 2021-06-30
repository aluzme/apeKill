import Web3 from 'web3'
import { Account, TransactionReceipt, TransactionConfig } from "web3-core";
import { fromWei, toWei } from 'web3-utils'
import Utils from './Utils'
import { Topics, Symbols, Reserve } from './Models'
import { Console } from 'console';
import BN, { BigNumber } from 'bignumber.js'
import { decode } from 'punycode';

export default class Ape {

    // web3 provider
    private web3: Web3;
    private account: Account;
    private routerAddress: string = process.env.ROUTER_ADDRESS;
    private factoryAddress: string = process.env.FACTORY_ADDRESS;
    private defaultGas = toWei(process.env.GAS_PRICE, 'gwei');
    private abiDecoder = require('abi-decoder');
    private pair: string;
    private token0: string;
    private token1: string;
    private defaultBuyIn = toWei(process.env.BUY_IN_AMOUNT)

    public constructor() {
        this.web3 = new Web3(process.env.WEB3_WS_PROVIDER);
        this.account = this.web3.eth.accounts.privateKeyToAccount(process.env.ACCOUNT_PK);

        // load ABIs into decoder
        this.abiDecoder.addABI(require('../ABIs/IPancakeFactoryV2.json'))
        this.abiDecoder.addABI(require('../ABIs/IPancakeRouterV2.json'))

        this.watch();
    }

    // Start monitoring pair created events
    public async watch() {
        this.web3.eth.subscribe('logs', {
            address: this.factoryAddress,
            topics: [Topics.PairCreated],
        })
            .on('data', (log) => {
                this.handleLogs(log);
            })
            .on('connected', () => {
                console.log("Listening to logs...")
            })
            .on('error', (error) => {
                console.error(`Unexpected error ${error.message}`);
                this.watch();
            })
    }

    private async handleLogs(log: any) {
        const decodedData = this.abiDecoder.decodeLogs([log]);
        const values = Utils.decodedEventsToArray(decodedData[0]);

        this.token0 = values.token0;
        this.token1 = values.token1;
        this.pair = values.pair;

        // currently support WBNB pairs only
        if (values.token0 !== Symbols.wbnb && values.token1 !== Symbols.wbnb) {
            return;
        }

        const reserve = await this.getReserve(values.pair);

        const bnbReserve = values.token0 === Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;

        console.log(`New pair created: ${values.pair} BNB reserve: ${fromWei(bnbReserve.toFixed())}`);

        // if LP == 0
        if (bnbReserve.eq(0)) { return; }

        this.Buy()

        return;

    }

    private getReserve(pair: string) {
        return new Promise<Reserve>((resolve, reject) => {
            const PairContract = new this.web3.eth.Contract(require('../ABIs/IPancakePair.json'), pair);
            PairContract.methods.getReserves().call()
                .then((result: any) => {
                    resolve(new Reserve(result[0], result[1]));
                })
                .catch((error: any) => {
                    reject(error);
                })
        });
    }

    // Pancake Router Contract Instantce
    private router() {
        return new this.web3.eth.Contract(require('../ABIs/IPancakeRouterV2.json'), this.routerAddress);
    }

    // pancake Facotry Contract Instance
    private factory() {
        return new this.web3.eth.Contract(require('../ABIs/IPancakeFactoryV2.json'), this.routerAddress);
    }

    private Buy() {
        try {
            console.log(this.getOtherSideToken(), this.defaultBuyIn);
            this.swapExactETHForTokens(this.getOtherSideToken(), this.defaultBuyIn);
        } catch (error) {
            console.error(error)
        }
    }

    private swapExactETHForTokens(token: string, amount: string) {
        return new Promise<BN>((resolve, reject) => {
            const router = this.router();

            const methodCall = router.methods.swapExactETHForTokens(
                // amountOutMin
                '0',
                // path
                [Symbols.wbnb, token],
                // to address
                this.account.address,
                // deadline
                Math.round(new Date().getTime() / 1000) + 30,
            );

            this.sendSignedTX(this.account, this.routerAddress, '500000', this.defaultGas, methodCall,)
                .then((receipt) => {
                    const decodedLogs = this.abiDecoder.decodedLogs(receipt.logs);
                    const swapped = this.getSwappedAmount(decodedLogs);

                    if (swapped) {
                        resolve(swapped);
                        return;
                    }

                    console.error(`Failed to decode swapped amount for txn ${receipt.transactionHash}`);
                })
                .catch(error => {
                    reject(error);
                })

        })
    }

    private sendSignedTX(account: Account, to: string, gas: string, gasPrice: string, methodCall: any, value: string = '0') {
        return new Promise<TransactionReceipt>(async (resolve, reject) => {
            const encodedABI = methodCall.encodeABI();
            const tx: TransactionConfig = {
                from: account.address,
                to: to,
                gas: gas,
                data: encodedABI,
                value: value,
                gasPrice: gasPrice,
            }

            const signedTX = await account.signTransaction(tx);

            let TXSubmitted = false;

            this.web3.eth.sendSignedTransaction(signedTX.rawTransaction)
                .on('transactionHash', (hash) => {
                    TXSubmitted = true;
                    console.log(`Txn Hash ${hash} (${fromWei(gasPrice, 'gwei')}gwei)`);
                })
                .on('receipt', (receipt) => {
                    //console.log(receipt)
                })
                .on('error', async (error) => {
                    if (!TXSubmitted && error.message.indexOf('') !== -1) {
                        console.log("insufficient funds for gas")
                    }
                });

        })
    }

    private getSwappedAmount(decodedLogs: any): BigNumber {
        let swappedAmount: BigNumber = null;

        decodedLogs.forEach((log: any) => {
            if (log.name !== 'Swap') {
                return;
            }

            const props = Utils.decodedEventsToArray(log);
            swappedAmount = new BigNumber(props.amount0In === '0' ? props.amount0Out : props.amount1Out);
        });

        return swappedAmount;
    }

    private getOtherSideToken = () => (this.token0 === Symbols.wbnb ? this.token1 : this.token0)
}