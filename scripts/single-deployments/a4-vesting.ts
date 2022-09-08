import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployVesting = async (
    contracts: DaemonsContracts,
    startTime: number,
    duration: number
): Promise<DaemonsContracts> => {
    console.log('Deploying Vesting');

    const VestingContract = await ethers.getContractFactory("Vesting");
    const vesting = await VestingContract.deploy(startTime, duration);
    await vesting.deployed();

    console.log(`Vesting deployed`);
    return updateContracts(contracts, "Vesting", vesting.address);
}
