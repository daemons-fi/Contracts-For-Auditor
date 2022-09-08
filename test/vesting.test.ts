import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import chaiAlmost from "chai-almost";
import { Contract } from "ethers";
import { ethers, network } from "hardhat";

const chai = require("chai");

describe("Vesting contract", function () {
    let snapshotId: string;
    let owner: SignerWithAddress;
    let beneficiary1: SignerWithAddress;
    let beneficiary2: SignerWithAddress;
    let vestingContract: Contract;
    let fooToken: Contract;

    const oneDay = () => 60 * 60 * 24;
    const twoDays = () => oneDay() * 2;
    const now = () => Math.floor(new Date().getTime() / 1000);
    const tomorrow = () => now() + oneDay();

    this.beforeEach(async () => {
        // save snapshot (needed because we advance/reset time)
        snapshotId = await network.provider.send("evm_snapshot", []);

        // get some wallets
        [owner, beneficiary1, beneficiary2] = await ethers.getSigners();

        // Deploy mock token contracts
        const MockTokenContract = await ethers.getContractFactory("MockToken");
        fooToken = await MockTokenContract.deploy("Foo Token", "FOO");

        // Deploy vesting contract
        const VestingContract = await ethers.getContractFactory("Vesting");
        vestingContract = await VestingContract.deploy(tomorrow(), twoDays());

        // Mint tokens and give allowance
        const amount = ethers.utils.parseEther("1000");
        await fooToken.mint(owner.address, amount);
        await fooToken.approve(vestingContract.address, amount);
    });

    this.afterEach(async () => {
        // restore from snapshot
        await network.provider.send("evm_revert", [snapshotId]);
    });

    describe("addBeneficiary", () => {
        it("allows adding beneficiaries", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);
            await vestingContract.addBeneficiary(fooToken.address, beneficiary2.address, amount);

            // verify balances
            const b1Amount = await vestingContract.lockedAmount(
                fooToken.address,
                beneficiary1.address
            );
            const b2Amount = await vestingContract.lockedAmount(
                fooToken.address,
                beneficiary2.address
            );

            expect(b1Amount).to.equal(amount);
            expect(b2Amount).to.equal(amount);
        });

        it("cannot add the same beneficiary twice", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);

            await expect(
                vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount)
            ).to.be.revertedWith("Beneficiary is already in use");
        });

        it("cannot add a beneficiary after start date", async () => {
            // add a day to the block time
            await network.provider.send("evm_increaseTime", [oneDay() * 2]);
            await network.provider.send("evm_mine");

            const amount = ethers.utils.parseEther("100");
            await expect(
                vestingContract.addBeneficiary(fooToken.address, beneficiary2.address, amount)
            ).to.be.revertedWith("Vesting started. Modifications forbidden");
        });
    });

    describe("vesting calculation", () => {
        it("at creation, no token is vested", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);

            expect(
                await vestingContract.vestedAmount(fooToken.address, beneficiary1.address)
            ).to.be.equal(0);
        });

        it("before start, no token is vested", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);

            await network.provider.send("evm_setNextBlockTimestamp", [now() + oneDay() - 60]);
            await network.provider.send("evm_mine");

            expect(
                await vestingContract.vestedAmount(fooToken.address, beneficiary1.address)
            ).to.be.equal(0);
        });

        it("just after the start date, tokens start getting vested", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);

            await network.provider.send("evm_setNextBlockTimestamp", [now() + oneDay() + 1]);
            await network.provider.send("evm_mine");

            // amount unlocked every second for a 100t vesting lasting 2 days
            const expectedAmount = ethers.utils.parseEther("0.000578703703703703");
            expect(
                await vestingContract.vestedAmount(fooToken.address, beneficiary1.address)
            ).to.equal(expectedAmount);
        });

        it("after the end date, all tokens are vested", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);

            await ethers.provider.send("evm_mine", [now() + oneDay() * 3]);
            expect(
                await vestingContract.vestedAmount(fooToken.address, beneficiary1.address)
            ).to.be.equal(amount);
        });
    });

    describe("release", () => {
        it("sends the expected amount to the user", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);

            await network.provider.send("evm_setNextBlockTimestamp", [now() + oneDay() + 1]);
            await network.provider.send("evm_mine");

            // amount unlocked after 2 seconds for a 100t vesting lasting 2 days
            const expectedAmount = ethers.utils.parseEther("0.001157407407407407");
            await vestingContract.release(fooToken.address, beneficiary1.address);

            const userBalance = await fooToken.balanceOf(beneficiary1.address);
            expect(userBalance).to.equal(expectedAmount);
        });

        it("throws if there is nothing to be vested", async () => {
            const amount = ethers.utils.parseEther("100");
            await vestingContract.addBeneficiary(fooToken.address, beneficiary1.address, amount);

            await expect(
                vestingContract.release(fooToken.address, beneficiary1.address)
            ).to.be.revertedWith("Nothing to release");
        });
    });
});
