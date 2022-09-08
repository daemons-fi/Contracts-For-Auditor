// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
    const [owner] = await ethers.getSigners();

    const aavePool = await ethers.getContractAt("IMoneyMarket", "0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe");
    const wethAddress = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";

    console.log("Initial Balance:", await owner.getBalance());

    console.log("Depositing");
    await aavePool.deposit(
        wethAddress,
        ethers.utils.parseEther("0.01"),
        '0xC35C79aE067576FcC474E51B18c4eE4Ab36C0274',
        0
    );

    console.log("Withdrawing");
    await aavePool.withdraw(
        wethAddress,
        ethers.utils.parseEther("0.0095"),
        '0xC35C79aE067576FcC474E51B18c4eE4Ab36C0274'
    );

    console.log("Final Balance:", await owner.getBalance());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
