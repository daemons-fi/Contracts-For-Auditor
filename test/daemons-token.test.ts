import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

describe("DAEM Token", function () {
  let owner: SignerWithAddress;
  let vesting: SignerWithAddress;
  let gasTank: SignerWithAddress;
  let treasury: Contract;
  let DAEM: Contract;

  this.beforeEach(async () => {
    // get some wallets
    [owner, vesting, gasTank] = await ethers.getSigners();

    // instantiate BAL token contract
    const DaemonsTokenContract = await ethers.getContractFactory(
      "DaemonsToken"
    );
    DAEM = await DaemonsTokenContract.deploy();

    // instantiate treasury
    const TreasuryContract = await ethers.getContractFactory("Treasury");
    treasury = await TreasuryContract.deploy(
      DAEM.address,
      gasTank.address,
      "0xa36085f69e2889c224210f603d836748e7dc0088" // totally random address
    );
  });

  it("has the right attributes", async () => {
    expect(await DAEM.symbol()).to.equal("DAEM");
    expect(await DAEM.name()).to.equal("Daemons");
    expect(await DAEM.owner()).to.equal(owner.address);
    expect(await DAEM.MAX_SUPPLY()).to.equal(
      ethers.utils.parseEther("1000000000")
    );
  });

  it("mints with the specified proportions when initialized", async function () {
    await DAEM.initialize(treasury.address, vesting.address);

    // treasury has 75% of the whole supply
    expect(await DAEM.balanceOf(treasury.address)).to.equal(
      ethers.utils.parseEther("750000000")
    );

    // owner has 25% of the whole supply
    expect(await DAEM.balanceOf(owner.address)).to.equal(
      ethers.utils.parseEther("250000000")
    );
  });

  it("Total supply takes into account all tokens as they are immediately minted", async function () {
    await DAEM.initialize(treasury.address, vesting.address);
    expect(await DAEM.totalSupply()).to.equal(await DAEM.MAX_SUPPLY());
  });

  it("Circulating supply does not include the tokens in the treasury nor vesting contract", async function () {
    const aQuarterOfTheTotal = ethers.utils.parseEther("250000000");
    await DAEM.initialize(treasury.address, vesting.address);

    // initially the circulating supply is 250M as the owner has it in their wallet
    expect(await DAEM.circulatingSupply()).to.equal(aQuarterOfTheTotal);

    // after having sent it to the vesting contract, it will not be counted anymore
    await DAEM.connect(owner).transfer(vesting.address, aQuarterOfTheTotal);
    expect(await DAEM.balanceOf(vesting.address)).to.equal(aQuarterOfTheTotal);
    expect(await DAEM.circulatingSupply()).to.equal(BigNumber.from(0));
  });

  it("can only be initialized once", async function () {
    await DAEM.initialize(treasury.address, vesting.address);
    await expect(
      DAEM.initialize(treasury.address, vesting.address)
    ).to.be.revertedWith("Can only initialize once");
  });
});
