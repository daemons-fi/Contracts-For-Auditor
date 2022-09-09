import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

describe("Base DAEM Token", function () {
    let owner: SignerWithAddress;
    let otherAddress: SignerWithAddress;
    let treasury: SignerWithAddress;
    let executor: SignerWithAddress;
    let DAEM: Contract;

    this.beforeEach(async () => {
        // get some wallets
        [owner, otherAddress, treasury, executor] = await ethers.getSigners();

        // instantiate DAEM token contract using a random lzEndpoint
        const lzEndpoint = "0xa36085f69e2889c224210f603d836748e7dc0088"; // totally random address
        const DaemonsTokenContract = await ethers.getContractFactory("DaemonsToken");
        DAEM = await DaemonsTokenContract.deploy(lzEndpoint);
    });

    it("has the right attributes", async () => {
        expect(await DAEM.symbol()).to.equal("DAEM");
        expect(await DAEM.name()).to.equal("Daemons");
        expect(await DAEM.owner()).to.equal(owner.address);
        expect(await DAEM.MAX_SUPPLY()).to.equal(ethers.utils.parseEther("1000000000"));
    });

    it("mints with the specified proportions when initialized", async function () {
        await DAEM.initialize(treasury.address);

        // treasury has 75% of the whole supply
        expect(await DAEM.balanceOf(treasury.address)).to.equal(
            ethers.utils.parseEther("750000000")
        );

        // owner has 25% of the whole supply
        expect(await DAEM.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("250000000"));
    });

    it("Total supply takes into account all tokens as they are immediately minted", async function () {
        await DAEM.initialize(treasury.address);
        expect(await DAEM.totalSupply()).to.equal(await DAEM.MAX_SUPPLY());
    });

    it("can only be initialized once", async function () {
        await DAEM.initialize(treasury.address);
        await expect(DAEM.initialize(treasury.address)).to.be.revertedWith(
            "Can only initialize once"
        );
    });

    it("owner can add and remove allowed executors", async function () {
        await DAEM.initialize(executor.address);
        expect(await DAEM.isExecutor(executor.address)).to.equal(false);

        // add an allowed executor for inter-chain transfers
        await DAEM.addExecutor(executor.address);
        expect(await DAEM.isExecutor(executor.address)).to.equal(true);

        // remove the executor
        await DAEM.removeExecutor(executor.address);
        expect(await DAEM.isExecutor(executor.address)).to.equal(false);
    });

    it("only owner can add and remove allowed executors", async function () {
        await DAEM.initialize(executor.address);

        // try to have a non-owner to add an executor
        const addExecutor = DAEM.connect(otherAddress).addExecutor(executor.address);
        await expect(addExecutor).to.be.revertedWith("Ownable: caller is not the owner");

        const removeExecutor = DAEM.connect(otherAddress).removeExecutor(executor.address);
        await expect(removeExecutor).to.be.revertedWith("Ownable: caller is not the owner");
    });
});
