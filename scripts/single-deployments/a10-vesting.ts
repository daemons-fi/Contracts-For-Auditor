import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ethers } from "ethers";
import { DaemonsContracts, getContract } from "../daemons-contracts";

interface IBeneficiary {
    address: string;
    amount: BigNumber;
}

const beneficiaries: IBeneficiary[] = [
    {
        address: "0xC35C79aE067576FcC474E51B18c4eE4Ab36C0274",
        amount: ethers.utils.parseEther("125000000")
    },
    {
        address: "0x1c00145BDE2720abf45D77B0779Ced52f6FF12B9",
        amount: ethers.utils.parseEther("124999995")
    }
];

export const vestTokens = async (
    contracts: DaemonsContracts,
    owner: SignerWithAddress
): Promise<void> => {
    console.log("Vesting tokens");

    // retrieve contract
    const vesting = await getContract(contracts, "Vesting");
    const token = await getContract(contracts, "DaemonsToken");
    console.log(`Contracts retrieved`);

    // run some checks
    const ownerBalance = await token.balanceOf(owner.address);
    let totalAmountForBeneficiaries = BigNumber.from(0);
    beneficiaries.forEach((b) => {
        totalAmountForBeneficiaries = totalAmountForBeneficiaries.add(b.amount);
    });

    if (ownerBalance.lt(totalAmountForBeneficiaries)) {
        throw new Error("Distribution amount is higher than owner balance");
    }
    console.log(`Vesting checks passed`);

    // give allowance to vesting contract
    await (await token.approve(vesting.address, totalAmountForBeneficiaries)).wait();

    // set vesting terms for beneficiaries
    for (const beneficiary of beneficiaries) {
        await vesting.addBeneficiary(token.address, beneficiary.address, beneficiary.amount);
        console.log(
            `Beneficiary ${
                beneficiary.address
            } got assigned ${beneficiary.amount.toString()} tokens`
        );
    }

    console.log(`Vesting initialized`);
};
