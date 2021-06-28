import Web3 from 'web3'

export default class Ape{

    // web3 provider
    private web3: Web3;
    private routerAddress: string = process.env["ROUTER_ADDRESS"];
    private factoryAddress: string = process.env.FACTORY_ADDRESS;
    private defaultGas = process.env.GAS_PRICE;
    

    public constructor() {
        this.web3 = new Web3(process.env.WEB3_WS_PROVIDER);
    }

    private router(){
        return new this.web3.eth.Contract(require('../ABIs/IPancakeRouterV2.json'), this.routerAddress);
    }

    public async run(){
        console.log(await this.router().methods.WETH().call())
    }
}