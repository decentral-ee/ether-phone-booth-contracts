const TruffleContract = require("truffle-contract");

module.exports = {
    load: (provider) => {
        let contracts = {
            UniswapFactoryInterface : TruffleContract(require("./build/contracts/UniswapFactoryInterface.json")),
            UniswapExchangeInterface: TruffleContract(require("./build/contracts/UniswapExchangeInterface.json")),
            PaymentProcessor : TruffleContract(require("./build/contracts/PaymentProcessor.json")),
            IERC20 : TruffleContract(require("./build/contracts/IERC20.json"))
        };
        Object.values(contracts).forEach(i => i.setProvider(provider));
        return contracts;
    },
    utils: require("./utils")
};
