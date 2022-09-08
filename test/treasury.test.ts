import { BaseProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import chaiAlmost from "chai-almost";
import { BigNumber, Contract, utils } from "ethers";
import { ethers, network } from "hardhat";
const chai = require("chai");
import hre from "hardhat";

describe("Treasury [FORKED CHAIN]", function () {
    let provider: BaseProvider;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let gasTank: SignerWithAddress;
    let treasury: Contract;
    let liquidityManager: Contract;
    let daemToken: Contract;

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
        [owner, user1, gasTank] = await ethers.getSigners();

        // Token contracts
        const FooTokenContract = await ethers.getContractFactory("MockToken");
        daemToken = await FooTokenContract.deploy("Daemons Token", "DAEM");

        // Get real router
        const quickswapRouter = await ethers.getContractAt(
            "IUniswapV2Router01",
            "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506"
        );

        // create liquidity manager
        const LiquidityManager = await ethers.getContractFactory("UniswapV2LiquidityManager");
        liquidityManager = await LiquidityManager.deploy(
            daemToken.address,
            quickswapRouter.address
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

        // add some tokens to treasury
        await daemToken.mint(treasury.address, ethers.utils.parseEther("2500"));

        // allow treasury to access user's tokens
        await daemToken.approve(treasury.address, ethers.utils.parseEther("500000"));

        // get a snapshot of the current state so to speed up tests
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    describe("Owner controlled setters", function () {
        it("can change commission percentage", async () => {
            // initially commission is set to 1%
            expect(await treasury.PERCENTAGE_COMMISSION()).to.equal(100);

            // owner can change it
            await treasury.setCommissionPercentage(50);
            expect(await treasury.PERCENTAGE_COMMISSION()).to.equal(50);

            // anyone else cannot
            await expect(treasury.connect(user1).setCommissionPercentage(150)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("throws an error if trying to set commission percentage outside bounds", async () => {
            // too high commission
            await expect(treasury.setCommissionPercentage(1500)).to.be.revertedWith(
                "Commission must be at most 5%"
            );
        });

        it("can change protocol owned liquidity (POL) percentage", async () => {
            // initially POL percentage is set to 49%
            expect(await treasury.PERCENTAGE_POL()).to.equal(4900);

            // owner can change it
            await treasury.setPolPercentage(3000);
            expect(await treasury.PERCENTAGE_POL()).to.equal(3000);

            // anyone else cannot
            await expect(treasury.connect(user1).setPolPercentage(2500)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("throws an error if trying to set POL percentage outside bounds", async () => {
            // too high pol percentage
            await expect(treasury.setPolPercentage(8000)).to.be.revertedWith(
                "POL must be at most 50%"
            );

            // too low pol percentage
            await expect(treasury.setPolPercentage(50)).to.be.revertedWith(
                "POL must be at least 5%"
            );
        });

        it("can change redistribution interval", async () => {
            // initially redistributionInterval is set to 180 days (15552000 seconds)
            expect(await treasury.redistributionInterval()).to.equal(15552000);

            // owner can change it (setting to 365 days)
            await treasury.setRedistributionInterval(31536000);
            expect(await treasury.redistributionInterval()).to.equal(31536000);

            // anyone else cannot
            await expect(
                treasury.connect(user1).setRedistributionInterval(15552000)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("throws an error if trying to set redistribution interval outside bounds", async () => {
            // too high redistribution interval (setting 731 days)
            await expect(treasury.setRedistributionInterval(63158400)).to.be.revertedWith(
                "RI must be at most 730 days"
            );

            // too low redistribution interval (setting 29 days)
            await expect(treasury.setRedistributionInterval(2505600)).to.be.revertedWith(
                "RI must be at least 30 days"
            );
        });

        it("can change threshold to enable the buyback", async () => {
            // initially POL percentage is set to 10%
            expect(await treasury.PERCENTAGE_POL_TO_ENABLE_BUYBACK()).to.equal(1000);

            // owner can change it
            await treasury.setPercentageToEnableBuyback(3000);
            expect(await treasury.PERCENTAGE_POL_TO_ENABLE_BUYBACK()).to.equal(3000);

            // anyone else cannot
            await expect(
                treasury.connect(user1).setPercentageToEnableBuyback(2500)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("throws an error if trying to buyback threshold percentage outside bounds", async () => {
            // too high pol percentage
            await expect(treasury.setPercentageToEnableBuyback(8000)).to.be.revertedWith(
                "POL must be at most 60%"
            );

            // too low pol percentage
            await expect(treasury.setPercentageToEnableBuyback(50)).to.be.revertedWith(
                "POL must be at least 2.5%"
            );
        });

        it("whenever liquidity manager is changed, treasury will give it allowance", async () => {
            // the allowance for the current LM must be set
            const currentLMAllowance = await daemToken.allowance(
                treasury.address,
                liquidityManager.address
            );
            expect(currentLMAllowance.gt(0)).to.equal(true);

            // create another liquidity manager and set it to the treasury
            const LiquidityManager = await ethers.getContractFactory("UniswapV2LiquidityManager");
            const liquidityManager2 = await LiquidityManager.deploy(
                daemToken.address,
                "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506"
            );
            await treasury.setLiquidityManager(liquidityManager2.address);

            // the allowance for the previous LM has been revoked
            const previousLMAllowance = await daemToken.allowance(
                treasury.address,
                liquidityManager.address
            );
            expect(previousLMAllowance.toNumber()).to.equal(0);

            // the allowance for the new LM has been granted
            const newLMAllowance = await daemToken.allowance(
                treasury.address,
                liquidityManager2.address
            );
            expect(newLMAllowance.gt(0)).to.equal(true);
        });
    });

    describe("Rewards payouts requests", function () {
        it("only gas tank can initialize payout requests", async () => {
            const amountEth = ethers.utils.parseEther("1.0");
            const amountTip = ethers.utils.parseEther("1.0");

            await expect(
                treasury.requestPayout(user1.address, amountTip, { value: amountEth })
            ).to.be.revertedWith("Unauthorized. Only GasTank");
        });

        it("payout causes tokens to be sent to the user", async () => {
            const amountEth = ethers.utils.parseEther("1.0");
            const amountTip = ethers.utils.parseEther("1.0");

            await treasury
                .connect(gasTank)
                .requestPayout(user1.address, amountTip, { value: amountEth });

            // treasury got the eth
            expect(await provider.getBalance(treasury.address)).to.equal(amountEth);

            // user got the token
            const expectedAmountFromTip = ethers.utils.parseEther("0.8"); // 0.8 from tip (20% tax)
            const expectedAmountFromExecution = await treasury.ethToDAEM(amountEth);
            const expectedAmount = expectedAmountFromTip.add(expectedAmountFromExecution);
            expect(await daemToken.balanceOf(user1.address)).to.equal(expectedAmount);
        });

        it("payout causes ETH to be distributed into pools accordingly", async () => {
            const amountEth = ethers.utils.parseEther("1.0");
            const amountTip = ethers.utils.parseEther("1.0");

            await treasury
                .connect(gasTank)
                .requestPayout(user1.address, amountTip, { value: amountEth });

            // 1% commission, 49% POL, 50% redistribution
            expect(await treasury.commissionsPool()).to.equal(ethers.utils.parseEther("0.01"));
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0.49"));
            expect(await treasury.redistributionPool()).to.equal(ethers.utils.parseEther("0.50"));
        });
    });

    describe("Staking payouts requests", function () {
        it("only gas tank can initialize staking payout requests", async () => {
            const amountEth = ethers.utils.parseEther("1.0");
            const amountTip = ethers.utils.parseEther("1.0");

            await expect(
                treasury.stakePayout(user1.address, amountTip, { value: amountEth })
            ).to.be.revertedWith("Unauthorized. Only GasTank");
        });

        it("staking payout causes tokens to staked on behalf of the user", async () => {
            const amountEth = ethers.utils.parseEther("1.0");
            const amountTip = ethers.utils.parseEther("1.0");

            await treasury
                .connect(gasTank)
                .stakePayout(user1.address, amountTip, { value: amountEth });

            // treasury got the eth
            expect(await provider.getBalance(treasury.address)).to.equal(amountEth);

            // and user got the tokens staked into the treasury
            const expectedAmountFromTip = ethers.utils.parseEther("0.8"); // 0.8 from tip (20% tax)
            const expectedAmountFromExecution = await treasury.ethToDAEM(amountEth);
            const expectedAmount = expectedAmountFromTip.add(expectedAmountFromExecution);
            expect(await treasury.balanceOf(user1.address)).to.equal(expectedAmount);
        });

        it("staking payout causes ETH to be distributed into pools accordingly", async () => {
            const amountEth = ethers.utils.parseEther("1.0");
            const amountTip = ethers.utils.parseEther("1.0");

            await treasury
                .connect(gasTank)
                .stakePayout(user1.address, amountTip, { value: amountEth });

            // 1% commission, 49% POL, 50% redistribution
            expect(await treasury.commissionsPool()).to.equal(ethers.utils.parseEther("0.01"));
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0.49"));
            expect(await treasury.redistributionPool()).to.equal(ethers.utils.parseEther("0.50"));
        });

        it("staking payout doesn't change treasury balance", async () => {
            const initialTreasuryBalance = await daemToken.balanceOf(treasury.address);
            const initialAmountOfTokensToDistribute = await treasury.tokensForDistribution();

            const amountEth = ethers.utils.parseEther("1.0");
            const amountTip = ethers.utils.parseEther("1.0");
            await treasury
                .connect(gasTank)
                .stakePayout(user1.address, amountTip, { value: amountEth });

            const finalTreasuryBalance = await daemToken.balanceOf(treasury.address);
            const finalAmountOfTokensToDistribute = await treasury.tokensForDistribution();

            // balance will be the same
            expect(initialTreasuryBalance).to.be.equal(finalTreasuryBalance);

            // while the amount of tokens to be distributed will have decreased
            expect(initialAmountOfTokensToDistribute).to.not.be.equal(
                finalAmountOfTokensToDistribute
            );
        });
    });

    describe("Staking", function () {
        const now = async () => {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            return blockBefore.timestamp;
        };
        const oneDay = 60 * 60 * 24;

        it("the user cannot stake funds they don't own", async () => {
            const amount = ethers.utils.parseEther("1.0");
            await expect(treasury.stake(amount)).to.be.revertedWith(
                "ERC20: transfer amount exceeds balance"
            );

            await expect(treasury.stake(0)).to.be.revertedWith("Cannot stake 0");
        });

        it("the user cannot withdraw funds they don't own", async () => {
            const amount = ethers.utils.parseEther("1.0");
            await expect(treasury.withdraw(amount)).to.be.revertedWith("Insufficient staked funds");

            await expect(treasury.withdraw(0)).to.be.revertedWith("Cannot withdraw 0");
        });

        it("is not possible to withdraw ALL funds from the treasury", async () => {
            // stake payout for user1 and wait some time
            const amountEth = ethers.utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: amountEth });

            await network.provider.send("evm_setNextBlockTimestamp", [(await now()) + 60]);
            await network.provider.send("evm_mine");

            // withdraw all
            await expect(treasury.connect(user1).exit()).to.be.revertedWith(
                "Cannot withdraw all funds"
            );
        });

        it("user balance is updated after staking and withdrawing", async () => {
            // add some ETH dust that will stay in the treasury
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(owner.address, zero, { value: 100000 });

            // give some tokens to a user
            const amount = ethers.utils.parseEther("1.0");
            daemToken.mint(user1.address, amount);

            // give allowance to treasury contract
            await daemToken
                .connect(user1)
                .approve(treasury.address, ethers.utils.parseEther("500"));

            // verify balances are updated when user stakes DAEM
            await treasury.connect(user1).stake(amount);
            expect(await treasury.balanceOf(user1.address)).to.equal(amount);
            expect(await daemToken.balanceOf(user1.address)).to.equal(zero);

            // verify balances are updated when user withdraws DAEM
            await treasury.connect(user1).withdraw(amount);
            expect(await daemToken.balanceOf(user1.address)).to.equal(amount);
            expect(await treasury.balanceOf(user1.address)).to.equal(zero);
        });

        it("reward rate depends on the amount of ETH in the treasury and redistributionInterval", async () => {
            const amountEth = ethers.utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: amountEth });

            const rewardRate = await treasury.getRewardRate();
            const redistributionPool = await treasury.redistributionPool(); // 50% of 1ETH
            const expectedRate = redistributionPool.div(15552000); //0.5 / 180 Days
            expect(rewardRate).to.be.equal(expectedRate);

            // try again, the reward rate should be doubled
            await treasury
                .connect(gasTank)
                .requestPayout(user1.address, zero, { value: amountEth });
            expect(await treasury.getRewardRate()).to.be.equal(expectedRate.mul(2));
        });

        it("reward is accumulated over time", async () => {
            // stake payout for user1.
            const amountEth = ethers.utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: amountEth });

            // current state: 0.5ETH are in the redistribution pool and 1 DAEM staked for the user
            expect(await treasury.redistributionPool()).to.be.equal(ethers.utils.parseEther("0.5"));
            expect(await treasury.balanceOf(user1.address)).to.be.equal(
                ethers.utils.parseEther("0.996503243133298050")
            );

            // claimable amount at this time is 0
            expect(await treasury.earned(user1.address)).to.be.equal(ethers.utils.parseEther("0"));

            // but after some time...
            await network.provider.send("evm_setNextBlockTimestamp", [(await now()) + oneDay]);
            await network.provider.send("evm_mine");

            // It should increase (by rewardRate * seconds elapsed)
            const rewardRate = await treasury.getRewardRate();
            const expectedReward = rewardRate.mul(oneDay - 1);

            chai.use(chaiAlmost(rewardRate.toNumber() * 2)); // We might be a few seconds off
            const earnedReward: BigNumber = await treasury.earned(user1.address);
            expect(earnedReward.sub(expectedReward).abs().toNumber()).to.be.almost.equal(0);
        });

        const stakePayoutAndWaitForOneDay = async (): Promise<BigNumber> => {
            // stake payout for user1 and wait some time
            const amountEth = ethers.utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: amountEth });

            await network.provider.send("evm_setNextBlockTimestamp", [(await now()) + oneDay]);
            await network.provider.send("evm_mine");

            // from previous test, we know that after 1 day the reward is
            // (almost) equal to 2777713477338878
            chai.use(chaiAlmost(32150205761 * 3));
            const earnedReward: BigNumber = await treasury.earned(user1.address);
            expect(earnedReward.sub("2777713477338878").abs().toNumber()).to.be.almost.equal(0);

            return earnedReward;
        };

        it("reward zeroed after claiming", async () => {
            await stakePayoutAndWaitForOneDay();

            // let's claim the reward
            const balanceBefore = await provider.getBalance(user1.address);
            await treasury.connect(user1).getReward();

            // it should have been sent to the user (that also spent gas, so we cannot
            // measure the balance precisely and we'll just check it has increased)
            const balanceAfter = await provider.getBalance(user1.address);
            expect(balanceAfter.sub(balanceBefore).gt(0)).to.be.true;

            // and the treasury counter should have been zeroed
            const earnedRewardAfterClaim: BigNumber = await treasury.earned(user1.address);
            expect(earnedRewardAfterClaim.toNumber()).to.be.almost.equal(0);
        });

        it("rewards are accounted each time are claimed", async () => {
            await stakePayoutAndWaitForOneDay();

            // let's claim the reward
            await treasury.connect(user1).getReward();

            // the 'distributed' variable should have been increased;
            const distributed: BigNumber = await treasury.distributed();
            expect(distributed.sub("2777713477338878").abs().toNumber()).to.be.almost.equal(0);
        });

        it("exit function gets both reward and staked amount", async () => {
            // add some ETH dust that will stay in the treasury
            await treasury.connect(gasTank).stakePayout(owner.address, 0, { value: 10000 });

            await stakePayoutAndWaitForOneDay();

            // let's exit
            const balanceBefore = await provider.getBalance(user1.address);
            await treasury.connect(user1).exit();

            // ETH has been sent to the user
            const balanceAfter = await provider.getBalance(user1.address);
            expect(balanceAfter.sub(balanceBefore).gt(0)).to.be.true;

            // As well as the token
            const converted = await treasury.ethToDAEM(utils.parseEther("1"));
            const userTokenBalance = await daemToken.balanceOf(user1.address);
            expect(userTokenBalance).to.be.equal(converted);

            // and the balance of the user in the treasury has been zeroed
            const userStakedAmount: BigNumber = await treasury.balanceOf(user1.address);
            expect(userStakedAmount.toNumber()).to.be.almost.equal(0);
        });

        it("user can stake and unstake", async () => {
            // add some ETH dust that will stay in the treasury
            await treasury.connect(gasTank).stakePayout(owner.address, 0, { value: 10000 });

            // stake payout for user1 and wait some time
            const amount = ethers.utils.parseEther("1.0");
            await treasury.connect(gasTank).stakePayout(user1.address, 0, { value: amount });
            await network.provider.send("evm_setNextBlockTimestamp", [(await now()) + 60]);
            await network.provider.send("evm_mine");

            const converted = await treasury.ethToDAEM(amount);
            const zero = ethers.utils.parseEther("0");

            // withdraw all
            await treasury.connect(user1).withdraw(converted);
            expect(await daemToken.balanceOf(user1.address)).to.be.equal(converted);
            expect(await treasury.balanceOf(user1.address)).to.be.equal(zero);

            // re-stake again
            await daemToken
                .connect(user1)
                .approve(treasury.address, ethers.utils.parseEther("500"));
            await treasury.connect(user1).stake(converted);
            expect(await daemToken.balanceOf(user1.address)).to.be.equal(zero);
            expect(await treasury.balanceOf(user1.address)).to.be.equal(converted);

            // claim
            await treasury.connect(user1).getReward();
            expect(await treasury.earned(user1.address)).to.be.equal(zero);

            // withdraw half
            const half = converted.div(2);
            await treasury.connect(user1).withdraw(half);
            expect(await daemToken.balanceOf(user1.address)).to.be.equal(half);
            expect(await treasury.balanceOf(user1.address)).to.be.equal(half);

            // withdraw the other half
            await treasury.connect(user1).exit();
            expect(await daemToken.balanceOf(user1.address)).to.be.equal(converted);
            expect(await treasury.balanceOf(user1.address)).to.be.equal(zero);
        });

        it("user can compound the reward", async () => {
            const earnedReward = await stakePayoutAndWaitForOneDay();

            const quoteRewardToDAEM = await treasury.ethToDAEM(earnedReward);
            const minAmountOut = quoteRewardToDAEM.mul(99).div(100);

            // let's compound the reward
            const balanceBefore = await treasury.balanceOf(user1.address);
            await treasury.connect(user1).compoundReward(minAmountOut);

            // the amount of DAEM in the treasury have increased (at least by "minAmountOut")
            const balanceAfter = await treasury.balanceOf(user1.address);
            expect(balanceAfter.gte(balanceBefore.add(minAmountOut))).to.be.true;

            // and the treasury counter should have been zeroed
            const earnedRewardAfterClaim: BigNumber = await treasury.earned(user1.address);
            expect(earnedRewardAfterClaim.toNumber()).to.be.almost.equal(0);
        });

        it("compound fails if minAmountOut is too high", async () => {
            const earnedReward = await stakePayoutAndWaitForOneDay();

            const quoteRewardToDAEM = await treasury.ethToDAEM(earnedReward);
            const minAmountOut = quoteRewardToDAEM.mul(101).div(100);

            await expect(treasury.connect(user1).compoundReward(minAmountOut)).to.be.revertedWith(
                "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"
            );
        });
    });

    describe("Commissions", function () {
        it("owner can withdraw commission from the pool", async () => {
            const ownerInitialBalance = await provider.getBalance(owner.address);

            const amountEth = ethers.utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury
                .connect(gasTank)
                .requestPayout(user1.address, zero, { value: amountEth });

            // anyone else will cause error
            await expect(treasury.connect(user1).claimCommission()).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
            expect(await treasury.commissionsPool()).to.equal(ethers.utils.parseEther("0.01"));

            // but owner can claim commission
            await treasury.connect(owner).claimCommission();

            // commission pool is emptied
            expect(await treasury.commissionsPool()).to.equal(ethers.utils.parseEther("0"));

            // ETH is in user wallet (as the user pays for gas,
            // we just check they have more than what they started with)
            const ownerFinalBalance = await provider.getBalance(owner.address);
            expect(ownerFinalBalance.gt(ownerInitialBalance)).to.be.true;
        });
    });

    describe("Protocol Owned Liquidity", function () {
        it("LP funding can only be executed by admin", async () => {
            await expect(treasury.connect(user1).fundLP(0)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("LP funding cannot be performed if owned DAEM is > than threshold", async () => {
            await expect(treasury.connect(owner).fundLP(0)).to.be.revertedWith(
                "Funding forbidden. Should buyback"
            );
        });

        it("LP funding fail if minAmountOut is too high", async () => {
            // add funds to the polPool by having the gasTank faking a payout
            const ETHAmount = utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: ETHAmount });
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0.49"));

            // create a lot of DAEM to increase the totalSupply,
            // so to *NOT* trigger buybacks
            await daemToken.mint(user1.address, ethers.utils.parseEther("99999999"));

            const quote = await treasury.ethToDAEM(ethers.utils.parseEther("0.245")); // 0.49 / 2
            const amountTooHigh = quote.add(10000000000);
            await expect(treasury.fundLP(amountTooHigh)).to.be.revertedWith(
                "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"
            );
        });

        it("LP funding uses all the ETH in the polPool", async () => {
            // add funds to the polPool by having the gasTank faking a payout
            const ETHAmount = utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: ETHAmount });
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0.49"));

            // create a lot of DAEM to increase the totalSupply,
            // so to *NOT* trigger buybacks
            await daemToken.mint(user1.address, ethers.utils.parseEther("99999999"));

            // fund the LP and verify polPool has been emptied
            await treasury.connect(owner).fundLP(0);
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0"));
        });
    });

    describe("Buybacks", function () {
        it("buybacks are disabled if DAEM in LP is < than threshold", async () => {
            // mint a lot of DAEM to trigger an LP funding instead of a buyback
            await daemToken.mint(treasury.address, utils.parseEther("9999999"));

            await expect(treasury.buybackDAEM(0)).to.be.revertedWith(
                "Buyback forbidden. Should fund"
            );
        });

        it("buybacks fail if minAmountOut is too high", async () => {
            // add funds to the polPool by having the gasTank faking a payout
            const ETHAmount = utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: ETHAmount });
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0.49"));

            const quote = await treasury.ethToDAEM(ethers.utils.parseEther("0.49"));
            const amountTooHigh = quote.add(10000000000);
            await expect(treasury.buybackDAEM(amountTooHigh)).to.be.revertedWith(
                "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"
            );
        });

        it("buybacks purchases DAEM back using all the content of the PoLPool", async () => {
            // add funds to the polPool by having the gasTank faking a payout
            const ETHAmount = utils.parseEther("1.0");
            const zero = ethers.utils.parseEther("0");
            await treasury.connect(gasTank).stakePayout(user1.address, zero, { value: ETHAmount });
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0.49"));
            const initiallyOwnedDAEM = await daemToken.balanceOf(treasury.address);

            // buyback
            const amountMinusSlippage = (await treasury.ethToDAEM(ethers.utils.parseEther("0.49")))
                .mul(99)
                .div(100);
            await treasury.buybackDAEM(amountMinusSlippage);

            // PolPool should have been emptied
            expect(await treasury.polPool()).to.equal(ethers.utils.parseEther("0"));

            // DAEM tokens in treasury have increased (at least by "amountMinusSlippage")
            const ownedDAEM = await daemToken.balanceOf(treasury.address);
            const minimumExpectedAmount = initiallyOwnedDAEM.add(amountMinusSlippage);
            expect(ownedDAEM.sub(minimumExpectedAmount).gte(0)).to.be.true;
        });
    });
});
