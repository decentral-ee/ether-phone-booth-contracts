const EtherPhoneBooth = artifacts.require("./EtherPhoneBooth.sol");

module.exports = async (callback) => {
    try {
        let chainId = await web3.eth.net.getId();
        console.log(`deploying...`);
        booth = await EtherPhoneBooth.new(chainId);
        receipt = await web3.eth.getTransactionReceipt(booth.transactionHash);
        console.log(`deployed at ${booth.address}, gas used ${receipt.gasUsed}`);
        callback();
    } catch (err) {
        callback(err);
    }
}
