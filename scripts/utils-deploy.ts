import hre from "hardhat";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { contracts, printContracts } from "./daemons-contracts";
import { deployInfoFetcher } from "./utils-deployment/a1-info-fetcher";
import { verifyInfoFetcher } from "./utils-deployment/a1b-verify-info-fetcher";


async function deployDaemons() {
    // display deployer address and its balance
    const [owner] = await ethers.getSigners();
    const initialBalance = await owner.getBalance();
    console.log("Deploying contracts with the account:", owner.address);
    console.log(
        "Account balance:",
        initialBalance.div(BigNumber.from("10").pow(BigNumber.from("12"))).toNumber() / 1000000
    );

    // retrieve known contracts (in case this is a partial deploy)
    const currentChain = hre.network.config.chainId;
    if (!currentChain) throw new Error("Could not retrieve current chain");
    console.log(`Chain: ${currentChain}`);
    let currentContracts = contracts[currentChain];
    printContracts(currentContracts);

    // deploy utils
    currentContracts = await deployInfoFetcher(currentContracts);
    await verifyInfoFetcher(currentContracts);
}

deployDaemons().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
