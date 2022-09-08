import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyMmAdvancedExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying MmAdvanced Executor");

    try {
        const executor = getContractAddress(contracts, "MmAdvancedScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`MmAdvanced Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`MmAdvanced Executor verified`);
};
