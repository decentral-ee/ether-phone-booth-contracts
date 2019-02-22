const EtherPhoneBooth = artifacts.require("./EtherPhoneBooth.sol");
const { shouldFail } = require("openzeppelin-test-helpers");
const { web3tx } = require("./test_common");

contract("EtherPhoneBooth", accounts => {
    const admin = accounts[0];
    const customer1 = accounts[1];
    const customer2 = accounts[2];
    const hacker = accounts[9];
    let chainId;
    let booth;

    before(async () => {
        chainId = await web3.eth.net.getId();
        console.log("chainId is", chainId);
        console.log("customer1 is", customer1);
        console.log("admin is", admin);
    });

    beforeEach(async () => {
        console.log("creating new booth for testing");
        booth = await web3tx(EtherPhoneBooth.new, "EtherPhoneBooth.new")(chainId);
        console.log(`booth created at ${booth.address}`);
    });

    it("deposit and withdraw ether", async () => {
        await web3tx(booth.depositEther, "depositEther", {
            inLogs: [{
                name: "EtherDepositReceived",
                args: {
                    orderId: "1",
                    amount: web3.utils.toWei("0.1", "ether")
                }
            }]
        })(1, { value: web3.utils.toWei("0.1", "ether"), from: customer1 });
        await web3tx(booth.depositEther, "depositEther", {
            inLogs: [{
                name: "EtherDepositReceived",
                args: {
                    orderId: "2",
                    amount: web3.utils.toWei("0.2", "ether")
                }
            }]
        })(2, { value: web3.utils.toWei("0.2", "ether"), from: customer2 });
        shouldFail(booth.withdrawEther(web3.utils.toWei("0.3", "ether"), { from: hacker }));
        const balanceBefore = new web3.utils.BN(await web3.eth.getBalance(admin));
        let tx = await web3tx(booth.withdrawEther, "withdrawEther", {
            inLogs: [{
                name: "EtherDepositWithdrawn",
                args: {
                    owner: admin,
                    amount: web3.utils.toWei("0.3", "ether")
                }
            }]
        })(web3.utils.toWei("0.3", "ether"), { from: admin });
        const balanceAfter = new web3.utils.BN(await web3.eth.getBalance(admin));
        assert.equal(balanceAfter.sub(balanceBefore).add(tx.txCost).toString(), web3.utils.toWei("0.3", "ether"));
    });
});
