import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyVesting = async (contracts: DaemonsContracts, startTime: number, duration: number): Promise<void> => {
    console.log("Verifying Vesting");

    try {
        const address = getContractAddress(contracts, "Vesting");
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: [startTime, duration]
        });
    } catch (error) {
        console.log(`Vesting VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`Vesting verified`);
};
