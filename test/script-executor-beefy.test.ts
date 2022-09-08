import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, utils } from "ethers";
import { ethers, network } from "hardhat";
import { AmountType, ComparisonType } from "@daemons-fi/shared-definitions";
import {
    BeefyDomain,
    IBeefyAction,
    BeefyActionType,
    BeefyTypes
} from "@daemons-fi/shared-definitions";
import hre from "hardhat";

describe("ScriptExecutor - Beefy [FORKED CHAIN]", function () {
    let owner: SignerWithAddress;
    let otherWallet: SignerWithAddress;

    // contracts
    let gasTank: Contract;
    let executor: Contract;
    let DAEMToken: Contract;
    let wETH: Contract;
    let wBTC: Contract;
    let lpToken: Contract;
    let mooToken: Contract;
    let uniswapRouter: Contract;

    // signature components
    let sigR: string;
    let sigS: string;
    let sigV: number;

    let baseMessage: IBeefyAction = {
        scriptId: "0x7465737400000000000000000000000000000000000000000000000000000000",
        lpAddress: "",
        mooAddress: "",
        action: BeefyActionType.Deposit,
        typeAmt: AmountType.Absolute,
        amount: BigNumber.from(0),
        user: "",
        executor: "",
        chainId: BigNumber.from(31337),
        tip: BigNumber.from(0),
        balance: {
            enabled: false,
            amount: utils.parseEther("150"),
            token: "",
            comparison: ComparisonType.GreaterThan
        },
        frequency: {
            enabled: false,
            delay: BigNumber.from(5),
            start: BigNumber.from(0)
        },
        price: {
            enabled: false,
            tokenA: "",
            tokenB: "",
            comparison: ComparisonType.GreaterThan,
            value: utils.parseEther("150"),
            router: ""
        },
        repetitions: {
            enabled: false,
            amount: BigNumber.from(0)
        },
        follow: {
            enabled: false,
            shift: BigNumber.from(0),
            scriptId: "0x0065737400000000000000000000000000000000000000000000000000000000",
            executor: "0x000000000000000000000000000000000000dead"
        }
    };

    let snapshotId: string;
    this.beforeEach(async () => {
        await hre.network.provider.send("evm_revert", [snapshotId]);
        // [...] A snapshot can only be used once. After a successful evm_revert, the same snapshot id cannot be used again.
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    this.afterAll(async () => {
        // Reset the fork
        await hre.network.provider.request({
            method: "hardhat_reset",
            params: []
        });
    });

    this.beforeAll(async () => {
        console.log(`Forking Polygon network`);
        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: process.env.POLYGON_RPC!,
                        blockNumber: 29483920
                    }
                }
            ]
        });

        // get main wallet
        [owner, otherWallet] = await ethers.getSigners();

        // GasTank contract
        const GasTankContract = await ethers.getContractFactory("GasTank");
        gasTank = await GasTankContract.deploy();
        await gasTank.depositGas({ value: utils.parseEther("2.0") });

        // Add DAEM contracts
        const MockTokenContract = await ethers.getContractFactory("MockToken");
        DAEMToken = await MockTokenContract.deploy("Foo Token", "FOO");

        // Gas Price Feed contract
        const GasPriceFeedContract = await ethers.getContractFactory("GasPriceFeed");
        const gasPriceFeed = await GasPriceFeedContract.deploy();

        // Executor contract
        const BeefyScriptExecutorContract = await ethers.getContractFactory("BeefyScriptExecutor");
        executor = await BeefyScriptExecutorContract.deploy();
        await executor.setGasTank(gasTank.address);
        await executor.setGasFeed(gasPriceFeed.address);

        // register executor in gas tank
        await gasTank.addExecutor(executor.address);
        await gasTank.setDAEMToken(DAEMToken.address);

        /** STRATEGY */
        // As we can only test Beefy on a fork we cannot use mocked tokens.
        // The only way around it is to use the fake ETH that come with each
        // wallet to buy ETH and wBTC, create an LP and use THAT for our tests

        // Get real router
        uniswapRouter = await ethers.getContractAt(
            "IUniswapV2Router01",
            "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506"
        );

        // Use the MATIC to get wETH
        const amountWETH = utils.parseEther("1000");
        const wMATICAddress = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
        const wETHAddress = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
        wETH = await ethers.getContractAt("IWETH", wETHAddress);
        await uniswapRouter.swapExactETHForTokens(
            0,
            [wMATICAddress, wETHAddress],
            owner.address,
            BigNumber.from("0xffffffffffffffffffff"),
            { value: amountWETH }
        );
        const wETHBalance = await wETH.balanceOf(owner.address);
        console.log(`wETH Balance: ${wETHBalance.toString()}`);

        // Use the MATIC balance to buy wBTC
        const amountWBTC = utils.parseEther("1000"); // in matic
        const wBTCAddress = "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6";
        wBTC = await ethers.getContractAt("IERC20", wBTCAddress);
        await uniswapRouter.swapExactETHForTokens(
            0,
            [wMATICAddress, wBTCAddress],
            owner.address,
            BigNumber.from("0xffffffffffffffffffff"),
            { value: amountWBTC }
        );
        const wBTCBalance = await wBTC.balanceOf(owner.address);
        console.log(`wBTC Balance: ${wBTCBalance.toString()}`);

        // create LP
        await wETH.approve(uniswapRouter.address, utils.parseEther("1000000000000"));
        await wBTC.approve(uniswapRouter.address, utils.parseEther("1000000000000"));
        await uniswapRouter.addLiquidity(
            wETH.address,
            wBTC.address,
            wETHBalance,
            wBTCBalance,
            0,
            0,
            owner.address,
            BigNumber.from("0xffffffffffffffffffffff")
        );

        // get LP address
        const factoryAddress = await uniswapRouter.factory();
        const factory = await ethers.getContractAt("IUniswapV2Factory", factoryAddress);
        const lpAddress = await factory.getPair(wETH.address, wBTC.address);
        console.log("lP address", lpAddress);
        lpToken = await ethers.getContractAt("IERC20", lpAddress);
        const LPBalance = await lpToken.balanceOf(owner.address);
        console.log(`LP Balance: ${LPBalance.toString()}`);

        // get MOO token
        // https://polygonscan.com/address/0x6530E351074f1f9fdf254dC7d7d8A44324E158a4
        const mooTokenAddress = "0x6530E351074f1f9fdf254dC7d7d8A44324E158a4";
        mooToken = await ethers.getContractAt("IERC20", mooTokenAddress);

        // Grant allowance
        await DAEMToken.approve(executor.address, utils.parseEther("1000000"));
        await lpToken.approve(executor.address, utils.parseEther("1000000"));
        await mooToken.approve(executor.address, utils.parseEther("1000000"));

        // Generate DAEM balance
        await DAEMToken.mint(owner.address, utils.parseEther("250"));

        // create liquidity manager
        const LiquidityManager = await ethers.getContractFactory("UniswapV2LiquidityManager");
        const liquidityManager = await LiquidityManager.deploy(
            DAEMToken.address,
            "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506"
        );

        // Treasury contract
        const TreasuryContract = await ethers.getContractFactory("Treasury");
        const treasury = await TreasuryContract.deploy(
            DAEMToken.address,
            gasTank.address,
            liquidityManager.address
        );

        // create LP
        const ETHAmount = utils.parseEther("5");
        const DAEMAmount = utils.parseEther("10");
        await DAEMToken.mint(owner.address, DAEMAmount);
        await DAEMToken.approve(liquidityManager.address, DAEMAmount);
        await liquidityManager.createLP(DAEMAmount, treasury.address, { value: ETHAmount });

        // add some tokens to treasury
        DAEMToken.mint(treasury.address, utils.parseEther("110"));

        // set treasury address in gas tank
        await gasTank.setTreasury(treasury.address);

        // check that everything has been set correctly
        await executor.preliminaryCheck();
        await gasTank.preliminaryCheck();
        await treasury.preliminaryCheck();

        // set base message amount
        baseMessage.amount = await lpToken.balanceOf(owner.address);

        // get a snapshot of the current state so to speed up tests
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    async function initialize(baseMessage: IBeefyAction): Promise<IBeefyAction> {
        // Create message and fill missing info
        const message = { ...baseMessage };
        message.user = owner.address;
        message.executor = executor.address;
        message.lpAddress = lpToken.address;
        message.mooAddress = mooToken.address;
        message.balance.token = lpToken.address;
        message.price.tokenA = wETH.address;
        message.price.tokenB = wBTC.address;
        message.price.router = uniswapRouter.address;
        message.follow.executor = executor.address; // following itself, it'll never be executed when condition is enabled

        // Sign message
        const signature = await owner._signTypedData(BeefyDomain, BeefyTypes, message);
        const split = utils.splitSignature(signature);
        [sigR, sigS, sigV] = [split.r, split.s, split.v];

        // Return updated message
        return message;
    }

    it("verifies a correct message with no conditions", async () => {
        const message = await initialize(baseMessage);
        await executor.verify(message, sigR, sigS, sigV);
        // no error means success!
    });

    it("spots a tampered message with no conditions", async () => {
        const message = await initialize(baseMessage);
        const tamperedMessage = { ...message };
        tamperedMessage.amount = utils.parseEther("0");

        await expect(executor.verify(tamperedMessage, sigR, sigS, sigV)).to.be.revertedWith(
            "[SIGNATURE][FINAL]"
        );
    });

    it("spots a valid message from another chain", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.chainId = BigNumber.from("99999"); // message created for another chain
        message = await initialize(message);

        // as the contract is created on chain 42, it will refuse to execute this message
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[CHAIN][ERROR]"
        );
    });

    it("deposits into Beefy - ABS", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = BeefyActionType.Deposit;
        message = await initialize(message);

        await executor.execute(message, sigR, sigS, sigV);

        const lpBalance: BigNumber = await lpToken.balanceOf(owner.address);
        expect(lpBalance).to.equal(utils.parseEther("0"));
        const mooBalance: BigNumber = await mooToken.balanceOf(owner.address);
        expect(mooBalance.gte(0)).to.be.true;
    });

    it("deposits into Beefy - PRC", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = BeefyActionType.Deposit;
        message.typeAmt = AmountType.Percentage;
        message.amount = BigNumber.from(5000); // 50%
        message = await initialize(message);

        const currentLPBalance = await lpToken.balanceOf(owner.address);
        const expectedBalanceAfterExecution = currentLPBalance.div(2);

        await executor.execute(message, sigR, sigS, sigV);

        const lpBalance: BigNumber = await lpToken.balanceOf(owner.address);
        expect(lpBalance.div(100)).to.equal(expectedBalanceAfterExecution.div(100)); // let's remove some satoshis
        const mooBalance: BigNumber = await mooToken.balanceOf(owner.address);
        expect(mooBalance.gte(0)).to.be.true;
    });

    it("withdraws from Beefy - ABS", async () => {
        // first deposit
        let depositMessage: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        depositMessage.action = BeefyActionType.Deposit;
        depositMessage = await initialize(depositMessage);
        await executor.execute(depositMessage, sigR, sigS, sigV);

        let mooBalance: BigNumber = await mooToken.balanceOf(owner.address);
        expect(mooBalance.gte(0)).to.be.true;

        // then withdraw all of it
        let withdrawMessage = JSON.parse(JSON.stringify(baseMessage));
        withdrawMessage.action = BeefyActionType.Withdraw;
        withdrawMessage.amount = mooBalance;
        withdrawMessage.typeAmt = AmountType.Absolute;
        withdrawMessage = await initialize(withdrawMessage);
        await executor.execute(withdrawMessage, sigR, sigS, sigV);

        mooBalance = await mooToken.balanceOf(owner.address);
        expect(mooBalance).to.be.equal(BigNumber.from(0));
    });

    it("withdraws from Beefy - PRC", async () => {
        // first deposit
        let depositMessage: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        depositMessage.action = BeefyActionType.Deposit;
        depositMessage = await initialize(depositMessage);
        await executor.execute(depositMessage, sigR, sigS, sigV);

        let mooBalance: BigNumber = await mooToken.balanceOf(owner.address);
        expect(mooBalance.gte(0)).to.be.true;

        // then withdraw 90% of it
        let withdrawMessage = JSON.parse(JSON.stringify(baseMessage));
        withdrawMessage.action = BeefyActionType.Withdraw;
        withdrawMessage.amount = BigNumber.from(9000); // 90%
        withdrawMessage.typeAmt = AmountType.Percentage;
        withdrawMessage = await initialize(withdrawMessage);
        await executor.execute(withdrawMessage, sigR, sigS, sigV);

        let newMooBalance = await mooToken.balanceOf(owner.address);
        const expectedBalance = mooBalance.div(10); // 10% of balance
        expect(newMooBalance.div(10)).to.be.equal(expectedBalance.div(10)); // let's remove some satoshis
    });

    it("execution triggers reward in gas tank", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message = await initialize(message);

        // gasTank should NOT have a claimable amount now for user1
        expect((await gasTank.claimable(otherWallet.address)).toNumber()).to.equal(0);

        await executor.connect(otherWallet).execute(message, sigR, sigS, sigV);

        // gasTank should have a claimable amount now for user1
        expect((await gasTank.claimable(otherWallet.address)).toNumber()).to.not.equal(0);
    });

    it("depositing is cheap - ABS", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000378714048096678 ETH.

        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = BeefyActionType.Deposit;
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = utils.parseEther("0.00041");
        console.log("Spent for supply:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("depositing is cheap - PRC", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000384751048863377 ETH.

        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = BeefyActionType.Deposit;
        message.typeAmt = AmountType.Percentage;
        message.amount = BigNumber.from(5000); // 50%
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = utils.parseEther("0.00041");
        console.log("Spent for supply:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("withdrawing is cheap - ABS", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000316318035427616 ETH.

        // first deposit
        let depositMessage: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        depositMessage.action = BeefyActionType.Deposit;
        depositMessage = await initialize(depositMessage);
        await executor.execute(depositMessage, sigR, sigS, sigV);

        let mooBalance: BigNumber = await mooToken.balanceOf(owner.address);
        expect(mooBalance.gte(0)).to.be.true;

        // then withdraw all of it
        let withdrawMessage = JSON.parse(JSON.stringify(baseMessage));
        withdrawMessage.action = BeefyActionType.Withdraw;
        withdrawMessage.amount = mooBalance;
        withdrawMessage.typeAmt = AmountType.Absolute;
        withdrawMessage = await initialize(withdrawMessage);

        const initialBalance = await owner.getBalance();
        await executor.execute(withdrawMessage, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = utils.parseEther("0.00041");
        console.log("Spent for withdraw:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("withdrawing is cheap - PRC", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000322415036110480 ETH.

        // first deposit
        let depositMessage: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        depositMessage.action = BeefyActionType.Deposit;
        depositMessage = await initialize(depositMessage);
        await executor.execute(depositMessage, sigR, sigS, sigV);

        let mooBalance: BigNumber = await mooToken.balanceOf(owner.address);
        expect(mooBalance.gte(0)).to.be.true;

        // then withdraw 90% of it
        let withdrawMessage = JSON.parse(JSON.stringify(baseMessage));
        withdrawMessage.action = BeefyActionType.Withdraw;
        withdrawMessage.amount = BigNumber.from(9000); // 90%
        withdrawMessage.typeAmt = AmountType.Percentage;
        withdrawMessage = await initialize(withdrawMessage);
        withdrawMessage = await initialize(withdrawMessage);

        const initialBalance = await owner.getBalance();
        await executor.execute(withdrawMessage, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = utils.parseEther("0.00041");
        console.log("Spent for withdraw:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("sets the lastExecution value during execution", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));

        // enable frequency condition so 2 consecutive executions should fail
        message.frequency.enabled = true;
        message.amount = BigNumber.from(2500); // 25%
        message.typeAmt = AmountType.Percentage;
        message = await initialize(message);

        console.log("message");
        console.log(message);
        // the first one goes through
        await executor.execute(message, sigR, sigS, sigV);

        // the second one fails as not enough blocks have passed
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FREQUENCY_CONDITION][TMP]"
        );
    });

    /* ========== ACTION INTRINSIC CHECK ========== */

    it("fails if the user doesn't have enough balance, even tho the balance condition was not set - DEPOSIT", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        // setting an amount higher than the user's balance
        message.action = BeefyActionType.Deposit;
        message.amount = utils.parseEther("9999");
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[SCRIPT_BALANCE][TMP]"
        );
    });

    it("fails if the user doesn't have enough balance, even tho the balance condition was not set - WITHDRAW", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        // setting an amount higher than the user's balance
        message.action = BeefyActionType.Withdraw;
        message.amount = utils.parseEther("9999");
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[SCRIPT_BALANCE][TMP]"
        );
    });

    /* ========== REVOCATION CONDITION CHECK ========== */

    it("fails if the script has been revoked by the user", async () => {
        const message = await initialize(baseMessage);

        // revoke the script execution
        await executor.revoke(message.scriptId);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[REVOKED][FINAL]"
        );
    });

    /* ========== FREQUENCY CONDITION CHECK ========== */

    it("fails the verification if frequency is enabled and the start block has not been reached", async () => {
        const timestampNow = Math.floor(Date.now() / 1000);
        // update frequency in message and submit for signature
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.frequency.enabled = true;
        message.frequency.delay = BigNumber.from(0);
        message.frequency.start = BigNumber.from(timestampNow + 5000);
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FREQUENCY_CONDITION][TMP]"
        );
    });

    it("fails the verification if frequency is enabled and not enough blocks passed since start block", async () => {
        const timestampNow = Math.floor(Date.now() / 1000);
        // update frequency in message and submit for signature
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.frequency.enabled = true;
        message.frequency.delay = BigNumber.from(timestampNow + 5000);
        message.frequency.start = BigNumber.from(0);
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FREQUENCY_CONDITION][TMP]"
        );
    });

    /* ========== BALANCE CONDITION CHECK ========== */

    it("fails the verification if balance is enabled and the user does not own enough tokens", async () => {
        // update balance in message and submit for signature
        // enabling it will be enough as the condition is "FOO_TOKEN>150"
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.balance.enabled = true;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[BALANCE_CONDITION_LOW][TMP]"
        );
    });

    it("fails the verification if balance is enabled and the user owns too many tokens", async () => {
        // update frequency in message and submit for signature
        // we'll change the comparison so it will become "FOO_TOKEN<150"
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.balance.enabled = true;
        message.balance.comparison = ComparisonType.LessThan;
        message.balance.amount = (await lpToken.balanceOf(owner.address)).div(2);
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[BALANCE_CONDITION_HIGH][TMP]"
        );
    });

    /* ========== PRICE CONDITION CHECK ========== */

    it("fails the verification if price is enabled with GREATER_THAN condition and tokenPrice < value", async () => {
        // update price in message and submit for signature.
        // Condition: ETH > BTC 0.055
        // PRICE AT SNAPSHOT: 0.05407170
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.GreaterThan;
        message.price.value = utils.parseUnits("0.055", 8);
        message = await initialize(message);

        // verification should fail as the price lower than expected
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[PRICE_CONDITION_LOW][TMP]"
        );
    });

    it("fails the verification if price is enabled with LESS_THAN condition and tokenPrice > value", async () => {
        // update price in message and submit for signature.
        // Condition: ETH < BTC 0.053
        // PRICE AT SNAPSHOT: 0.05407170
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.LessThan;
        message.price.value = utils.parseUnits("0.053", 8);
        message = await initialize(message);

        // verification should fail as the price lower than expected
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[PRICE_CONDITION_HIGH][TMP]"
        );
    });

    it("passes the price verification if conditions are met", async () => {
        // update price in message and submit for signature.
        // Condition: ETH > BTC 0.053
        // PRICE AT SNAPSHOT: 0.05407170
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.GreaterThan;
        message.price.value = utils.parseUnits("0.053", 8);
        message = await initialize(message);

        // verification should go through and raise no errors!
        await executor.verify(message, sigR, sigS, sigV);
    });

    /* ========== GAS TANK CONDITION CHECK ========== */

    it("fails if the user does not have enough funds in the gas tank", async () => {
        const message = await initialize(baseMessage);

        // empty the gas tank and try to verify the message
        await gasTank.withdrawAllGas();
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith("[GAS][TMP]");
    });

    /* ========== TIP CONDITION CHECK ========== */

    it("fails if the user sets a tip but doesn't have enough funds to pay for it", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.tip = utils.parseEther("15000");
        message = await initialize(message);

        // empty the gas tank and try to verify the message
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith("[TIP][TMP]");
    });

    it("Pays the tip to the executor", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.tip = utils.parseEther("5");
        message = await initialize(message);

        // deposit DAEM in the Tip Jar
        await DAEMToken.approve(gasTank.address, utils.parseEther("10000"));
        await gasTank.connect(owner).depositTip(utils.parseEther("10"));
        let tipBalance = await gasTank.tipBalanceOf(owner.address);
        expect(tipBalance).to.be.equal(utils.parseEther("10"));

        await executor.connect(otherWallet).execute(message, sigR, sigS, sigV);

        // tokens have been removed from the user's tip jar
        tipBalance = await gasTank.tipBalanceOf(owner.address);
        expect(tipBalance).to.be.equal(utils.parseEther("5"));
    });

    /* ========== ALLOWANCE CONDITION CHECK ========== */

    it("fails if the user did not grant enough allowance to the executor contract - DEPOSIT", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = BeefyActionType.Deposit;
        message = await initialize(message);

        // revoke the allowance for the token to the executor contract
        await lpToken.approve(executor.address, utils.parseEther("0"));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[ALLOWANCE][ACTION]"
        );
    });

    it("fails if the user did not grant enough allowance to the executor contract - WITHDRAW", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = BeefyActionType.Withdraw;
        message = await initialize(message);

        // revoke the allowance for the token to the executor contract
        await mooToken.approve(executor.address, utils.parseEther("0"));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[ALLOWANCE][ACTION]"
        );
    });

    /* ========== REPETITIONS CONDITION CHECK ========== */

    it("fails if the script has been executed more than the allowed repetitions", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        message.repetitions.enabled = true;
        message.amount = BigNumber.from(2500); // 25%
        message.typeAmt = AmountType.Percentage;
        message.repetitions.amount = BigNumber.from(2);
        message = await initialize(message);

        // first two times it goes through
        await executor.execute(message, sigR, sigS, sigV);
        await executor.execute(message, sigR, sigS, sigV);

        // the third time won't as it'll hit the max-repetitions limit
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[REPETITIONS_CONDITION][FINAL]"
        );
    });

    /* ========== FOLLOW CONDITION CHECK ========== */

    it("fails if the script should follow a script that has not run yet", async () => {
        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        // enabling the follow condition. It now points to a script that never executed (as it does not exist),
        // so it should always fail.
        message.follow.enabled = true;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FOLLOW_CONDITION][TMP]"
        );
    });

    it("fails if the script should follow a script that has not run yet, even if it is run by another executor", async () => {
        const SwapperScriptExecutorContract = await ethers.getContractFactory(
            "SwapperScriptExecutor"
        );
        const otherExecutor = await SwapperScriptExecutorContract.deploy();

        let message: IBeefyAction = JSON.parse(JSON.stringify(baseMessage));
        // setting the follow condition to use another executor, so to test the external calls.
        message.follow.enabled = true;
        message.follow.executor = otherExecutor.address;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FOLLOW_CONDITION][TMP]"
        );
    });
});
