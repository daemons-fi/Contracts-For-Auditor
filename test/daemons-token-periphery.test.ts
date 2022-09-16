import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

describe("Periphery DAEM Token", function () {
    let owner: SignerWithAddress;
    let otherAddress: SignerWithAddress;
    let operator: SignerWithAddress;
    let DAEM: Contract;

    this.beforeEach(async () => {
        // get some wallets
        [owner, otherAddress, operator] = await ethers.getSigners();

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

    it("owner can add and remove allowed operators", async function () {
        expect(await DAEM.isOperator(operator.address)).to.equal(false);

        // add an allowed operator for inter-chain transfers
        await DAEM.addOperator(operator.address);
        expect(await DAEM.isOperator(operator.address)).to.equal(true);

        // remove the operator
        await DAEM.removeOperator(operator.address);
        expect(await DAEM.isOperator(operator.address)).to.equal(false);
    });

    it("only owner can add and remove allowed operators", async function () {
        // try to have a non-owner to add an operator
        const addOperator = DAEM.connect(otherAddress).addOperator(operator.address);
        await expect(addOperator).to.be.revertedWith("Ownable: caller is not the owner");

        const removeOperator = DAEM.connect(otherAddress).removeOperator(operator.address);
        await expect(removeOperator).to.be.revertedWith("Ownable: caller is not the owner");
    });


    it("owner can add trusted remotes", async function () {
        const otherChainId = 123;
        const trustedRemote = "0x5fad09ac430b943ff5790bf2a42a55fd557c9c5f"; // random address that represents DAEM on another chain

        // initially the lookup will be empty
        expect(await DAEM.trustedRemoteLookup(otherChainId)).to.equal("0x");

        // add a trusted remote
        await DAEM.setTrustedRemote(otherChainId, trustedRemote);
        expect(await DAEM.trustedRemoteLookup(otherChainId)).to.equal(trustedRemote);
    });

    it("only owner can add trusted remote", async function () {
        const otherChainId = 123;
        const trustedRemote = "0x5fad09ac430b943ff5790bf2a42a55fd557c9c5f"; // random address that represents DAEM on another chain

        // anyone else adding a trusted remote will trigger an error
        const addTrustedRemote = DAEM.connect(otherAddress).setTrustedRemote(otherChainId, trustedRemote);
        await expect(addTrustedRemote).to.be.revertedWith("Ownable: caller is not the owner");
    });
});
