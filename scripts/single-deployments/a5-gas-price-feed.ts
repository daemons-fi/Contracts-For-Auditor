import { ethers } from "hardhat";
import { DaemonsContracts, getContractAddress, updateContracts } from "../daemons-contracts";

export const deployGasPriceFeed = async (
    contracts: DaemonsContracts,
): Promise<DaemonsContracts> => {
    console.log('Deploying GasPriceFeed');

    const GasPriceFeedContract = await ethers.getContractFactory("GasPriceFeed");
    const gasPriceFeed = await GasPriceFeedContract.deploy();
    await gasPriceFeed.deployed();

    console.log(`GasPriceFeed deployed`);
    return updateContracts(contracts, "GasPriceFeed", gasPriceFeed.address);
}
