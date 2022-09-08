import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployGasTank = async (
    contracts: DaemonsContracts,
): Promise<DaemonsContracts> => {
    console.log('Deploying GasTank');

    const GasTankContract = await ethers.getContractFactory("GasTank");
    const gasTank = await GasTankContract.deploy();
    await gasTank.deployed();

    console.log(`GasTank deployed`);
    return updateContracts(contracts, "GasTank", gasTank.address);
}
