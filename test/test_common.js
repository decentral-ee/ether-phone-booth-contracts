const { expectEvent } = require("openzeppelin-test-helpers");

function web3tx(fn, msg, expects = {}) {
    return async function() {
        console.log(msg + ": started");
        let r = await fn.apply(null, arguments);
        let transactionHash, receipt, tx;
        // in case of contract.sendtransaction
        if (r.tx) {
            transactionHash = r.tx;
            receipt = r.receipt;
        }
        // in case of contract.new
        if (r.transactionHash) {
            transactionHash = r.transactionHash;
            receipt = await web3.eth.getTransactionReceipt(transactionHash);
        }

        tx = await web3.eth.getTransaction(transactionHash);
        r.receipt = receipt;

        let cost = web3.utils.toBN(receipt.gasUsed * tx.gasPrice);
        r.txCost = cost;

        // check logs
        if (expects.inLogs) {
            expectEvent.inLogs(receipt.logs, expects.inLogs.name, expects.inLogs.args);
        }

        let gasPrice = web3.utils.fromWei(tx.gasPrice, "gwei");
        console.log(`${msg}: done, gas used ${receipt.gasUsed}, gas price ${gasPrice} Gwei`);
        return r;
    };
}

function wad4human(wad) {
    return Number(web3.utils.fromWei(wad, "ether")).toFixed(4);
}

module.exports = {
    web3tx,
    wad4human
};
