import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

describe("Periphery DAEM Token", function () {
    let owner: SignerWithAddress;
    let otherAddress: SignerWithAddress;
    let executor: SignerWithAddress;
    let DAEM: Contract;

    this.beforeEach(async () => {
        // get some wallets
        [owner, otherAddress, executor] = await ethers.getSigners();

        // instantiate BAL token contract
        const lzEndpoint = "0xa36085f69e2889c224210f603d836748e7dc0088"; // totally random address
        const DaemonsTokenContract = await ethers.getContractFactory("DaemonsTokenPeriphery");
        DAEM = await DaemonsTokenContract.deploy(lzEndpoint);
    });

    it("has the right attributes", async () => {
        expect(await DAEM.symbol()).to.equal("DAEM");
        expect(await DAEM.name()).to.equal("Daemons");
        expect(await DAEM.owner()).to.equal(owner.address);
        expect(await DAEM.MAX_SUPPLY()).to.equal(ethers.utils.parseEther("1000000000"));
    });

    it("Total supply is initially zero", async function () {
        expect(await DAEM.totalSupply()).to.equal(BigNumber.from(0));
    });

    it("owner can add and remove allowed executors", async function () {
        expect(await DAEM.isExecutor(executor.address)).to.equal(false);

        // add an allowed executor for inter-chain transfers
        await DAEM.addExecutor(executor.address);
        expect(await DAEM.isExecutor(executor.address)).to.equal(true);

        // remove the executor
        await DAEM.removeExecutor(executor.address);
        expect(await DAEM.isExecutor(executor.address)).to.equal(false);
    });

    it("only owner can add and remove allowed executors", async function () {
        // try to have a non-owner to add an executor
        const addExecutor = DAEM.connect(otherAddress).addExecutor(executor.address);
        await expect(addExecutor).to.be.revertedWith("Ownable: caller is not the owner");

        const removeExecutor = DAEM.connect(otherAddress).removeExecutor(executor.address);
        await expect(removeExecutor).to.be.revertedWith("Ownable: caller is not the owner");
    });
});
