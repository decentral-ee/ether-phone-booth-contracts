const EIP712 = require("eip712-helpers");

const GRANT_TYPE = [
    {
        type: "address",
        name: "customer"
    },
    {
        type: "uint64",
        name: "txCounter"
    },
    {
        type: "uint256",
        name: "creditBalance"
    },
    {
        type: "uint256",
        name: "approvedAmount"
    },
];

module.exports = async function grant(web3, chainId, boothAddress, customerAddress, txCounter, creditBalance, approvedAmount) {
    let domainData = new EIP712.DomainData(
        "EtherPhoneBooth.Grant",
        "v1",
        chainId,
        boothAddress,
        "0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406"
    );

    const message = {
        customer: customerAddress,
        txCounter: txCounter.toString(),
        creditBalance: creditBalance.toString(),
        approvedAmount: approvedAmount.toString()
    };

    const data = {
        types: {
            EIP712Domain: EIP712.DOMAON_TYPE,
            Grant: GRANT_TYPE
        },
        domain: domainData,
        primaryType: "Grant",
        message: message
    };

    return await EIP712.signTypedData(web3, customerAddress, data);
};
