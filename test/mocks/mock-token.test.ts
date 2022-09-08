import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

describe("Mock Token", function () {
  let owner: SignerWithAddress;
  let otherUser: SignerWithAddress;
  let Token: Contract;

  this.beforeEach(async () => {
    // get some wallets
    [owner, otherUser] = await ethers.getSigners();

    // instantiate Mock token contract
    const MockTokenContract = await ethers.getContractFactory("MockToken");
    Token = await MockTokenContract.deploy("Funny Token", "FUN");
  });

  it("can be minted anywhere", async () => {
    expect(await Token.balanceOf(otherUser.address)).to.equal(0);

    await Token.mint(otherUser.address, 200000);

    expect(await Token.balanceOf(otherUser.address)).to.equal(200000);
  });

  it("can be burned anywhere", async () => {
    await Token.mint(otherUser.address, 200000);
    expect(await Token.balanceOf(otherUser.address)).to.equal(200000);

    await Token.justBurn(otherUser.address, 200000);
    expect(await Token.balanceOf(otherUser.address)).to.equal(0);
  });
});
