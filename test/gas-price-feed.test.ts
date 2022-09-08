import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

describe("GasPriceFeed", function () {
    let owner: SignerWithAddress;
    let otherUser: SignerWithAddress;
    let gasPriceFeed: Contract;

    this.beforeEach(async () => {
        // get some wallets
        [owner, otherUser] = await ethers.getSigners();

        // Gas Price Feed contract
        const GasPriceFeedContract = await ethers.getContractFactory("GasPriceFeed");
        gasPriceFeed = await GasPriceFeedContract.deploy();
    });

    it("last gas price is publicly available", async () => {
        expect(await gasPriceFeed.lastGasPrice()).to.equal(1000000000); // 1 GWEI Default
    });

    it("owner can update last gas price", async () => {
        await gasPriceFeed.setGasPrice(5000000000); // 5 GWEI

        expect(await gasPriceFeed.lastGasPrice()).to.equal(5000000000);
    });

    it("throws an error if trying to set an invalid value", async () => {
        await expect(gasPriceFeed.setGasPrice(0)).to.be.revertedWith(
            "GasPrice must be greater than 0"
        );
    });

    it("throws an error if anyone but the owner tries to update the gas price", async () => {
        await expect(gasPriceFeed.connect(otherUser).setGasPrice(1500)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        );
    });
});
