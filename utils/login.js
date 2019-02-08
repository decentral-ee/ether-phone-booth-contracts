const ERC712 = require("./erc712");

const LOGIN_TYPE = [
    {
        type: "address",
        name: "customer"
    },
    {
        type: "uint64",
        name: "loginTimestamp"
    }
];

module.exports = async function login(web3, chainId, boothAddress, customerAddress, loginTimestamp) {
    let domainData = new ERC712.DomainData(
        "EtherPhoneBooth.Login",
        "v1",
        chainId,
        boothAddress,
        "0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406"
    );

    const message = {
        customer: customerAddress,
        loginTimestamp
    };

    const data = {
        types: {
            EIP712Domain: ERC712.DOMAON_TYPE,
            Login: LOGIN_TYPE
        },
        domain: domainData,
        primaryType: "Login",
        message: message
    };

    return await ERC712.signTypedData(web3, customerAddress, data);
};
