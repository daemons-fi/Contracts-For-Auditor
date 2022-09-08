import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployDaemToken = async (
    contracts: DaemonsContracts,
): Promise<DaemonsContracts> => {
    console.log('Deploying DAEM token');

    const TokenContract = await ethers.getContractFactory("DaemonsToken");
    const token = await TokenContract.deploy();
    await token.deployed();

    console.log("DAEM deployed");
    return updateContracts(contracts, "DaemonsToken", token.address);
}
