const TruffleContract = require("truffle-contract");

module.exports = {
    getContracts: (provider) => {
        let contracts = {
            EtherPhoneBooth : TruffleContract(require("./build/contracts/EtherPhoneBooth.json"))
        };
        Object.values(contracts).forEach(i => i.setProvider(provider));
        return contracts;
    },
    utils: require("./utils")
};
