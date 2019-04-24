const TruffleContract = require("truffle-contract");

module.exports = {
    load: (provider) => {
        let contracts = {
            PaymentProcessor : TruffleContract(require("./build/contracts/PaymentProcessor.json"))
        };
        Object.values(contracts).forEach(i => i.setProvider(provider));
        return contracts;
    },
    utils: require("./utils")
};
