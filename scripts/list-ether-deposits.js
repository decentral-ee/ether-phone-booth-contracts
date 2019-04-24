const PaymentProcessor = artifacts.require("./PaymentProcessor.sol");

module.exports = async (callback) => {
    try {
        const booth = await PaymentProcessor.at(process.argv[6]);
        const events = await booth.getPastEvents("EtherDepositReceived", {
            filter: {
                orderId: process.argv[7],
            },
            fromBlock: 0
        });
        console.log(events);
    } catch (err) {
        callback(err);
    }
};
