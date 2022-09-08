import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyGasPriceFeed = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying GasPriceFeed");

    try {
        const address = getContractAddress(contracts, "GasPriceFeed");
        await hre.run("verify:verify", { address: address });
    } catch (error) {
        console.log(`GasPriceFeed VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`GasPriceFeed verified`);
};
