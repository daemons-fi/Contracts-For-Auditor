import hre from "hardhat";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { contracts, printContracts } from "./daemons-contracts";

export const bigNumberToFloat = (
    amount: BigNumber,
    outputDecimals: number = 4,
    inputDecimals: number = 18
): number => {
    // used for integer division
    const firstDivisor = BigNumber.from(10).pow(inputDecimals - outputDecimals);

    // used for float division (so to maintain some fractional digits)
    const secondDivisor = BigNumber.from(10).pow(outputDecimals).toNumber();

    return amount.div(firstDivisor).toNumber() / secondDivisor;
};

export const getContracts = async () => {
    // display deployer address and its balance
    const [owner] = await ethers.getSigners();
    const initialBalance = await owner.getBalance();
    console.log("Deploying contracts with the account:", owner.address);
    console.log("Account balance:", bigNumberToFloat(initialBalance, 5));

    // retrieve known contracts (in case this is a partial deploy)
    const currentChain = hre.network.config.chainId;
    if (!currentChain) throw new Error("Could not retrieve current chain");
    console.log(`Chain: ${currentChain}`);

    printContracts(contracts[currentChain]);
    return contracts[currentChain];
};
