const EtherPhoneBooth = artifacts.require("./EtherPhoneBooth.sol");
const BoothUtils = require("../utils");
const { shouldFail } = require("openzeppelin-test-helpers");
const { web3tx } = require("./test_common");

contract("EtherPhoneBooth", accounts => {
    const admin = accounts[0];
    const customer1 = accounts[1];
    const customer2 = accounts[2];
    const customer3 = accounts[2];
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

    // async function getTxDetails(r) {
    //     let receipt, tx;
    //     if (r.tx) {
    //         receipt = await web3.eth.getTransactionReceipt(r.tx);
    //         tx = await web3.eth.getTransaction(r.tx);
    //     }
    //     if (r.transactionHash) {
    //         receipt = await web3.eth.getTransactionReceipt(r.transactionHash);
    //         tx = await web3.eth.getTransaction(r.transactionHash);
    //     }
    //     let cost = web3.utils.toBN(receipt.gasUsed * tx.gasPrice);
    //     return {
    //         tx,
    //         receipt,
    //         gasUsed: receipt.gasUsed,
    //         gasPrice: tx.gasPrice,
    //         cost
    //     };
    // }

    // NOTE: single this out in order to make negative tests more reliable
    // Otherwise they might fail by other reasons if never succeeded in good conditions
    const chargeTestAction = (creditBalance, grant, from = admin) => web3tx(booth.charge, "booth.charge")(
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
        tx = await web3tx(booth.depositCredit, "booth.depositCredit")({
            from: customer1,
            value: web3.utils.toWei("1", "ether")
        });
        assert.equal(
            (await booth.getCreditBalance.call(customer1)).toString(),
            web3.utils.toWei("1", "ether").toString());

        console.log("Customer deposits more ether");
        tx = await web3tx(booth.depositCredit, "booth.depositCredit")({
            from: customer1,
            value: web3.utils.toWei("0.5", "ether")
        });
        assert.equal(
            (await booth.getCreditBalance.call(customer1)).toString(),
            web3.utils.toWei("1.5", "ether").toString());

        console.log("Customer gives new grant to business");
        const txCounter = await booth.getCurrentTxCounter.call({ from: customer1 });
        const creditBalance = await booth.getCreditBalance.call(customer1);
        let grant = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter, creditBalance, web3.utils.toWei("0.1", "ether"));
        assert.isTrue(BoothUtils.validateTypedDataSignature(grant));
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
        console.log("Customer is successfully charged");
        console.log(`admin balance changes: b2- b1 + cost = ${b2.sub(b1).add(tx.txCost)}`);
        assert.equal(
            b2.sub(b1).add(tx.txCost).toString(),
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

    it("Business should be able to batch charges", async () => {
        await booth.depositCredit({
            from: customer1,
            value: web3.utils.toWei("1", "ether")
        });
        const txCounter1 = await booth.getCurrentTxCounter.call({ from: customer1 });
        const creditBalance1 = await booth.getCreditBalance.call(customer1);
        const grant1Amount = web3.utils.toWei("0.1", "ether");
        let grant1 = await BoothUtils.grant(web3, chainId, booth.address, customer1, txCounter1, creditBalance1, grant1Amount);

        await booth.depositCredit({
            from: customer2,
            value: web3.utils.toWei("1", "ether")
        });
        const txCounter2 = await booth.getCurrentTxCounter.call({ from: customer2 });
        const creditBalance2 = await booth.getCreditBalance.call(customer2);
        const grant2Amount = web3.utils.toWei("0.2", "ether");
        let grant2 = await BoothUtils.grant(web3, chainId, booth.address, customer2, txCounter2, creditBalance2, grant2Amount);

        let b1 = web3.utils.toBN(await web3.eth.getBalance(admin));
        let tx = await web3tx(booth.batchCharge, "booth.batchCharge")(
            [web3.utils.toWei("0.05", "ether"), web3.utils.toWei("0.06", "ether"), web3.utils.toWei("100", "ether")],
            [customer1, customer2, customer3, ],
            [grant1.data.message.txCounter, grant2.data.message.txCounter, 0],
            [creditBalance1, creditBalance2, "0"],
            [grant1Amount, grant2Amount, "0"],
            [grant1.v, grant2.v, 0], [grant1.r, grant2.r, "0x0"], [grant1.s, grant2.s, "0x0"], {
                from: admin
            });
        let b2 = web3.utils.toBN(await web3.eth.getBalance(admin));
        assert.equal(tx.receipt.logs[0].event, "CustomerCharged");
        assert.equal(tx.receipt.logs[0].args.customer, customer1);
        assert.equal(tx.receipt.logs[1].event, "CustomerCharged");
        assert.equal(tx.receipt.logs[1].args.customer, customer2);
        assert.equal(
            b2.sub(b1).add(tx.txCost).toString(),
            web3.utils.toWei("0.11", "ether").toString());
        assert.equal(
            (await booth.getCreditBalance.call(customer1)).toString(),
            web3.utils.toWei("0.95", "ether").toString());
        assert.equal(
            (await booth.getCreditBalance.call(customer2)).toString(),
            web3.utils.toWei("0.94", "ether").toString());
    });
});
