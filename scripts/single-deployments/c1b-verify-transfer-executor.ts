import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyTransferExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying Transfer Executor");

    try {
        const executor = getContractAddress(contracts, "TransferScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`Transfer Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`Transfer Executor verified`);
};
