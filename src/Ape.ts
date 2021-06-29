import Web3 from 'web3'
import {fromWei} from 'web3-utils'
import Utils from './Utils'
import {Topics,Symbols,Reserve } from './Models'
import { Console } from 'console';

export default class Ape{

    // web3 provider
    private web3: Web3;
    private routerAddress: string = process.env.ROUTER_ADDRESS;
    private factoryAddress: string = process.env.FACTORY_ADDRESS;
    private defaultGas = process.env.GAS_PRICE;
    private abiDecoder = require('abi-decoder');

    public constructor() {
        this.web3 = new Web3(process.env.WEB3_WS_PROVIDER);

        // load ABIs into decoder
        this.abiDecoder.addABI(require('../ABIs/IPancakeFactoryV2.json'))
        this.abiDecoder.addABI(require('../ABIs/IPancakeRouterV2.json'))

        this.watch();
    }

    // Start monitoring pair created events
    public async watch(){
        this.web3.eth.subscribe('logs',{
            address: this.factoryAddress,
            topics: [Topics.PairCreated],
        })
        .on('data',(log)=>{
            this.handleLogs(log);
        })
        .on('connected',()=>{
            console.log("Listening to logs...")
        })
        .on('error', (error)=>{
            console.error(`Unexpected error ${error.message}`);
            this.watch();
        })
    }

    private async handleLogs(log :any){
        const decodedData = this.abiDecoder.decodeLogs([log]);
        const values = Utils.decodedEventsToArray(decodedData[0]);

        if(values.token0 !== Symbols.wbnb && values.token1 !== Symbols.wbnb){
            return;
        }

        const reserve = await this.getReserve(values.pair);

        const bnbReserve = values.token0 === Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;

        if(bnbReserve.eq(0)){ return; }

        console.log(`New pair created: ${values.pair} BNB reserve: ${fromWei(bnbReserve.toFixed())}`);

    }

    private getReserve(pair :string){
        return new Promise<Reserve>((resolve, reject)=>{
            const PairContract = new this.web3.eth.Contract(require('../ABIs/IPancakePair.json'), pair);
            PairContract.methods.getReserves().call()
                .then((result: any)=>{
                    resolve(new Reserve(result[0], result[1]));
                })
                .catch((error:any)=>{
                    reject(error);
                })
        });
    }

    // Pancake Router Contract Instantce
    private router(){
        return new this.web3.eth.Contract(require('../ABIs/IPancakeRouterV2.json'), this.routerAddress);
    }

    // pancake Facotry Contract Instance
    private factory(){
        return new this.web3.eth.Contract(require('../ABIs/IPancakeFactoryV2.json'), this.routerAddress);
    }
    
}