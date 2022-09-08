import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyGasTank = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying GasTank");

    try {
        const address = getContractAddress(contracts, "GasTank");
        await hre.run("verify:verify", { address: address });
    } catch (error) {
        console.log(`GasTank VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`GasTank verified`);
};
