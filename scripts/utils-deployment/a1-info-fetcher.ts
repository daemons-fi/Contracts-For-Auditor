import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployInfoFetcher = async (
    contracts: DaemonsContracts,
): Promise<DaemonsContracts> => {
    console.log('Deploying InfoFetcher');

    const InfoFetcherContract = await ethers.getContractFactory("InfoFetcher");
    const infoFetcher = await InfoFetcherContract.deploy();
    await infoFetcher.deployed();

    console.log("InfoFetcher deployed");
    return updateContracts(contracts, "InfoFetcher", infoFetcher.address);
}
