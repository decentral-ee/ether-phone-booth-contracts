const PaymentProcessor = artifacts.require("PaymentProcessor");
const ERC20Mintable = artifacts.require("ERC20Mintable");
const { UniswapFactory, UniswapExchange } = require("../uniswap");
const { expectRevert } = require("openzeppelin-test-helpers");
const { web3tx, toWad } = require("@decentral.ee/web3-test-helpers");

const ComptrollerMock = artifacts.require("ComptrollerMock");
const InterestRateModelMock = artifacts.require("InterestRateModelMock");
const CErc20 = artifacts.require("CErc20");
const CompoundAllocationStrategy = artifacts.require("CompoundAllocationStrategy");
const RToken = artifacts.require("RToken");
const Proxy = artifacts.require("Proxy");

contract("PaymentProcessor", accounts => {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const MAX_DEADLINE = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
    const admin = accounts[0];
    const customer1 = accounts[1];
    const customer2 = accounts[2];
    const fundManager = accounts[3];
    const depositAgent = accounts[4];
    const hacker = accounts[9];
    let chainId;
    let uniswapFactory;
    let pp;

    //rToken variables
    let underlyingToken;
    let cToken;
    let compoundAS;
    let rToken;
    let rTokenLogic;
    let SELF_HAT_ID;

    async function createCompoundAllocationStrategy(cTokenExchangeRate) {
        const comptroller = await web3tx(ComptrollerMock.new, "ComptrollerMock.new")({ from: admin });
        const interestRateModel = await web3tx(InterestRateModelMock.new, "InterestRateModelMock.new")({ from: admin });
        const cToken = await web3tx(CErc20.new, "CErc20.new")(
            underlyingToken.address,
            comptroller.address,
            interestRateModel.address,
            cTokenExchangeRate, // 1 cToken == cTokenExchangeRate * token
            "Compound token",
            "cToken",
            18, {
                from: admin
            });
        const compoundAS = await web3tx(CompoundAllocationStrategy.new, "CompoundAllocationStrategy.new")(
            cToken.address, {
                from: admin
            }
        );
        return { cToken, compoundAS };
    }


    before(async () => {
        chainId = await web3.eth.net.getId();
        console.log("chainId is", chainId);
        console.log("admin is", admin);
        console.log("customer1 is", customer1);
        console.log("customer2 is", customer2);
        console.log("hacker is", hacker);
        UniswapFactory.setProvider(web3.currentProvider);
        UniswapExchange.setProvider(web3.currentProvider);
    });

    beforeEach(async () => {
        // setup uniswap
        const exchangeTemplate = await web3tx(UniswapExchange.new, "UniswapExchange.new")({ from: admin });
        uniswapFactory = await web3tx(UniswapFactory.new, "UniswapFactory.new")({ from: admin });
        await web3tx(uniswapFactory.initializeFactory, "uniswapFactory.initializeFactory")(exchangeTemplate.address, { from: admin });

        console.log("creating new pp for testing");
        pp = await web3tx(PaymentProcessor.new, "PaymentProcessor.new")(uniswapFactory.address, { from: admin });
        console.log(`PaymentProcessor created at ${pp.address}`);

        await web3tx(pp.setFundManager, "setFundManager")(fundManager,  { from: admin });
        await web3tx(pp.setDepositAgent, "setDepositAgent")(depositAgent,  { from: admin });

        //setup rToken
        underlyingToken = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({ from: admin });
        await web3tx(underlyingToken.mint, "token.mint 1000 -> customer1")(customer1, toWad(1000), { from: admin });

        const result = await createCompoundAllocationStrategy(toWad(.1));
        cToken = result.cToken;
        compoundAS = result.compoundAS;

        // Deploy the rToken logic/library contract
        rTokenLogic = await web3tx(RToken.new, "RToken.new")(
            {
                from: admin
            });
        // Get the init code for rToken
        const rTokenConstructCode = rTokenLogic.contract.methods.initialize(
            compoundAS.address,
            "RToken Test",
            "RTOKEN",
            18).encodeABI();

        // Deploy the Proxy, using the init code for rToken
        const proxy = await web3tx(Proxy.new, "Proxy.new")(
            rTokenConstructCode, rTokenLogic.address, {
                from: admin
            });
        // Create the rToken object using the proxy address
        rToken = await RToken.at(proxy.address);

        await web3tx(compoundAS.transferOwnership, "compoundAS.transferOwnership")(rToken.address);
        SELF_HAT_ID = await rToken.SELF_HAT_ID.call();
    });

    it("deposit and withdraw ether", async () => {
        let tx;
        await web3tx(pp.depositEther, "depositEther", {
            inLogs: [{
                name: "EtherDepositReceived",
                args: {
                    orderId: "1",
                    depositor: customer1,
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
                    depositor: customer2,
                    amount: web3.utils.toWei("0.4", "ether"),
                    intermediaryToken: "0x0000000000000000000000000000000000000000",
                    amountBought: "0"
                }
            }]
        })(2, { value: web3.utils.toWei("0.4", "ether"), from: customer2 });

        expectRevert(
            pp.withdrawEther(web3.utils.toWei("0.3", "ether"), admin, { from: hacker }),
            "Only fund manager allowed");

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

    it("deposit and withdraw token", async () => {
        // create token A
        const tokenA = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({ from: admin});
        await web3tx(uniswapFactory.createExchange, "uniswapFactory.createExchange")(tokenA.address, { from: admin });
        const exchangeAddressA = await uniswapFactory.getExchange.call(tokenA.address);
        console.log("exchange A created at: ", exchangeAddressA);
        const exchangeA = await UniswapExchange.at(exchangeAddressA);
        await web3tx(tokenA.mint, "tokenA mint 1000 tokens")(admin, 1000, { from: admin });
        await web3tx(tokenA.approve, "tokenA approve exchange 1000 tokens")(
            exchangeAddressA,
            1000,
            { from: admin });
        await web3tx(exchangeA.addLiquidity, "exchangeA.addLiquidity 0.01 ETH <-> 1000 tokens")(
            0,
            1000,
            MAX_DEADLINE,
            { from: admin, value: web3.utils.toWei("0.01", "ether") });
        // 1 x TOKEN A = 0.01 / 1000 ~= 0.00001 ~= 0.0000099 ETH
        assert.isTrue(web3.utils.fromWei(await exchangeA.getTokenToEthInputPrice.call(1), "ether").startsWith("0.0000099"));

        // create token B
        const tokenB = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({ from: admin});
        await web3tx(uniswapFactory.createExchange, "uniswapFactory.createExchange")(tokenB.address, { from: admin });
        const exchangeAddressB = await uniswapFactory.getExchange.call(tokenB.address);
        console.log("exchange B created at: ", exchangeAddressB);
        const exchangeB = await UniswapExchange.at(exchangeAddressB);
        await web3tx(tokenB.mint, "tokenA mint 10000 tokens")(admin, 10000, { from: admin });
        await web3tx(tokenB.approve, "tokenB approve exchange 10000 tokens")(
            exchangeAddressB,
            10000,
            { from: admin });
        await web3tx(exchangeB.addLiquidity, "exchangeB.addLiquidity 0.01 ETH <-> 10000 tokens")(
            0,
            10000,
            MAX_DEADLINE,
            { from: admin, value: web3.utils.toWei("0.01", "ether") });
        assert.equal(web3.utils.fromWei(await exchangeB.getTokenToEthInputPrice.call(1), "ether").substr(0, 10), "0.00000099");

        // deposit token A without intermediary token set
        await web3tx(tokenA.mint, "tokenA mint 10 tokens to customer1")(customer1, 10, { from: admin });
        await web3tx(tokenA.approve, "tokenA approve pp 10 tokens by customer1")(
            pp.address,
            10,
            { from: customer1 });
        await web3tx(pp.depositToken, "depositToken", {
            inLogs: [{
                name: "TokenDepositReceived",
                args: {
                    orderId: "1",
                    depositor: customer1,
                    inputToken: tokenA.address,
                    amount: "10",
                    intermediaryToken: ZERO_ADDRESS,
                    // amountBought: "0" - we do not test the value
                }
            }]
        })(1, customer1, tokenA.address, 10, { from: depositAgent });
        assert.equal(web3.utils.fromWei(await web3.eth.getBalance(pp.address), "ether").substr(0, 8), "0.000098");

        // setup token B intermediary
        await web3tx(pp.setIntermediaryToken, "setIntermediaryToken")(tokenB.address,  { from: admin });

        // deposit token B the intermediary token
        await web3tx(tokenB.mint, "tokenB mint 100 tokens to customer1")(customer2, 100, { from: admin });
        await web3tx(tokenB.approve, "tokenB approve pp 10 tokens by customer2")(
            pp.address,
            100,
            { from: customer2 });
        await web3tx(pp.depositToken, "depositToken", {
            inLogs: [{
                name: "TokenDepositReceived",
                args: {
                    orderId: "1",
                    depositor: customer2,
                    inputToken: tokenB.address,
                    amount: "100",
                    intermediaryToken: tokenB.address,
                    // amountBought: "0" - we do not test the value
                }
            }]
        })(1, customer2, tokenB.address, 100, { from: depositAgent });
        assert.equal((await tokenB.balanceOf.call(pp.address)).toString(), "100");

        // deposit token A with intermediary token set
        await web3tx(tokenA.mint, "tokenA mint 10 tokens to customer2")(customer2, 10, { from: admin });
        await web3tx(tokenA.approve, "tokenA approve pp 10 tokens by customer2")(
            pp.address,
            10,
            { from: customer2 });
        await web3tx(pp.depositToken, "depositToken", {
            inLogs: [{
                name: "TokenDepositReceived",
                args: {
                    orderId: "1",
                    depositor: customer2,
                    inputToken: tokenA.address,
                    amount: "10",
                    intermediaryToken: tokenB.address,
                    // amountBought: "0" - we do not test the value
                }
            }]
        })(1, customer2, tokenA.address, 10, { from: depositAgent });
        assert.equal((await tokenB.balanceOf.call(pp.address)).toString(), "195");
    });

    it("deposit Ether and redeem rToken", async () => {
        //create exchange for the underlying token
        await web3tx(uniswapFactory.createExchange, "uniswapFactory.createExchange")(underlyingToken.address, { from: admin });
        const underlyingTokenExchangeAddress = await uniswapFactory.getExchange.call(underlyingToken.address);
        console.log("exchange for inputToken created at: ", underlyingTokenExchangeAddress);
        const underlyingTokenExchange = await UniswapExchange.at(underlyingTokenExchangeAddress);
        await web3tx(underlyingToken.mint, "underlying token mint 1000 tokens")(admin, 1000, { from: admin });
        await web3tx(underlyingToken.approve, "underlying token approve exchange 1000 tokens")(
            underlyingTokenExchangeAddress,
            1000,
            { from: admin });
        await web3tx(underlyingTokenExchange.addLiquidity, "underlyingTokenExchange.addLiquidity 0.01 ETH <-> 1000 tokens")(
            0,
            1000,
            MAX_DEADLINE,
            { from: admin, value: web3.utils.toWei("0.01", "ether") });
        // 1 x underlying token = 0.01 / 1000 ~= 0.00001 ~= 0.0000099 ETH
        assert.isTrue(web3.utils.fromWei(await underlyingTokenExchange.getTokenToEthInputPrice.call(1), "ether").startsWith("0.0000099"));

        //set RToken as the intermediary token
        await web3tx(pp.setIntermediaryRToken, "setIntermediaryRToken")(rToken.address,  { from: admin });
        //test that rToken is the intermediary
        assert.equal(await pp.isIntermediaryRToken.call(), true);
        //test that correct exchange is set
        assert.equal(await pp.intermediaryTokenExchange.call(), underlyingTokenExchange.address);

        //deposit ether
        let tx = await web3tx(pp.depositEther, "depositEther", {
            inLogs: [{
                name: "EtherDepositReceived",
                args: {
                    orderId: "1",
                    depositor: customer1,
                    amount: web3.utils.toWei("0.1", "ether"),
                    intermediaryToken: rToken.address
                }
            }]
        })(1, { value: web3.utils.toWei("0.1", "ether"), from: customer1 });

        //test that payment processor has rTokens
        assert.equal((await rToken.balanceOf.call(pp.address)).toString(), "908");

        //redeem rTokens and transfer to account
        let balanceBefore = new web3.utils.BN(await underlyingToken.balanceOf.call(admin));
        tx = await web3tx(pp.withdrawToken, "redeem rTokens to owner", {
            inLogs: [{
                name: "TokenDepositWithdrawn",
                args: {
                    token: underlyingToken.address,
                    to: admin,
                    amount: "908"
                }
            }]
        })(underlyingToken.address, 908, admin, { from: admin });
        let balanceAfter = new web3.utils.BN(await underlyingToken.balanceOf.call(admin));
        assert.equal((await balanceAfter.sub(balanceBefore)).toString(), "908");
    });

    it("deposit token and redeem rToken", async () => {
        //create exchange for the underlying token
        await web3tx(uniswapFactory.createExchange, "uniswapFactory.createExchange")(underlyingToken.address, { from: admin });
        const underlyingTokenExchangeAddress = await uniswapFactory.getExchange.call(underlyingToken.address);
        console.log("exchange for inputToken created at: ", underlyingTokenExchangeAddress);
        const underlyingTokenExchange = await UniswapExchange.at(underlyingTokenExchangeAddress);
        await web3tx(underlyingToken.mint, "underlying token mint 1000 tokens")(admin, 1000, { from: admin });
        await web3tx(underlyingToken.approve, "underlying token approve exchange 1000 tokens")(
            underlyingTokenExchangeAddress,
            1000,
            { from: admin });
        await web3tx(underlyingTokenExchange.addLiquidity, "underlyingTokenExchange.addLiquidity 0.01 ETH <-> 1000 tokens")(
            0,
            1000,
            MAX_DEADLINE,
            { from: admin, value: web3.utils.toWei("0.01", "ether") });
        // 1 x underlying token = 0.01 / 1000 ~= 0.00001 ~= 0.0000099 ETH
        assert.isTrue(web3.utils.fromWei(await underlyingTokenExchange.getTokenToEthInputPrice.call(1), "ether").startsWith("0.0000099"));

        //Create another token and exchange
        const otherToken = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({ from: admin});
        await web3tx(uniswapFactory.createExchange, "uniswapFactory.createExchange")(otherToken.address, { from: admin });
        const otherTokenExchangeAddress = await uniswapFactory.getExchange.call(otherToken.address);
        console.log("exchange for otherToken created at: ", otherTokenExchangeAddress);
        const otherTokenExchange = await UniswapExchange.at(otherTokenExchangeAddress);
        await web3tx(otherToken.mint, "otherToken mint 1000 tokens")(admin, 1000, { from: admin });
        await web3tx(otherToken.approve, "otherToken approve exchange 1000 tokens")(
            otherTokenExchangeAddress,
            1000,
            { from: admin });
        await web3tx(otherTokenExchange.addLiquidity, "otherTokenExchange.addLiquidity 0.01 ETH <-> 1000 tokens")(
            0,
            1000,
            MAX_DEADLINE,
            { from: admin, value: web3.utils.toWei("0.01", "ether") });
        // 1 x TOKEN A = 0.01 / 1000 ~= 0.00001 ~= 0.0000099 ETH
        assert.isTrue(web3.utils.fromWei(await otherTokenExchange.getTokenToEthInputPrice.call(1), "ether").startsWith("0.0000099"));


        //set RToken as the intermediary token
        await web3tx(pp.setIntermediaryRToken, "setIntermediaryRToken")(rToken.address,  { from: admin });
        //test that rToken is the intermediary
        assert.equal(await pp.isIntermediaryRToken.call(), true);
        //test that correct exchange is set
        assert.equal(await pp.intermediaryTokenExchange.call(), underlyingTokenExchange.address);


        // deposit underlying token
        await web3tx(underlyingToken.mint, "underlyingToken mint 100 tokens to customer2")(customer2, toWad(100), { from: admin });
        await web3tx(underlyingToken.approve, "underlyingToken approve pp 10 tokens by customer2")(
            pp.address,
            100,
            { from: customer2 });
        await web3tx(pp.depositToken, "depositToken", {
            inLogs: [{
                name: "TokenDepositReceived",
                args: {
                    orderId: "1",
                    depositor: customer2,
                    inputToken: underlyingToken.address,
                    amount: "100",
                    intermediaryToken: rToken.address,
                    // amountBought: "0" - we do not test the value
                }
            }]
        })(1, customer2, underlyingToken.address, 100, { from: depositAgent });
        console.log("rTokens: " + (await rToken.balanceOf.call(pp.address)).toString());
        assert.equal((await rToken.balanceOf.call(pp.address)).toString(), "100");

        //deposit a different token from the underlying token
        await web3tx(otherToken.mint, "otherToken mint 10 tokens to customer2")(customer2, 10, { from: admin });
        await web3tx(otherToken.approve, "otherToken approve pp 10 tokens by customer2")(
            pp.address,
            10,
            { from: customer2 });
        await web3tx(pp.depositToken, "depositToken", {
            inLogs: [{
                name: "TokenDepositReceived",
                args: {
                    orderId: "1",
                    depositor: customer2,
                    inputToken: otherToken.address,
                    amount: "10",
                    intermediaryToken: rToken.address,
                    // amountBought: "0" - we do not test the value
                }
            }]
        })(1, customer2, otherToken.address, 10, { from: depositAgent });
        console.log("rTokens: " + (await rToken.balanceOf.call(pp.address)).toString());
        assert.equal((await rToken.balanceOf.call(pp.address)).toString(), "109");

        //redeem rTokens and transfer to account
        let balanceBefore = new web3.utils.BN(await underlyingToken.balanceOf.call(admin));
        let tx = await web3tx(pp.withdrawToken, "redeem rTokens to owner", {
            inLogs: [{
                name: "TokenDepositWithdrawn",
                args: {
                    token: underlyingToken.address,
                    to: admin,
                    amount: "109"
                }
            }]
        })(underlyingToken.address, 109, admin, { from: admin });
        let balanceAfter = new web3.utils.BN(await underlyingToken.balanceOf.call(admin));
        assert.equal((await balanceAfter.sub(balanceBefore)).toString(), "109");
    });
});
