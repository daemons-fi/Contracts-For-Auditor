import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import { AmountType, ComparisonType } from "@daemons-fi/shared-definitions";
import {
    mmAdvDomain,
    IMMAdvancedAction,
    AdvancedMoneyMarketActionType,
    mmAdvTypes,
    InterestRateMode
} from "@daemons-fi/shared-definitions";
import hre from "hardhat";
const chainId = hre.network.config.chainId;

describe("ScriptExecutor - Money Market Advanced [FORKED CHAIN]", function () {
    let owner: SignerWithAddress;
    let otherWallet: SignerWithAddress;

    // contracts
    let gasTank: Contract;
    let executor: Contract;
    let DAEMToken: Contract;
    let WMATICToken: Contract;
    let fooToken: Contract;
    let DAIToken: Contract;
    let vDebtDAIToken: Contract;

    const aavePoolAddress = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
    const aaveOracleAddress = "0xb023e699F5a33916Ea823A16485e259257cA8Bd1";
    const quickswapRouterAddress = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";

    // signature components
    let sigR: string;
    let sigS: string;
    let sigV: number;

    let baseMessage: IMMAdvancedAction = {
        scriptId: "0x7465737400000000000000000000000000000000000000000000000000000000",
        token: "",
        debtToken: "",
        action: AdvancedMoneyMarketActionType.Repay,
        typeAmt: AmountType.Absolute,
        rateMode: InterestRateMode.Variable,
        amount: ethers.utils.parseEther("10"),
        user: "",
        kontract: "",
        executor: "",
        chainId: BigNumber.from(chainId),
        tip: BigNumber.from(0),
        balance: {
            enabled: false,
            amount: ethers.utils.parseEther("150"),
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
            value: ethers.utils.parseEther("150"),
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
        },
        healthFactor: {
            enabled: false,
            kontract: "",
            comparison: ComparisonType.GreaterThan,
            amount: ethers.utils.parseEther("0")
        }
    };

    let snapshotId: string;
    this.beforeEach(async () => {
        await hre.network.provider.send("evm_revert", [snapshotId]);
        // [...] A snapshot can only be used once. After a successful evm_revert, the same snapshot id cannot be used again.
        snapshotId = await hre.network.provider.send("evm_snapshot", []);
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
        await gasTank.depositGas({ value: ethers.utils.parseEther("2.0") });

        // Mock token contracts
        const MockTokenContract = await ethers.getContractFactory("MockToken");
        DAEMToken = await MockTokenContract.deploy("DAEM", "DAEM");
        fooToken = await MockTokenContract.deploy("Foo Token", "FOO");
        WMATICToken = await ethers.getContractAt(
            "MockToken",
            "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"
        );
        DAIToken = await ethers.getContractAt(
            "MockToken",
            "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"
        );
        vDebtDAIToken = await ethers.getContractAt(
            "ICreditDelegationToken",
            "0x8619d80FB0141ba7F184CbF22fd724116D9f7ffC"
        );

        // Gas Price Feed contract
        const GasPriceFeedContract = await ethers.getContractFactory("GasPriceFeed");
        const gasPriceFeed = await GasPriceFeedContract.deploy();

        // * * * * TESTING STRATEGY * * * *
        // We'll get 2000 WMATIC and deposit 200 of them
        // Then we'll borrow 20 DAI, so to have a 3.75 Health Factor
        // and 20 vDebtDAI
        const aaveMoneyMarket = await ethers.getContractAt("IMoneyMarket", aavePoolAddress);
        const wMATICAmount = ethers.utils.parseEther("2000");
        await owner.sendTransaction({ to: WMATICToken.address, value: wMATICAmount });
        await WMATICToken.approve(aaveMoneyMarket.address, ethers.utils.parseEther("99999"));
        // deposit 200 MATIC
        const depositedWMATIC = ethers.utils.parseEther("200");
        await aaveMoneyMarket.deposit(WMATICToken.address, depositedWMATIC, owner.address, 0);
        // borrow 20 DAI, resulting HF: 3.75
        await aaveMoneyMarket.borrow(
            DAIToken.address,
            ethers.utils.parseEther("20"),
            InterestRateMode.Variable,
            0,
            owner.address
        );

        // Executor contract
        const MmScriptExecutorContract = await ethers.getContractFactory(
            "MmAdvancedScriptExecutor"
        );
        executor = await MmScriptExecutorContract.deploy();
        await executor.setGasTank(gasTank.address);
        await executor.setGasFeed(gasPriceFeed.address);
        await executor.setAavePriceOracle(aaveOracleAddress);

        // Grant allowance
        await DAEMToken.approve(executor.address, ethers.utils.parseEther("100000"));
        await DAIToken.approve(executor.address, ethers.utils.parseEther("1000000"));
        await vDebtDAIToken.approveDelegation(executor.address, ethers.utils.parseEther("10000"));

        // Generate balances
        await DAEMToken.mint(owner.address, ethers.utils.parseEther("250"));
        await fooToken.mint(owner.address, ethers.utils.parseEther("100"));

        // register executor in gas tank
        await gasTank.addOperator(executor.address);
        await gasTank.setDAEMToken(DAEMToken.address);

        // create liquidity manager
        const LiquidityManager = await ethers.getContractFactory("UniswapV2LiquidityManager");
        const liquidityManager = await LiquidityManager.deploy(
            DAEMToken.address,
            quickswapRouterAddress // quickswap router
        );

        // Treasury contract
        const TreasuryContract = await ethers.getContractFactory("Treasury");
        const treasury = await TreasuryContract.deploy(
            DAEMToken.address,
            gasTank.address,
            liquidityManager.address
        );

        // create LP
        const ETHAmount = ethers.utils.parseEther("2000");
        const DAEMAmount = ethers.utils.parseEther("2000");
        await DAEMToken.mint(owner.address, DAEMAmount);
        await DAEMToken.approve(liquidityManager.address, ethers.utils.parseEther("2000"));
        await liquidityManager.createLP(DAEMAmount, treasury.address, { value: ETHAmount });

        // add some tokens to treasury
        DAEMToken.mint(treasury.address, ethers.utils.parseEther("110"));

        // set treasury address in gas tank
        await gasTank.setTreasury(treasury.address);

        // check that everything has been set correctly
        await executor.preliminaryCheck();
        await gasTank.preliminaryCheck();
        await treasury.preliminaryCheck();

        // get a snapshot of the current state so to speed up tests
        snapshotId = await hre.network.provider.send("evm_snapshot", []);
    });

    async function initialize(
        baseMessage: IMMAdvancedAction,
        alternativeToken?: string,
        alternativeDebtToken?: string
    ): Promise<IMMAdvancedAction> {
        // Create message and fill missing info
        const message = { ...baseMessage };
        message.user = owner.address;
        message.executor = executor.address;
        message.token = alternativeToken ?? DAIToken.address;
        message.debtToken = alternativeDebtToken ?? vDebtDAIToken.address;
        message.kontract = aavePoolAddress;
        message.healthFactor.kontract = aavePoolAddress;
        message.balance.token = fooToken.address;
        message.price.tokenA = WMATICToken.address;
        message.price.tokenB = DAEMToken.address;
        message.price.router = quickswapRouterAddress;
        message.follow.executor = executor.address; // following itself, it'll never be executed when condition is enabled

        // Sign message
        const signature = await owner._signTypedData(mmAdvDomain, mmAdvTypes, message);
        const split = ethers.utils.splitSignature(signature);
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
        tamperedMessage.amount = ethers.utils.parseEther("0");

        await expect(executor.verify(tamperedMessage, sigR, sigS, sigV)).to.be.revertedWith(
            "[SIGNATURE][FINAL]"
        );
    });

    it("spots a valid message from another chain", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.chainId = BigNumber.from("1"); // message created for the Ethereum chain
        message = await initialize(message);

        // as the contract is created on chain 42, it will refuse to execute this message
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[CHAIN][ERROR]"
        );
    });

    it("repays the debt - ABS", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = ethers.utils.parseEther("9");
        message.typeAmt = AmountType.Absolute;
        message.action = AdvancedMoneyMarketActionType.Repay;
        message = await initialize(message);

        await executor.execute(message, sigR, sigS, sigV);

        // Debt was 20, so now it should still be around 11 DAI
        const vDebtDAI = await ethers.getContractAt("IERC20", vDebtDAIToken.address);
        const debt = await vDebtDAI.balanceOf(owner.address);
        expect(debt.gte(ethers.utils.parseEther("11"))).to.equal(true);
        expect(debt.lte(ethers.utils.parseEther("11.001"))).to.equal(true);
    });

    it("repays the debt - PRC", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = BigNumber.from(7500); // 75%
        message.typeAmt = AmountType.Percentage;
        message.action = AdvancedMoneyMarketActionType.Repay;
        message = await initialize(message);

        await executor.execute(message, sigR, sigS, sigV);

        // we're paying 75% of the 20DAI debt =>
        // 15+ paid, 5- remaining in wallet and debt of 5+
        const tokenBalance = await DAIToken.balanceOf(owner.address);
        expect(tokenBalance.gte(ethers.utils.parseEther("4.9999"))).to.equal(true);
        expect(tokenBalance.lte(ethers.utils.parseEther("5"))).to.equal(true);

        const vDebtDAI = await ethers.getContractAt("IERC20", vDebtDAIToken.address);
        const debt = await vDebtDAI.balanceOf(owner.address);
        expect(debt.gte(ethers.utils.parseEther("5"))).to.equal(true);
        expect(debt.lte(ethers.utils.parseEther("5.001"))).to.equal(true);
    });

    it("borrows some tokens - ABS", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = ethers.utils.parseEther("5");
        message.action = AdvancedMoneyMarketActionType.Borrow;
        message = await initialize(message);

        await executor.execute(message, sigR, sigS, sigV);

        const tokenBalance = await DAIToken.balanceOf(owner.address);
        expect(tokenBalance).to.equal(ethers.utils.parseEther("25")); // 20 was already there

        const vDebtDAI = await ethers.getContractAt("IERC20", vDebtDAIToken.address);
        const debt = await vDebtDAI.balanceOf(owner.address);
        expect(debt.gte(ethers.utils.parseEther("25"))).to.equal(true);
        expect(debt.lte(ethers.utils.parseEther("25.001"))).to.equal(true);
    });

    it("borrows some tokens - PRC", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = BigNumber.from("5000"); // Borrow 50% of borrowable
        message.typeAmt = AmountType.Percentage;
        message.action = AdvancedMoneyMarketActionType.Borrow;
        message = await initialize(message);

        await executor.execute(message, sigR, sigS, sigV);

        // the new debt should be ~44.8266
        // 20 from the old debt + 24.82 from the new one (50% of the borrowable of that moment)
        const vDebtDAI = await ethers.getContractAt("IERC20", vDebtDAIToken.address);
        const debt = await vDebtDAI.balanceOf(owner.address);
        expect(debt.gte(ethers.utils.parseEther("44.8266"))).to.equal(true);
        expect(debt.lte(ethers.utils.parseEther("44.8267"))).to.equal(true);

        // now they own 44.8266 DAI
        const tokenBalance = await DAIToken.balanceOf(owner.address);
        expect(tokenBalance.gte(ethers.utils.parseEther("44.8266"))).to.equal(true);
        expect(tokenBalance.lte(ethers.utils.parseEther("44.8267"))).to.equal(true);
    });

    it("execution triggers reward in gas tank", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message = await initialize(message);
        await fooToken.mint(owner.address, ethers.utils.parseEther("55"));

        // gasTank should NOT have a claimable amount now for user1
        expect((await gasTank.claimable(otherWallet.address)).toNumber()).to.equal(0);

        await executor.connect(otherWallet).execute(message, sigR, sigS, sigV);

        // gasTank should have a claimable amount now for user1
        expect((await gasTank.claimable(otherWallet.address)).toNumber()).to.not.equal(0);
    });

    it("repaying is cheap - ABS", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000409924031974072 ETH.

        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = ethers.utils.parseEther("1");
        message.typeAmt = AmountType.Absolute;
        message.action = AdvancedMoneyMarketActionType.Repay;
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.00043");
        console.log("Spent for repay ABS:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("repaying is cheap - PRC", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000420930032832540 ETH.

        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = BigNumber.from(7500); // 75%
        message.typeAmt = AmountType.Percentage;
        message.action = AdvancedMoneyMarketActionType.Repay;
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.00043");
        console.log("Spent for repay PRC:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("borrowing is cheap - ABS", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000473996032705724 ETH.

        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = ethers.utils.parseEther("5");
        message.action = AdvancedMoneyMarketActionType.Borrow;
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.00053");
        console.log("Spent for borrow ABS:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("borrowing is cheap - PRC", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000510050035193450 ETH.

        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = BigNumber.from("500"); // Borrow 5% of borrowable
        message.typeAmt = AmountType.Percentage;
        message.action = AdvancedMoneyMarketActionType.Borrow;
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.00053");
        console.log("Spent for borrow PRC:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("sets the lastExecution value during execution", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));

        // enable frequency condition so 2 consecutive executions should fail
        message.frequency.enabled = true;
        message.typeAmt = AmountType.Percentage;
        message.amount = BigNumber.from(2500); //25%
        message = await initialize(message);
        await fooToken.mint(owner.address, ethers.utils.parseEther("2000"));

        // the first one goes through
        await executor.execute(message, sigR, sigS, sigV);

        // the second one fails as not enough blocks have passed
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FREQUENCY_CONDITION][TMP]"
        );
    });

    /* ========== ACTION INTRINSIC CHECK ========== */

    it("fails if the user wants to repay but there is no debt", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        // trying to repay (nonexistent) LINK debt
        message.action = AdvancedMoneyMarketActionType.Repay;
        message.typeAmt = AmountType.Absolute;
        message.amount = ethers.utils.parseEther("999");

        const LINKAddress = "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39";
        const vDebtLINKAddress = "0x953A573793604aF8d41F306FEb8274190dB4aE0e";
        message = await initialize(message, LINKAddress, vDebtLINKAddress);

        // trying again will fail
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[NO_DEBT][TMP]"
        );
    });

    it("fails if the user doesn't have enough balance, even tho the balance condition was not set - ABS", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = ethers.utils.parseEther("9999"); // setting an amount higher than the user's balance
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[SCRIPT_BALANCE][TMP]"
        );
    });

    it("fails if the user doesn't have enough balance, even tho the balance condition was not set - PRC", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = BigNumber.from("10000"); // wanna pay 100%
        message.typeAmt = AmountType.Percentage;
        message = await initialize(message);

        // let's get rid of the BTC
        await DAIToken.transfer(DAIToken.address, await DAIToken.balanceOf(owner.address));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[SCRIPT_BALANCE][TMP]"
        );
    });

    it("fails if the user wants to borrow more than the borrowable amount - ABS", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = ethers.utils.parseEther("10000"); // can borrow 3325, this is way too much and will fail
        message.action = AdvancedMoneyMarketActionType.Borrow;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[BORROW_TOO_HIGH][TMP]"
        );
    });

    it("fails if the user wants to borrow more than the borrowable amount - PRC", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.amount = BigNumber.from("10000"); // wanna borrow 100% of borrowable
        message.typeAmt = AmountType.Percentage;
        message.action = AdvancedMoneyMarketActionType.Borrow;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[BORROW_TOO_HIGH][FINAL]"
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
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
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
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
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
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.balance.enabled = true;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[BALANCE_CONDITION_LOW][TMP]"
        );
    });

    it("fails the verification if balance is enabled and the user owns too many tokens", async () => {
        // update frequency in message and submit for signature
        // we'll change the comparison so it will become "FOO_TOKEN<150"
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.balance.enabled = true;
        message.balance.comparison = ComparisonType.LessThan;
        message = await initialize(message);

        // add tokens to the user address so the check will fail
        await fooToken.mint(owner.address, ethers.utils.parseEther("200"));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[BALANCE_CONDITION_HIGH][TMP]"
        );
    });

    /* ========== PRICE CONDITION CHECK ========== */

    it("fails the verification if price is enabled with GREATER_THAN condition and tokenPrice < value", async () => {
        // update price in message and submit for signature.
        // Condition: FOO > 1.01
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.GreaterThan;
        message.price.value = ethers.utils.parseEther("1.01");
        message = await initialize(message);

        // verification should fail as the price lower than expected
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[PRICE_CONDITION_LOW][TMP]"
        );
    });

    it("fails the verification if price is enabled with LESS_THAN condition and tokenPrice > value", async () => {
        // update price in message and submit for signature.
        // Condition: FOO < 0.99
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.LessThan;
        message.price.value = ethers.utils.parseEther("0.99");
        message = await initialize(message);

        // verification should fail as the price lower than expected
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[PRICE_CONDITION_HIGH][TMP]"
        );
    });

    it("passes the price verification if conditions are met", async () => {
        // update price in message and submit for signature.
        // Condition: FOO > 0.99
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.GreaterThan;
        message.price.value = ethers.utils.parseEther("0.99");
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
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.tip = ethers.utils.parseEther("15000");
        message = await initialize(message);

        // empty the gas tank and try to verify the message
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith("[TIP][TMP]");
    });

    it("Pays the tip to the executor", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.tip = ethers.utils.parseEther("5");
        message = await initialize(message);

        // deposit DAEM in the Tip Jar
        await DAEMToken.approve(gasTank.address, ethers.utils.parseEther("10000"));
        await gasTank.connect(owner).depositTip(ethers.utils.parseEther("10"));
        let tipBalance = await gasTank.tipBalanceOf(owner.address);
        expect(tipBalance).to.be.equal(ethers.utils.parseEther("10"));

        await executor.connect(otherWallet).execute(message, sigR, sigS, sigV);

        // tokens have been removed from the user's tip jar
        tipBalance = await gasTank.tipBalanceOf(owner.address);
        expect(tipBalance).to.be.equal(ethers.utils.parseEther("5"));
    });

    /* ========== ALLOWANCE CONDITION CHECK ========== */

    it("fails if the user did not grant enough allowance to the executor contract - REPAY", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = AdvancedMoneyMarketActionType.Repay;
        message = await initialize(message);

        // revoke the allowance for the token to the executor contract
        await DAIToken.approve(executor.address, ethers.utils.parseEther("0"));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[ALLOWANCE][ACTION]"
        );
    });

    it("fails if the user did not grant enough allowance to the executor contract - BORROW", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = AdvancedMoneyMarketActionType.Borrow;
        message = await initialize(message);

        // revoke the allowance for the token to the executor contract
        await vDebtDAIToken.approveDelegation(executor.address, ethers.utils.parseEther("0"));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[ALLOWANCE][ACTION]"
        );
    });

    /* ========== REPETITIONS CONDITION CHECK ========== */

    it("fails if the script has been executed more than the allowed repetitions", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        message.action = AdvancedMoneyMarketActionType.Repay;
        message.typeAmt = AmountType.Percentage;
        message.amount = BigNumber.from(500); //5%
        message.repetitions.enabled = true;
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
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
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

        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        // setting the follow condition to use another executor, so to test the external calls.
        message.follow.enabled = true;
        message.follow.executor = otherExecutor.address;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FOLLOW_CONDITION][TMP]"
        );
    });

    /* ========== HEALTH FACTOR CONDITION CHECK ========== */

    it("fails if current health factor is lower than threshold when looking for GreaterThan", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        // enabling the health factor condition
        // the MM pool has HF:3.75 due to the amount deposited and borrowed
        message.healthFactor.enabled = true;
        message.healthFactor.amount = ethers.utils.parseEther("4");
        message.healthFactor.comparison = ComparisonType.GreaterThan;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[HEALTH_FACTOR_LOW][TMP]"
        );
    });

    it("fails if current health factor is higher than threshold when looking for LessThan", async () => {
        let message: IMMAdvancedAction = JSON.parse(JSON.stringify(baseMessage));
        // enabling the health factor condition
        // the MM pool has HF:3.75 due to the amount deposited and borrowed
        message.healthFactor.enabled = true;
        message.healthFactor.amount = ethers.utils.parseEther("3.5");
        message.healthFactor.comparison = ComparisonType.LessThan;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[HEALTH_FACTOR_HIGH][TMP]"
        );
    });
});
