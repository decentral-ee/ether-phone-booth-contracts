const EtherPhoneBooth = artifacts.require("./EtherPhoneBooth.sol");
const BoothUtils = require("../utils");
const { shouldFail } = require("openzeppelin-test-helpers");

contract("EtherPhoneBooth", accounts => {
    const admin = accounts[0];
    const customer1 = accounts[1];
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
        booth = await EtherPhoneBooth.new(chainId);
        console.log(`booth created at ${booth.address}`, await getTxDetails(booth));
    });

    async function getTxDetails(r) {
        let receipt, tx;
        if (r.tx) {
            receipt = await web3.eth.getTransactionReceipt(r.tx);
            tx = await web3.eth.getTransaction(r.tx);
        }
        if (r.transactionHash) {
            receipt = await web3.eth.getTransactionReceipt(r.transactionHash);
            tx = await web3.eth.getTransaction(r.transactionHash);
        }
        return {
            gasUsed: receipt.gasUsed,
            gasPrice: tx.gasPrice
        };
    }

    // NOTE: single this out in order to make negative tests more reliable
    // Otherwise they might fail by other reasons if never succeeded in good conditions
    const chargeTestAction = (creditBalance, grant, from = admin) => booth.charge(
        web3.utils.toWei("0.05", "ether"),
        customer1,
        grant.data.message.txCounter,
        creditBalance,
        web3.utils.toWei("0.1", "ether"),
        grant.v, grant.r, grant.s, {
            from
        });

    it("regular user flow", async () => {
        let tx;

        console.log("Customer deposits ether");
        tx = await booth.depositCredit({
            from: customer1,
            value: web3.utils.toWei("1", "ether")
        });
        console.log("Ether deposited", await getTxDetails(tx));
        assert.equal(
            (await booth.getCreditBalance.call(customer1)).toString(),
            web3.utils.toWei("1", "ether").toString());

        console.log("Customer deposits more ether");
        tx = await booth.depositCredit({
            from: customer1,
            value: web3.utils.toWei("0.5", "ether")
        });
        console.log("More ether deposited", await getTxDetails(tx));
        assert.equal(
            (await booth.getCreditBalance.call(customer1)).toString(),
            web3.utils.toWei("1.5", "ether").toString());

        console.log("Customer gives new grant to business");
        const txCounter = await booth.getCurrentTxCounter.call({ from: customer1 });
        const creditBalance = await booth.getCreditBalance.call(customer1);
        let grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance, web3.utils.toWei("0.1", "ether"));
        assert.isTrue(BoothUtils.validateSignature(grant));
        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isTrue(await booth.validateChargeRequest.call(
            web3.utils.toWei("0.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));
        console.log("Grant is validated");

        console.log("Business charge customer using the grant");
        let b1 = web3.utils.toBN(await web3.eth.getBalance(admin));
        tx = await chargeTestAction(creditBalance, grant);
        let b2 = web3.utils.toBN(await web3.eth.getBalance(admin));
        let txDetails = await getTxDetails(tx);
        let cost = web3.utils.toBN(txDetails.gasUsed * txDetails.gasPrice);
        console.log("Customer is successfully charged", txDetails);
        console.log(`admin balance changes: b2- b1 + cost = ${b2.sub(b1).add(cost)}`);
        assert.equal(
            b2.sub(b1).add(cost).toString(),
            web3.utils.toWei("0.05", "ether").toString());
        assert.equal(
            (await booth.getCreditBalance.call(customer1)).toString(),
            web3.utils.toWei("1.45", "ether").toString());
    });

    it("Bad charge requests should be invalid", async () => {
        await booth.depositCredit({
            from: customer1,
            value: web3.utils.toWei("1", "ether")
        });
        const txCounter = await booth.getCurrentTxCounter.call({ from: customer1 });
        const creditBalance = await booth.getCreditBalance.call(customer1);
        let grant;

        // business hack: request more than approved
        grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance, web3.utils.toWei("0.1", "ether"));
        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isTrue(await booth.validateChargeRequest.call(
            web3.utils.toWei("0.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));
        assert.isFalse(await booth.validateChargeRequest.call(
            web3.utils.toWei("0.11", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));

        // customer hack: approve more than deposited
        grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance, web3.utils.toWei("1.1", "ether"));
        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isFalse(await booth.validateChargeRequest.call(
            web3.utils.toWei("1.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));

        // customer hack: approve more than deposited
        grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance, web3.utils.toWei("1.1", "ether"));
        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isFalse(await booth.validateChargeRequest.call(
            web3.utils.toWei("1.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));


        // customer hack: txCounter mismatch
        grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter.add(web3.utils.toBN(1)), creditBalance, web3.utils.toWei("0.1", "ether"));
        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isFalse(await booth.validateChargeRequest.call(
            web3.utils.toWei("0.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));


        // customer hack: creditBalance mismatch
        grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance.add(web3.utils.toBN(1)), web3.utils.toWei("0.1", "ether"));
        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isFalse(await booth.validateChargeRequest.call(
            web3.utils.toWei("0.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));
    });

    it("Business should not be able to reuse any grant", async () => {
        await booth.depositCredit({
            from: customer1,
            value: web3.utils.toWei("1", "ether")
        });
        const txCounter = await booth.getCurrentTxCounter.call({ from: customer1 });
        const creditBalance = await booth.getCreditBalance.call(customer1);
        let grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance, web3.utils.toWei("0.1", "ether"));

        await chargeTestAction(creditBalance, grant);

        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isFalse(await booth.validateChargeRequest.call(
            web3.utils.toWei("0.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));
        await shouldFail(chargeTestAction(creditBalance, grant));
    });

    it("Non-owner should not be able to charge customers", async () => {
        await booth.depositCredit({
            from: customer1,
            value: web3.utils.toWei("1", "ether")
        });
        const txCounter = await booth.getCurrentTxCounter.call({ from: customer1 });
        const creditBalance = await booth.getCreditBalance.call(customer1);
        let grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance, web3.utils.toWei("0.1", "ether"));

        assert.isTrue(await booth.validateGrantSignature.call(
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount,
            grant.v, grant.r, grant.s));
        assert.isTrue(await booth.validateChargeRequest.call(
            web3.utils.toWei("0.1", "ether"), // requested amount
            customer1,
            grant.data.message.txCounter,
            grant.data.message.creditBalance,
            grant.data.message.approvedAmount));
        await shouldFail(chargeTestAction(creditBalance, grant, hacker));
    });
});
