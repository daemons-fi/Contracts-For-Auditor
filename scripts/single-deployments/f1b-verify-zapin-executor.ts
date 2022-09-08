import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyZapInExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying ZapIn Executor");

    try {
        const executor = getContractAddress(contracts, "ZapInScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`ZapIn Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`ZapIn Executor verified`);
};
