const PaymentProcessor = artifacts.require("PaymentProcessor");
const { shouldFail } = require("openzeppelin-test-helpers");
const { web3tx } = require("./test_common");

contract("PaymentProcessor", accounts => {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const admin = accounts[0];
    const customer1 = accounts[1];
    const customer2 = accounts[2];
    const fundManager = accounts[3];
    const hacker = accounts[9];
    let chainId;
    let pp;

    before(async () => {
        chainId = await web3.eth.net.getId();
        console.log("chainId is", chainId);
        console.log("admin is", admin);
        console.log("customer1 is", customer1);
        console.log("customer2 is", customer2);
        console.log("hacker is", hacker);
    });

    beforeEach(async () => {
        console.log("creating new pp for testing");
        pp = await web3tx(PaymentProcessor.new, "PaymentProcessor.new")(ZERO_ADDRESS);
        console.log(`PaymentProcessor created at ${pp.address}`);
    });

    it("deposit and withdraw ether", async () => {
        await web3tx(pp.setFundManager, "setFundManager")(fundManager,  { from: admin });

        let tx;
        await web3tx(pp.depositEther, "depositEther", {
            inLogs: [{
                name: "EtherDepositReceived",
                args: {
                    orderId: "1",
                    amount: web3.utils.toWei("0.1", "ether"),
                    intermediaryToken: ZERO_ADDRESS,
                    amountBought: "0"
                }
            }]
        })(1, { value: web3.utils.toWei("0.1", "ether"), from: customer1 });

        await web3tx(pp.depositEther, "depositEther", {
            inLogs: [{
                name: "EtherDepositReceived",
                args: {
                    orderId: "2",
                    amount: web3.utils.toWei("0.4", "ether"),
                    intermediaryToken: "0x0000000000000000000000000000000000000000",
                    amountBought: "0"
                }
            }]
        })(2, { value: web3.utils.toWei("0.4", "ether"), from: customer2 });

        shouldFail(pp.withdrawEther(web3.utils.toWei("0.3", "ether"), admin, { from: hacker }));

        let balanceBefore = new web3.utils.BN(await web3.eth.getBalance(admin));
        tx = await web3tx(pp.withdrawEther, "withdrawEther by owner", {
            inLogs: [{
                name: "EtherDepositWithdrawn",
                args: {
                    to: admin,
                    amount: web3.utils.toWei("0.3", "ether")
                }
            }]
        })(web3.utils.toWei("0.3", "ether"), admin, { from: admin });
        let balanceAfter = new web3.utils.BN(await web3.eth.getBalance(admin));
        assert.equal(balanceAfter.sub(balanceBefore).add(tx.txCost).toString(), web3.utils.toWei("0.3", "ether"));

        balanceBefore = new web3.utils.BN(await web3.eth.getBalance(admin));
        tx = await web3tx(pp.withdrawEther, "withdrawEther by fundManger", {
            inLogs: [{
                name: "EtherDepositWithdrawn",
                args: {
                    to: admin,
                    amount: web3.utils.toWei("0.05", "ether")
                }
            }]
        })(web3.utils.toWei("0.05", "ether"), admin, { from: fundManager });
        balanceAfter = new web3.utils.BN(await web3.eth.getBalance(admin));
        assert.equal(balanceAfter.sub(balanceBefore).toString(), web3.utils.toWei("0.05", "ether"));

        assert.equal((await web3.eth.getBalance(pp.address)).toString(), web3.utils.toWei("0.15", "ether"));
    });
});
