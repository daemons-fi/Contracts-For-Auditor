import { DaemonsContracts, getContract } from "../daemons-contracts";

export const initializeToken = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Initializing Token");

    const treasury = await getContract(contracts, "Treasury");
    const vesting = await getContract(contracts, "Vesting");
    const token = await getContract(contracts, "DaemonsToken");
    await (await token.initialize(treasury.address, vesting.address)).wait();

    console.log(`Token initialized`);
};
