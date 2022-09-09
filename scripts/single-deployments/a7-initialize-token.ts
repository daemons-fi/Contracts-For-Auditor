import { DaemonsContracts, getContract } from "../daemons-contracts";

export const initializeToken = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Initializing Token");

    const treasury = await getContract(contracts, "Treasury");
    const token = await getContract(contracts, "DaemonsToken");
    await (await token.initialize(treasury.address)).wait();

    console.log(`Token initialized`);
};
