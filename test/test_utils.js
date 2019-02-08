const BoothUtils = require("../utils");

contract("BoothUtils", accounts => {

    const customer1 = accounts[1];
    let chainId;

    function getCurrentTimestamp() {
        return (new Date()).getTime();
    }

    before(async () => {
        chainId = await web3.eth.net.getId();
        console.log("chainId is", chainId);
        console.log("customer1 is", customer1);
    });

    it("regular login flow", async () => {
        let signedTypedData = await BoothUtils.login(web3, chainId, "0x0", customer1, getCurrentTimestamp());
        assert.isTrue(BoothUtils.validateSignature(signedTypedData));
    });

    it("login should fail with tempered data", async () => {
        let signedTypedData = await BoothUtils.login(web3, chainId, "0x0", customer1, getCurrentTimestamp());
        signedTypedData.data.message.loginTimestamp += 1;
        assert.isFalse(BoothUtils.validateSignature(signedTypedData));
    });
});
