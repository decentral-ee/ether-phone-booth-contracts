const PaymentProcessor = artifacts.require("./PaymentProcessor.sol");

module.exports = async (callback) => {
    try {
        let receipt;
        let uniswapFactoryAddress, intermediaryTokenAddress;
        let networkType = await web3.eth.net.getNetworkType();
        console.log("deploying...");
        switch (networkType) {
        case "rinkeby":
            // Uniswap Rinkeby Testnet 2: https://hackmd.io/SHPZJPSUTSW8se71CP_TBA#DAI
            uniswapFactoryAddress = "0xf5D915570BC477f9B8D6C0E980aA81757A3AaC36";
            // DAI token
            intermediaryTokenAddress = "0x2448eE2641d78CC42D7AD76498917359D961A783";
            break;
        default:
            uniswapFactoryAddress = "0x0000000000000000000000000000000000000000";
        }
        const pp = await PaymentProcessor.new(uniswapFactoryAddress);
        receipt = await web3.eth.getTransactionReceipt(pp.transactionHash);
        console.log(`PaymentProcessor deployed at ${pp.address}, uniswapFactoryAddress ${uniswapFactoryAddress}, gas used ${Number(receipt.gasUsed)}`);
        if (intermediaryTokenAddress) {
            receipt = await pp.setIntermediaryToken(intermediaryTokenAddress);
            console.log(`PaymentProcessor now uses DAI as intermediary token, gas used ${receipt.gasUsed}`);
        }
        callback();
    } catch (err) {
        callback(err);
    }
};
