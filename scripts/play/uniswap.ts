// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
    const [owner] = await ethers.getSigners();

    const sushiRouter = await ethers.getContractAt("IUniswapV2Router02", "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506");

    const hundredDai = ethers.utils.parseEther("100");
    const daiAddress = "0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa";
    const wethAddress = "0xd0a1e359811322d97991e03f863a0c30c2cf029c";

    const swapQuote = await sushiRouter.getAmountsIn(hundredDai, [wethAddress, daiAddress]);
    const hundredDaiInWeth = swapQuote[0];
    console.log("hundredDaiInWeth", hundredDaiInWeth);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;  //this represents 10 mins of deadline, change to ur liking.

    console.log("Initial Balance:", await owner.getBalance());
    await sushiRouter.swapExactETHForTokens(
        0,
        [wethAddress, daiAddress],
        owner.address,
        deadline,
        { value: hundredDaiInWeth }
    );

    console.log("Final Balance:", await owner.getBalance());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
