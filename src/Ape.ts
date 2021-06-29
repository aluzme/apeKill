import Web3 from 'web3'


export default class Ape{

    // web3 provider
    private web3: Web3;
    private routerAddress: string = process.env["ROUTER_ADDRESS"];
    private factoryAddress: string = process.env.FACTORY_ADDRESS;
    private defaultGas = process.env.GAS_PRICE;


    // pair created event
    private Topics = {
        PairCreated: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9',
    };
    

    public constructor() {
        this.web3 = new Web3(process.env.WEB3_WS_PROVIDER);
        this.watch();
    }

    private router(){
        return new this.web3.eth.Contract(require('../ABIs/IPancakeRouterV2.json'), this.routerAddress);
    }

    public async watch(){
        this.web3.eth.subscribe('logs',{
            address: this.factoryAddress,
            topics: [this.Topics.PairCreated],
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

    private async handleLogs(logs: any){
        console.log(logs);
    }
}