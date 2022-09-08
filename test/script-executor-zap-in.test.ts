import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, network } from "hardhat";
import { AmountType, ComparisonType } from "@daemons-fi/shared-definitions";
import { zapInDomain, IZapInAction, zapInTypes } from "@daemons-fi/shared-definitions";
import hre from "hardhat";

describe("ScriptExecutor - ZapIn [FORKED CHAIN]", function () {
    let owner: SignerWithAddress;
    let otherWallet: SignerWithAddress;

    // contracts
    let gasTank: Contract;
    let executor: Contract;
    let DAEMToken: Contract;
    let wETH: Contract;
    let wBTC: Contract;
    let lpToken: Contract;
    let uniswapRouter: Contract;

    // signature components
    let sigR: string;
    let sigS: string;
    let sigV: number;

    let baseMessage: IZapInAction = {
        scriptId: "0x7465737400000000000000000000000000000000000000000000000000000000",
        pair: "",
        amountA: ethers.utils.parseEther("0"),
        amountB: ethers.utils.parseEther("0"),
        typeAmtA: AmountType.Absolute,
        typeAmtB: AmountType.Absolute,
        user: "",
        kontract: "",
        executor: "",
        chainId: BigNumber.from(31337),
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
        await gasTank.depositGas({ value: ethers.utils.parseEther("2.0") });

        // Add DAEM contracts
        const MockTokenContract = await ethers.getContractFactory("MockToken");
        DAEMToken = await MockTokenContract.deploy("Foo Token", "FOO");

        // Gas Price Feed contract
        const GasPriceFeedContract = await ethers.getContractFactory("GasPriceFeed");
        const gasPriceFeed = await GasPriceFeedContract.deploy();

        // Executor contract
        const ZapInScriptExecutorContract = await ethers.getContractFactory("ZapInScriptExecutor");
        executor = await ZapInScriptExecutorContract.deploy();
        await executor.setGasTank(gasTank.address);
        await executor.setGasFeed(gasPriceFeed.address);

        // register executor in gas tank
        await gasTank.addExecutor(executor.address);
        await gasTank.setDAEMToken(DAEMToken.address);

        /** STRATEGY */
        // As we are on a fork, we cannot use mocked tokens.
        // The only way around it is to use the fake ETH that come with each
        // wallet to buy wETH and wBTC and use them for our tests

        // Get real router
        uniswapRouter = await ethers.getContractAt(
            "IUniswapV2Router01",
            "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506"
        );

        // Use the MATIC to get wETH
        const amountWETH = ethers.utils.parseEther("4500");
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
        const amountWBTC = ethers.utils.parseEther("4500"); // in matic
        const wBTCAddress = "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6";
        wBTC = await ethers.getContractAt("IERC20", wBTCAddress);
        await uniswapRouter.swapExactETHForTokens(
            0,
            [wMATICAddress, wETHAddress, wBTCAddress],
            owner.address,
            BigNumber.from("0xffffffffffffffffffff"),
            { value: amountWBTC }
        );
        const wBTCBalance = await wBTC.balanceOf(owner.address);
        console.log(`wBTC Balance: ${wBTCBalance.toString()}`);

        // get LP address
        const factoryAddress = await uniswapRouter.factory();
        const factory = await ethers.getContractAt("IUniswapV2Factory", factoryAddress);
        const lpAddress = await factory.getPair(wETH.address, wBTC.address);

        // verify pair tokens are sorted correctly
        lpToken = await ethers.getContractAt("IUniswapV2Pair", lpAddress);
        const t0 = await lpToken.token0();
        const t1 = await lpToken.token1();
        expect(t0.toLowerCase()).to.equal(wBTC.address);
        expect(t1.toLowerCase()).to.equal(wETH.address);

        // Grant allowance
        await DAEMToken.approve(executor.address, ethers.utils.parseEther("1000000"));
        await wBTC.approve(executor.address, ethers.utils.parseEther("1000000"));
        await wETH.approve(executor.address, ethers.utils.parseEther("1000000"));

        // Generate DAEM balance
        await DAEMToken.mint(owner.address, ethers.utils.parseEther("250"));

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
        const ETHAmount = ethers.utils.parseEther("5");
        const DAEMAmount = ethers.utils.parseEther("10");
        await DAEMToken.mint(owner.address, DAEMAmount);
        await DAEMToken.approve(liquidityManager.address, DAEMAmount);
        await liquidityManager.createLP(DAEMAmount, treasury.address, { value: ETHAmount });

        // add some tokens to treasury
        DAEMToken.mint(treasury.address, ethers.utils.parseEther("110"));

        // set treasury address in gas tank
        await gasTank.setTreasury(treasury.address);

        // check that everything has been set correctly
        await executor.preliminaryCheck();
        await gasTank.preliminaryCheck();
        await treasury.preliminaryCheck();

        // set base message amount
        baseMessage.amountA = await wBTC.balanceOf(owner.address);              // all wBTC
        baseMessage.amountB = (await wETH.balanceOf(owner.address)).div(2);     // half wETH

        // get a snapshot of the current state so to speed up tests
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    async function initialize(baseMessage: IZapInAction): Promise<IZapInAction> {
        // Create message and fill missing info
        const message = { ...baseMessage };
        message.user = owner.address;
        message.executor = executor.address;
        message.pair = lpToken.address;
        message.kontract = uniswapRouter.address;
        message.balance.token = wETH.address;
        message.price.tokenA = wETH.address;
        message.price.tokenB = wBTC.address;
        message.price.router = uniswapRouter.address;
        message.follow.executor = executor.address; // following itself, it'll never be executed when condition is enabled

        // Sign message
        const signature = await owner._signTypedData(zapInDomain, zapInTypes, message);
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
        console.log(message);
        const tamperedMessage = { ...message };
        tamperedMessage.amountA = ethers.utils.parseEther("0");
        console.log(tamperedMessage);

        await expect(executor.verify(tamperedMessage, sigR, sigS, sigV)).to.be.revertedWith(
            "[SIGNATURE][FINAL]"
        );
    });

    it("spots a valid message from another chain", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.chainId = BigNumber.from("1"); // message created for the Ethereum chain
        message = await initialize(message);

        // as the contract is created on chain 42, it will refuse to execute this message
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[CHAIN][ERROR]"
        );
    });

    it("zaps the LP - Single Side - ABS 0", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtB = AmountType.Absolute;
        message.amountA = await wBTC.balanceOf(owner.address);              // all wBTC
        message.amountB = ethers.utils.parseEther("0");                     // no wETH
        message = await initialize(message);
        const wETHOriginalBalance = await wETH.balanceOf(owner.address);

        await executor.execute(message, sigR, sigS, sigV);

        // user got the LP
        expect((await lpToken.balanceOf(owner.address)).gte(0)).to.be.true;

        // executor got the right tokens
        expect(await wBTC.balanceOf(owner.address)).to.equal(BigNumber.from(0));
        expect(await wETH.balanceOf(owner.address)).to.equal(wETHOriginalBalance);

        // the dust in the executor should be minimal
        const wBTCLeftovers = (await wBTC.balanceOf(executor.address)).toNumber();
        const wETHLeftovers = (await wETH.balanceOf(executor.address)).toNumber();
        expect(wBTCLeftovers).to.lessThan(10); // 10 Satoshis limit
        expect(wETHLeftovers).to.lessThan(5000000000000); // 0.000005 ETH limit
    });

    it("zaps the LP - Single Side - 0 ABS", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtB = AmountType.Absolute;
        message.amountA = ethers.utils.parseEther("0");                     // no wBTC
        message.amountB = await wETH.balanceOf(owner.address);              // all wETH
        message = await initialize(message);
        const wBTCOriginalBalance = await wBTC.balanceOf(owner.address);

        await executor.execute(message, sigR, sigS, sigV);

        // user got the LP
        expect((await lpToken.balanceOf(owner.address)).gte(0)).to.be.true;

        // executor got the right tokens
        expect(await wBTC.balanceOf(owner.address)).to.equal(wBTCOriginalBalance);
        expect(await wETH.balanceOf(owner.address)).to.equal(BigNumber.from(0));

        // the dust in the executor should be minimal
        const wBTCLeftovers = (await wBTC.balanceOf(executor.address)).toNumber();
        const wETHLeftovers = (await wETH.balanceOf(executor.address)).toNumber();
        expect(wBTCLeftovers).to.lessThan(10); // 10 Satoshis limit
        expect(wETHLeftovers).to.lessThan(5000000000000); // 0.000005
    });

    it("zaps the LP - Single Side - PRC 0", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtA = AmountType.Percentage;
        message.typeAmtB = AmountType.Absolute;
        message.amountA = BigNumber.from(5000);                             // 50% of BTC
        message.amountB = ethers.utils.parseEther("0");                     // no wETH
        message = await initialize(message);
        const wBTCOriginalBalance = await wBTC.balanceOf(owner.address);
        const wETHOriginalBalance = await wETH.balanceOf(owner.address);

        await executor.execute(message, sigR, sigS, sigV);

        // user got the LP
        expect((await lpToken.balanceOf(owner.address)).gte(0)).to.be.true;

        // executor got the right tokens
        expect((await wBTC.balanceOf(owner.address)).sub(wBTCOriginalBalance.div(2)).lt(2)).to.be.true;
        expect(await wETH.balanceOf(owner.address)).to.equal(wETHOriginalBalance);

        // the dust in the executor should be minimal
        const wBTCLeftovers = (await wBTC.balanceOf(executor.address)).toNumber();
        const wETHLeftovers = (await wETH.balanceOf(executor.address)).toNumber();
        expect(wBTCLeftovers).to.lessThan(10); // 10 Satoshis limit
        expect(wETHLeftovers).to.lessThan(5000000000000); // 0.000005 ETH limit
    });

    it("zaps the LP - Single Side - 0 PRC", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtA = AmountType.Absolute;
        message.typeAmtB = AmountType.Percentage;
        message.amountA = ethers.utils.parseEther("0");                     // no wBTC
        message.amountB = BigNumber.from(5000);                             // 50% of wETH
        message = await initialize(message);
        const wBTCOriginalBalance = await wBTC.balanceOf(owner.address);
        const wETHOriginalBalance = await wETH.balanceOf(owner.address);

        await executor.execute(message, sigR, sigS, sigV);

        // user got the LP
        expect((await lpToken.balanceOf(owner.address)).gte(0)).to.be.true;

        // executor got the right tokens
        expect(await wBTC.balanceOf(owner.address)).to.equal(wBTCOriginalBalance);
        expect((await wETH.balanceOf(owner.address)).sub(wETHOriginalBalance.div(2)).lt(2)).to.be.true; // check difference, as it might be 1 if value is odd

        // the dust in the executor should be minimal
        const wBTCLeftovers = (await wBTC.balanceOf(executor.address)).toNumber();
        const wETHLeftovers = (await wETH.balanceOf(executor.address)).toNumber();
        expect(wBTCLeftovers).to.lessThan(10); // 10 Satoshis limit
        expect(wETHLeftovers).to.lessThan(5000000000000); // 0.000005
    });

    it("zaps the LP - Double side - ABS ABS", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtB = AmountType.Absolute;
        message.amountA = await wBTC.balanceOf(owner.address);              // all wBTC
        message.amountB = (await wETH.balanceOf(owner.address)).div(2);     // half wETH
        message = await initialize(message);
        const wETHOriginalBalance = await wETH.balanceOf(owner.address);

        await executor.execute(message, sigR, sigS, sigV);

        // now the wallet should contain the LP token
        expect((await lpToken.balanceOf(owner.address)).gte(0)).to.be.true;

        // executor got the right tokens
        expect(await wBTC.balanceOf(owner.address)).to.equal(BigNumber.from(0));
        expect((await wETH.balanceOf(owner.address)).sub(wETHOriginalBalance.div(2)).lt(2)).to.be.true; // check difference, as it might be 1 if value is odd

        // the dust in the executor should be minimal
        const wBTCLeftovers = (await wBTC.balanceOf(executor.address)).toNumber();
        const wETHLeftovers = (await wETH.balanceOf(executor.address)).toNumber();
        expect(wBTCLeftovers).to.lessThan(10); // 10 Satoshis limit
        expect(wETHLeftovers).to.lessThan(5000000000000); // 0.000005
    });

    it("zaps the LP - Double side - PRC PRC", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtA = AmountType.Percentage;
        message.typeAmtB = AmountType.Percentage;
        message.amountA = BigNumber.from(7500);              // 75% of wBTC
        message.amountB = BigNumber.from(2500);              // 25% of wETH
        message = await initialize(message);
        const wBTCOriginalBalance = await wBTC.balanceOf(owner.address);
        const wETHOriginalBalance = await wETH.balanceOf(owner.address);

        await executor.execute(message, sigR, sigS, sigV);

        // now the wallet should contain the LP token
        expect((await lpToken.balanceOf(owner.address)).gte(0)).to.be.true;

        // executor got the right tokens
        expect((await wBTC.balanceOf(owner.address)).sub(wBTCOriginalBalance.div(4)).lt(2)).to.be.true; // check difference, as it might be 1 if value is odd
        expect((await wETH.balanceOf(owner.address)).sub(wETHOriginalBalance.mul(3).div(4)).lt(2)).to.be.true; // check difference, as it might be 1 if value is odd

        // the dust in the executor should be minimal
        const wBTCLeftovers = (await wBTC.balanceOf(executor.address)).toNumber();
        const wETHLeftovers = (await wETH.balanceOf(executor.address)).toNumber();
        expect(wBTCLeftovers).to.lessThan(10); // 10 Satoshis limit
        expect(wETHLeftovers).to.lessThan(5000000000000); // 0.000005
    });

    it("zapping triggers reward in gas tank", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.amountA = (await wBTC.balanceOf(owner.address)).div(3);     // 33% of wBTC
        message.amountB = ethers.utils.parseEther("0");                     // no wETH
        message = await initialize(message);

        await executor.execute(message, sigR, sigS, sigV);

        // gasTank should NOT have a claimable amount now for user1
        expect((await gasTank.claimable(otherWallet.address)).toNumber()).to.equal(0);

        await executor.connect(otherWallet).execute(message, sigR, sigS, sigV);

        // gasTank should have a claimable amount now for user1
        expect((await gasTank.claimable(otherWallet.address)).toNumber()).to.not.equal(0);
    });

    it("zapping is cheap - Single Side - ABS 0", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000429989080837932 ETH.
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtA = AmountType.Absolute;
        message.amountA = await wBTC.balanceOf(owner.address);              // all wBTC
        message.amountB = ethers.utils.parseEther("0");                     // no wETH
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.0005");
        console.log("Spent for zapping:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("zapping is cheap - Single Side - PRC 0", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000437096082174048 ETH.
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtA = AmountType.Percentage;
        message.amountA = BigNumber.from(7500)                              // 75% of wBTC
        message.amountB = ethers.utils.parseEther("0");                     // no wETH
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.0005");
        console.log("Spent for zapping:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("zapping is cheap - Double Side - ABS ABS", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000444223083513924 ETH.
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtA = AmountType.Absolute;
        message.typeAmtB = AmountType.Absolute;
        message.amountA = await wBTC.balanceOf(owner.address);              // all wBTC
        message.amountB = (await wETH.balanceOf(owner.address)).div(2);     // half wETH
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.0005");
        console.log("Spent for zapping:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("zapping is cheap - Double Side - PRC PRC", async () => {
        // At the time this test was last checked, the gas spent to
        // execute the script was 0.000444223083513924 ETH.
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.typeAmtA = AmountType.Absolute;
        message.typeAmtB = AmountType.Absolute;
        message.amountA = await wBTC.balanceOf(owner.address);              // all wBTC
        message.amountB = (await wETH.balanceOf(owner.address)).div(2);     // half wETH
        message = await initialize(message);

        const initialBalance = await owner.getBalance();
        await executor.execute(message, sigR, sigS, sigV);
        const spentAmount = initialBalance.sub(await owner.getBalance());

        const threshold = ethers.utils.parseEther("0.0005");
        console.log("Spent for zapping:", spentAmount.toString());
        expect(spentAmount.lte(threshold)).to.equal(true);
    });

    it("sets the lastExecution value during execution", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.amountA = (await wBTC.balanceOf(owner.address)).div(3);     // 33% of wBTC
        message.amountB = ethers.utils.parseEther("0");                     // no wETH
        // enable frequency condition so 2 consecutive executions should fail
        message.frequency.enabled = true;
        message = await initialize(message);

        // the first one goes through
        await executor.execute(message, sigR, sigS, sigV);

        // the second one fails as not enough blocks have passed
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FREQUENCY_CONDITION][TMP]"
        );
    });

    /* ========== ACTION INTRINSIC CHECK ========== */

    it("fails if the user passes amount 0 for both tokens", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.amountA = ethers.utils.parseEther("0");
        message.amountB = ethers.utils.parseEther("0");
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[ZERO_AMOUNT][FINAL]"
        );
    });

    it("fails if the user doesn't have enough balance, even tho the balance condition was not set", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.amountA = ethers.utils.parseEther("9999"); // setting an amount higher than the user's balance
        message.amountB = ethers.utils.parseEther("9999"); // setting an amount higher than the user's balance
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[SCRIPT_BALANCE][TMP]"
        );
    });

    // it("fails if the given pair is not supported", async () => {
    //     let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
    //     // initialize message using the same token twice to trigger unsupported pair message
    //     message = await initialize(message);

    //     await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
    //         "[UNSUPPORTED_PAIR][FINAL]"
    //     );
    // });

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
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
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
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
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
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.balance.enabled = true;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[BALANCE_CONDITION_LOW][TMP]"
        );
    });

    // it("fails the verification if balance is enabled and the user owns too many tokens", async () => {
    //     // update frequency in message and submit for signature
    //     // we'll change the comparison so it will become "FOO_TOKEN<150"
    //     let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
    //     message.balance.enabled = true;
    //     message.balance.comparison = ComparisonType.LessThan;
    //     message = await initialize(message);

    //     // add tokens to the user address so the check will fail
    //     await fooToken.mint(owner.address, ethers.utils.parseEther("200"));

    //     await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
    //         "[BALANCE_CONDITION_HIGH][TMP]"
    //     );
    // });

    /* ========== PRICE CONDITION CHECK ========== */

    it("fails the verification if price is enabled with GREATER_THAN condition and tokenPrice < value", async () => {
        // update price in message and submit for signature.
        // Condition: ETH > BTC 0.055
        // PRICE AT SNAPSHOT: 0.05407170
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.GreaterThan;
        message.price.value = ethers.utils.parseUnits("0.055", 8);
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
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.LessThan;
        message.price.value = ethers.utils.parseUnits("0.053", 8);
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
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.price.enabled = true;
        message.price.comparison = ComparisonType.GreaterThan;
        message.price.value = ethers.utils.parseUnits("0.053", 8);
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
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        message.tip = ethers.utils.parseEther("15000");
        message = await initialize(message);

        // empty the gas tank and try to verify the message
        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith("[TIP][TMP]");
    });

//    it("Pays the tip to the executor", async () => {
//         let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
//         message.tip = ethers.utils.parseEther("5");
//         message = await initialize(message);
//         await fooToken.mint(owner.address, ethers.utils.parseEther("55"));

//         // deposit DAEM in the Tip Jar
//         await DAEMToken.approve(gasTank.address, ethers.utils.parseEther("10000"));
//         await gasTank.connect(owner).depositTip(ethers.utils.parseEther("10"));
//         let tipBalance = await gasTank.tipBalanceOf(owner.address);
//         expect(tipBalance).to.be.equal(ethers.utils.parseEther("10"));

//         await executor.connect(otherWallet).execute(message, sigR, sigS, sigV);

//         // tokens have been removed from the user's tip jar
//         tipBalance = await gasTank.tipBalanceOf(owner.address);
//         expect(tipBalance).to.be.equal(ethers.utils.parseEther("5"));
//     });

    /* ========== ALLOWANCE CONDITION CHECK ========== */

    it("fails if the user did not grant enough allowance to the executor contract - TOKEN A", async () => {
        const message = await initialize(baseMessage);

        // revoke the allowance for the token to the executor contract
        await wBTC.approve(executor.address, ethers.utils.parseEther("0"));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[ALLOWANCE][ACTION]"
        );
    });

    it("fails if the user did not grant enough allowance to the executor contract - TOKEN B", async () => {
        const message = await initialize(baseMessage);

        // revoke the allowance for the token to the executor contract
        await wETH.approve(executor.address, ethers.utils.parseEther("0"));

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[ALLOWANCE][ACTION]"
        );
    });

    /* ========== REPETITIONS CONDITION CHECK ========== */

    // it("fails if the script has been executed more than the allowed repetitions", async () => {
    //     let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
    //     message.repetitions.enabled = true;
    //     message.repetitions.amount = BigNumber.from(2);
    //     message = await initialize(message);

    //     // let's get rich. wink.
    //     await fooToken.mint(owner.address, ethers.utils.parseEther("20000000"));
    //     await barToken.mint(owner.address, ethers.utils.parseEther("20000000"));

    //     // first two times it goes through
    //     await executor.execute(message, sigR, sigS, sigV);
    //     await executor.execute(message, sigR, sigS, sigV);

    //     // the third time won't as it'll hit the max-repetitions limit
    //     await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
    //         "[REPETITIONS_CONDITION][FINAL]"
    //     );
    // });

    /* ========== FOLLOW CONDITION CHECK ========== */

    it("fails if the script should follow a script that has not run yet", async () => {
        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
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

        let message: IZapInAction = JSON.parse(JSON.stringify(baseMessage));
        // setting the follow condition to use another executor, so to test the external calls.
        message.follow.enabled = true;
        message.follow.executor = otherExecutor.address;
        message = await initialize(message);

        await expect(executor.verify(message, sigR, sigS, sigV)).to.be.revertedWith(
            "[FOLLOW_CONDITION][TMP]"
        );
    });
});
