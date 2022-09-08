import { BaseProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, utils } from "ethers";
import { ethers, network } from "hardhat";
import hre from "hardhat";

describe("GasTank [FORKED CHAIN]", function () {
    let provider: BaseProvider;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let gasTank: Contract;
    let treasury: Contract;
    let daemToken: Contract;

    const fakeScriptId = "0x7465737400000000000000000000000000000000000000000000000000000000";


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

        // get the default provider
        provider = ethers.provider;

        // get some wallets
        [owner, user1, user2] = await ethers.getSigners();

        // Token contracts
        const FooTokenContract = await ethers.getContractFactory("MockToken");
        daemToken = await FooTokenContract.deploy("DAEM Token", "DAEM");

        // GasTank contract
        const GasTankContract = await ethers.getContractFactory("GasTank");
        gasTank = await GasTankContract.deploy();

        // create liquidity manager
        const LiquidityManager = await ethers.getContractFactory("UniswapV2LiquidityManager");
        const liquidityManager = await LiquidityManager.deploy(
            daemToken.address,
            "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506" // quickswap router
        );

        // Treasury contract
        const TreasuryContract = await ethers.getContractFactory("Treasury");
        treasury = await TreasuryContract.deploy(
            daemToken.address,
            gasTank.address,
            liquidityManager.address
        );

        // create LP
        const ETHAmount = utils.parseEther("2000");
        const DAEMAmount = utils.parseEther("2000");
        await daemToken.mint(owner.address, DAEMAmount);
        await daemToken.approve(liquidityManager.address, utils.parseEther("2000"));
        await liquidityManager.createLP(DAEMAmount, treasury.address, { value: ETHAmount });

        // add some tokens to treasury and users
        daemToken.mint(treasury.address, utils.parseEther("100"));
        daemToken.mint(owner.address, utils.parseEther("100"));
        daemToken.mint(user1.address, utils.parseEther("110"));

        // have the users give the allowance to the gasTank
        daemToken.connect(owner).approve(gasTank.address, utils.parseEther("500"));
        daemToken.connect(user1).approve(gasTank.address, utils.parseEther("500"));

        // set gasTank dependencies
        await gasTank.setTreasury(treasury.address);
        await gasTank.addExecutor(owner.address);
        await gasTank.setDAEMToken(daemToken.address);

        // check that everything has been set correctly
        await gasTank.preliminaryCheck();
        await treasury.preliminaryCheck();

        // get a snapshot of the current state so to speed up tests
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    describe("GAS Withdrawals and Deposits", function () {
        it("accepts deposits and shows correct balance", async () => {
            // deposit 1 eth into the gas tank
            const oneEth = utils.parseEther("1.0");
            await gasTank.depositGas({ value: oneEth });

            // the user balance in the gas tank should be 1 eth
            const userBalanceInTank = await gasTank.gasBalanceOf(owner.address);
            expect(userBalanceInTank).to.equal(oneEth);

            // the total balance of the gas tank should also be 1 eth
            const tankTotalBalance = await provider.getBalance(gasTank.address);
            expect(tankTotalBalance).to.equal(oneEth);
        });

        it("allows users to withdraw funds", async () => {
            const oneEth = utils.parseEther("1.0");
            await gasTank.depositGas({ value: oneEth });

            const oThreeEth = utils.parseEther("0.3");
            await gasTank.withdrawGas(oThreeEth);

            // the user balance should have been updated
            const userBalanceInTank = await gasTank.gasBalanceOf(owner.address);
            expect(userBalanceInTank).to.equal(utils.parseEther("0.7"));

            // same for the total balance of the tank
            const tankTotalBalance = await provider.getBalance(gasTank.address);
            expect(tankTotalBalance).to.equal(utils.parseEther("0.7"));
        });

        it("allows users to withdraw everything", async () => {
            const oneEth = utils.parseEther("1.0");
            await gasTank.depositGas({ value: oneEth });

            await gasTank.withdrawAllGas();

            // the user balance should have been updated
            const userBalanceInTank = await gasTank.gasBalanceOf(owner.address);
            expect(userBalanceInTank).to.equal(utils.parseEther("0"));

            // same for the total balance of the tank
            const tankTotalBalance = await provider.getBalance(gasTank.address);
            expect(tankTotalBalance).to.equal(utils.parseEther("0"));
        });
    });

    describe("TIP Withdrawals and Deposits", function () {
        it("accepts deposits and shows correct balance", async () => {
            // deposit 1 eth into the gas tank
            const oneDAEM = utils.parseEther("1.0");
            await gasTank.depositTip(oneDAEM);

            // the user balance in the tip jar should be 1 DAEM
            const userBalanceInTank = await gasTank.tipBalanceOf(owner.address);
            expect(userBalanceInTank).to.equal(oneDAEM);

            // the total balance of the gas tank should also be 1 DAEM
            const tankTotalBalance = await daemToken.balanceOf(gasTank.address);
            expect(tankTotalBalance).to.equal(oneDAEM);
        });

        it("allows users to withdraw funds", async () => {
            const oneDAEM = utils.parseEther("1.0");
            await gasTank.depositTip(oneDAEM);

            const oThreeDAEM = utils.parseEther("0.3");
            await gasTank.withdrawTip(oThreeDAEM);

            // the user balance should have been updated
            const userBalanceInTank = await gasTank.tipBalanceOf(owner.address);
            expect(userBalanceInTank).to.equal(utils.parseEther("0.7"));

            // same for the total balance of the tank
            const tankTotalBalance = await daemToken.balanceOf(gasTank.address);
            expect(tankTotalBalance).to.equal(utils.parseEther("0.7"));
        });

        it("allows users to withdraw everything", async () => {
            const oneDAEM = utils.parseEther("1.0");
            await gasTank.depositTip(oneDAEM);

            await gasTank.withdrawAllTip();

            // the user balance should have been updated
            const userBalanceInTank = await gasTank.tipBalanceOf(owner.address);
            expect(userBalanceInTank).to.equal(utils.parseEther("0"));

            // same for the total balance of the tank
            const tankTotalBalance = await daemToken.balanceOf(gasTank.address);
            expect(tankTotalBalance).to.equal(utils.parseEther("0"));
        });
    });

    describe("Rewards and Claims (no tips included)", function () {
        it("allows executors to add rewards", async () => {
            // USER1 deposits 1 eth into the gas tank
            const oneEth = utils.parseEther("1.0");
            const zeroTip = utils.parseEther("0");
            await gasTank.connect(user1).depositGas({ value: oneEth });

            // the user balance in the gas tank should be 1 eth
            const userBalanceInTank = await gasTank.gasBalanceOf(user1.address);
            expect(userBalanceInTank).to.equal(oneEth);

            // owner (impersonating the executor contract) adds a reward for user2
            const rewardAmount = utils.parseEther("0.05");
            const rewardAmountToDAEM = utils.parseEther("0.049848757519718821");
            await gasTank
                .connect(owner)
                .addReward(fakeScriptId, rewardAmount, zeroTip, user1.address, user2.address);

            // balances should have been updated
            expect(await gasTank.claimable(user2.address)).to.equal(rewardAmountToDAEM);
            expect(await gasTank.gasBalanceOf(user1.address)).to.equal(oneEth.sub(rewardAmount));
        });

        it("revert if non executors try to add a reward", async () => {
            // remove executor so it'll revert the tx
            await gasTank.removeExecutor(owner.address);

            const oneEth = utils.parseEther("1.0");
            const zeroTip = utils.parseEther("0");
            const rewardAmount = utils.parseEther("0.05");
            await gasTank.connect(user1).depositGas({ value: oneEth });

            // this will revert as owner is not marked as executor anymore
            await expect(
                gasTank
                    .connect(owner)
                    .addReward(fakeScriptId, rewardAmount, zeroTip, user1.address, user2.address)
            ).to.be.revertedWith("Unauthorized. Only Executors");
        });

        it("when claiming reward, ETH will be sent to treasury", async () => {
            // user 1: 0.95ETH as balance, user 2: 0.05ETH as claimable
            const oneEth = utils.parseEther("1.0");
            const zeroTip = utils.parseEther("0");
            const rewardAmount = utils.parseEther("0.05");
            await gasTank.connect(user1).depositGas({ value: oneEth });
            await gasTank
                .connect(owner)
                .addReward(fakeScriptId, rewardAmount, zeroTip, user1.address, user2.address);

            // user 2 claim their reward
            await gasTank.connect(user2).claimReward();

            // treasury received the funds
            const treasuryTotalBalance = await provider.getBalance(treasury.address);
            expect(treasuryTotalBalance).to.equal(rewardAmount);

            // claimable amount is now 0
            expect((await gasTank.claimable(user2.address)).toNumber()).to.equal(0);

            // user2 received some tokens (ETH:DAEM are converted 1:1-, due to the LP fee)
            const expectedReward = utils.parseEther("0.049848757519718821");
            expect(await daemToken.balanceOf(user2.address)).to.equal(expectedReward);
        });

        it("when staking reward, ETH will be sent to treasury", async () => {
            // user 1: 0.95ETH as balance, user 2: 0.05ETH as claimable
            const oneEth = utils.parseEther("1.0");
            const zeroTip = utils.parseEther("0");
            const rewardAmount = utils.parseEther("0.05");
            await gasTank.connect(user1).depositGas({ value: oneEth });
            await gasTank
                .connect(owner)
                .addReward(fakeScriptId, rewardAmount, zeroTip, user1.address, user2.address);

            // user 2 claim AND STAKE their reward
            await gasTank.connect(user2).claimAndStakeReward();

            // treasury received the funds
            const treasuryTotalBalance = await provider.getBalance(treasury.address);
            expect(treasuryTotalBalance).to.equal(rewardAmount);

            // claimable amount is now 0
            expect((await gasTank.claimable(user2.address)).toNumber()).to.equal(0);

            // user2 did *NOT*  receive some tokens (ETH:DAEM are converted 1:1-, due to the LP fee)
            const expectedReward = utils.parseEther("0.049848757519718821");
            expect(await daemToken.balanceOf(user2.address)).to.equal(BigNumber.from(0));

            // instead the funds are added to the user's balance of the treasury
            expect(await treasury.balanceOf(user2.address)).to.equal(expectedReward);
        });
    });

    describe("Rewards and Claims (WITH tips)", function () {
        it("allows executors to add rewards with tips", async () => {
            // USER1 deposits 1 eth into the gas tank and tip jar
            const oneEth = utils.parseEther("1.0");
            const oneDAEMTip = utils.parseEther("1.0");
            await gasTank.connect(user1).depositGas({ value: oneEth });
            await gasTank.connect(user1).depositTip(oneDAEMTip);

            // the user balance in the gas tank should be 1 eth
            const userBalanceInTank = await gasTank.gasBalanceOf(user1.address);
            expect(userBalanceInTank).to.equal(oneEth);

            // owner (impersonating the executor contract) adds a reward for user2
            const rewardAmount = utils.parseEther("0.05");
            const tipAmount = utils.parseEther("0.5"); // 0.5 DAEM
            await gasTank
                .connect(owner)
                .addReward(fakeScriptId, rewardAmount, tipAmount, user1.address, user2.address);

            // balances should have been updated
            const tipForExecutor = utils.parseEther("0.4"); // 80% of full tip
            const rewardAmountToDAEM = utils.parseEther("0.049848757519718821");
            const claimable = rewardAmountToDAEM.add(tipForExecutor);
            expect(await gasTank.claimable(user2.address)).to.equal(claimable);
            expect(await gasTank.tipBalanceOf(user1.address)).to.equal(oneEth.sub(tipAmount));
        });

        it("when adding reward, DAEM tip will be sent to treasury", async () => {
            const oneEth = utils.parseEther("1.0");
            const oneDAEMTip = utils.parseEther("1.0");
            const rewardAmount = utils.parseEther("0.05");
            const tipAmount = utils.parseEther("0.5"); // 0.5 DAEM
            await gasTank.connect(user1).depositGas({ value: oneEth });
            await gasTank.connect(user1).depositTip(oneDAEMTip);
            const DAEMBalanceBeforeReward = await daemToken.balanceOf(treasury.address);

            await gasTank
                .connect(owner)
                .addReward(fakeScriptId, rewardAmount, tipAmount, user1.address, user2.address);

            const DAEMBalanceAfterReward = await daemToken.balanceOf(treasury.address);
            const difference = DAEMBalanceAfterReward.sub(DAEMBalanceBeforeReward);
            expect(difference).to.equal(tipAmount);
        });

        it("when claiming reward, DAEM tip is sent to user", async () => {
            const oneEth = utils.parseEther("1.0");
            const oneDAEMTip = utils.parseEther("1.0");
            const rewardAmount = utils.parseEther("0.05");
            const tipAmount = utils.parseEther("0.5"); // 0.5 DAEM
            await gasTank.connect(user1).depositGas({ value: oneEth });
            await gasTank.connect(user1).depositTip(oneDAEMTip);
            await gasTank
                .connect(owner)
                .addReward(fakeScriptId, rewardAmount, tipAmount, user1.address, user2.address);

            const DAEMBalanceBeforeClaiming = await daemToken.balanceOf(treasury.address);

            // user 2 claim their reward
            await gasTank.connect(user2).claimReward();

            // check how much has been sent by verifying the treasury DAEM balance
            const DAEMBalanceAfterClaiming = await daemToken.balanceOf(treasury.address);
            const difference = DAEMBalanceBeforeClaiming.sub(DAEMBalanceAfterClaiming);
            const expectedSentToUser = utils.parseEther("0.449848757519718"); // 0.4 from tip + ~0.05 from reward
            expect(difference.div(1000)).to.equal(expectedSentToUser.div(1000));

            // claimable amount is now 0
            expect((await gasTank.claimable(user2.address)).toNumber()).to.equal(0);
        });

        it("when staking reward, DAEM is staked to treasury", async () => {
            const oneEth = utils.parseEther("1.0");
            const oneDAEMTip = utils.parseEther("1.0");
            const rewardAmount = utils.parseEther("0.05");
            const tipAmount = utils.parseEther("0.5"); // 0.5 DAEM
            await gasTank.connect(user1).depositGas({ value: oneEth });
            await gasTank.connect(user1).depositTip(oneDAEMTip);
            await gasTank
                .connect(owner)
                .addReward(fakeScriptId, rewardAmount, tipAmount, user1.address, user2.address);

            const DAEMBalanceBeforeClaiming = await daemToken.balanceOf(treasury.address);

            // user 2 claim AND STAKE their reward
            await gasTank.connect(user2).claimAndStakeReward();

            // check how much has been sent by verifying the treasury DAEM balance
            const DAEMBalanceAfterClaiming = await daemToken.balanceOf(treasury.address);
            const difference = DAEMBalanceBeforeClaiming.sub(DAEMBalanceAfterClaiming);

            // user2 did *NOT* receive tokens
            const expectedSentToUser = utils.parseEther("0");
            expect(difference).to.equal(expectedSentToUser);

            // all reward has been staked
            const expectedStaked = utils.parseEther("0.449848757519718"); // 0.4 from tip + ~0.05 from reward
            expect((await treasury.balanceOf(user2.address)).div(1000)).to.equal(expectedStaked.div(1000));

            // claimable amount is now 0
            expect((await gasTank.claimable(user2.address)).toNumber()).to.equal(0);
        });
    });
});
