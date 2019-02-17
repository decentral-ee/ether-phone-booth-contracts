const EthSigUtils = require("eth-sig-util");

module.exports = function validateTypedDataSignature(signedTypedData) {
    const recoveredAddress = EthSigUtils.recoverTypedSignature({
        data: signedTypedData.data,
        sig: signedTypedData.sig
    });
    return recoveredAddress.toLowerCase() == signedTypedData.data.message.customer.toLowerCase();
};
