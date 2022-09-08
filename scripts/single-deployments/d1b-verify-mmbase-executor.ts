import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyMmBaseExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying MmBase Executor");

    try {
        const executor = getContractAddress(contracts, "MmBaseScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`MmBase Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`MmBase Executor verified`);
};
