import { ethers } from "hardhat";
import { DaemonsContracts, getContractAddress, updateContracts } from "../daemons-contracts";

export const deployTreasury = async (contracts: DaemonsContracts): Promise<DaemonsContracts> => {
    console.log("Deploying Treasury");

    const liquidityManager = getContractAddress(contracts, "ILiquidityManager");
    const tokenAddress = getContractAddress(contracts, "DaemonsToken");
    const gasTankAddress = getContractAddress(contracts, "GasTank");
    const TreasuryContract = await ethers.getContractFactory("Treasury");
    const treasury = await TreasuryContract.deploy(tokenAddress, gasTankAddress, liquidityManager);
    await treasury.deployed();

    console.log(`Treasury deployed`);
    return updateContracts(contracts, "Treasury", treasury.address);
};
