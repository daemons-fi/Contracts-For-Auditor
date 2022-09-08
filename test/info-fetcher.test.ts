import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, network } from "hardhat";
import hre from "hardhat";

describe("InfoFetcher [FORKED CHAIN]", function () {
    let owner: SignerWithAddress;
    let DAEMToken: Contract;
    let fooToken: Contract;
    let barToken: Contract;
    let infoFetcher: Contract;
    let mmV2: Contract;
    let mmV3: Contract;

    let snapshotId: string;
    this.beforeEach(async () => {
        await hre.network.provider.send("evm_revert", [snapshotId]);
        // [...] A snapshot can only be used once. After a successful evm_revert, the same snapshot id cannot be used again.
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    this.afterAll(async () => {
        // Reset the fork
        await hre.network.provider.request({
            method: "hardhat_reset",
            params: []
        });
    });

    this.beforeAll(async () => {
        console.log(`Forking Polygon network`);
        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: process.env.POLYGON_RPC!,
                        blockNumber: 29483920
                    }
                }
            ]
        });

        [owner] = await ethers.getSigners();

        // deploy InfoFetcher
        const InfoFetcherContract = await ethers.getContractFactory("InfoFetcher");
        infoFetcher = await InfoFetcherContract.deploy();

        // Create some tokens
        const MockTokenContract = await ethers.getContractFactory("MockToken");
        DAEMToken = await MockTokenContract.deploy("Foo Token", "FOO");
        fooToken = await MockTokenContract.deploy("Foo Token", "FOO");
        barToken = await MockTokenContract.deploy("Bar Token", "BAR");

        // Mint some balance in the user wallet
        await DAEMToken.mint(owner.address, 125000);
        await fooToken.mint(owner.address, 758500);

        // Deploy Mock MMs
        const MMV2Contract = await ethers.getContractFactory("MockReserveDataV2");
        mmV2 = await MMV2Contract.deploy();
        const MMV3Contract = await ethers.getContractFactory("MockReserveDataV3");
        mmV3 = await MMV3Contract.deploy();

        // get a snapshot of the current state so to speed up tests
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    describe("fetchBalances", () => {
        it("Gets the right balances", async () => {
            const balances = await infoFetcher.fetchBalances(owner.address, [
                DAEMToken.address,
                fooToken.address,
                barToken.address
            ]);

            const coinBalance = balances.coin;
            expect(coinBalance).to.equal(await ethers.provider.getBalance(owner.address));

            const tokenBalances = balances.tokens;
            expect(tokenBalances.length).to.equal(3);
            expect(tokenBalances[0].toNumber()).to.equal(125000);
            expect(tokenBalances[1].toNumber()).to.equal(758500);
            expect(tokenBalances[2].toNumber()).to.equal(0);
        });
    });

    describe("fetchLpInfo", () => {
        const wETHAddress = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
        const wBTCAddress = "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6";
        const routerAddress = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";

        it("Retrieves information about the LP", async () => {
            const lpInfo = await infoFetcher.fetchLpInfo(
                wETHAddress,
                wBTCAddress,
                routerAddress,
                owner.address
            );

            expect(lpInfo.balance).to.equal(BigNumber.from(0));
            expect(lpInfo.pairAddress).to.equal("0xE62Ec2e799305E0D367b0Cc3ee2CdA135bF89816");
            expect(lpInfo.token0).to.equal(wBTCAddress);
            expect(lpInfo.token1).to.equal(wETHAddress);
            expect(lpInfo.reserve0.toString()).to.equal("3001867188");
            expect(lpInfo.reserve1.toString()).to.equal("552501846760226584427");
        });

        it("Gracefully deals with unsupported pairs", async () => {
            const lpInfo = await infoFetcher.fetchLpInfo(
                wETHAddress,
                wETHAddress,
                routerAddress,
                owner.address
            );

            expect(lpInfo.balance).to.equal(BigNumber.from(0));
            expect(lpInfo.pairAddress).to.equal("0x0000000000000000000000000000000000000000");
            expect(lpInfo.token0).to.equal("0x0000000000000000000000000000000000000000");
            expect(lpInfo.token1).to.equal("0x0000000000000000000000000000000000000000");
            expect(lpInfo.reserve0.toString()).to.equal("0");
            expect(lpInfo.reserve1.toString()).to.equal("0");
        });
    });

    describe("fetchMmInfo", () => {
        it("Gets the MM information for V2", async () => {
            const tokens = [DAEMToken.address, fooToken.address, barToken.address];

            const result = await infoFetcher.fetchMmInfo(
                mmV2.address,
                false,
                owner.address,
                tokens,
                tokens
            );

            console.log(result);
            expect(result.length).to.equal(3);

            // "accountData" contains the fake data returned in "MockMoneyMarketPool"
            const accountData = result.accountData;
            expect(accountData.length).to.equal(6);
            expect(accountData.totalCollateralETH).to.equal(BigNumber.from("12000000000000000000"));
            expect(accountData.totalDebtETH).to.equal(BigNumber.from("10000000000000000000"));
            expect(accountData.availableBorrowsETH).to.equal(
                BigNumber.from("35000000000000000000")
            );
            expect(accountData.currentLiquidationThreshold).to.equal(BigNumber.from("555"));
            expect(accountData.ltv).to.equal(BigNumber.from("125"));
            expect(accountData.healthFactor).to.equal(BigNumber.from("2000000000000000000"));

            // "balances.coin" contains the user balance
            const coinBalance = result.balances.coin;
            expect(coinBalance).to.equal(await ethers.provider.getBalance(owner.address));

            // "balances.tokens" contains the 3 tokens balances
            const balances = result.balances.tokens;
            expect(balances.length).to.equal(3);
            expect(balances[0].toNumber()).to.equal(125000);
            expect(balances[1].toNumber()).to.equal(758500);
            expect(balances[2].toNumber()).to.equal(0);

            // "APYs" contains 3 values for each token (123, 456, 789)
            const APYs = result.APYs;
            expect(APYs.length).to.equal(9);
            expect(APYs[0].toNumber()).to.equal(123);
            expect(APYs[1].toNumber()).to.equal(456);
            expect(APYs[2].toNumber()).to.equal(789);
            expect(APYs[3].toNumber()).to.equal(123);
            expect(APYs[4].toNumber()).to.equal(456);
            expect(APYs[5].toNumber()).to.equal(789);
            expect(APYs[6].toNumber()).to.equal(123);
            expect(APYs[7].toNumber()).to.equal(456);
            expect(APYs[8].toNumber()).to.equal(789);
        });

        it("Gets the MM information for V3", async () => {
            const tokens = [DAEMToken.address, fooToken.address, barToken.address];

            const result = await infoFetcher.fetchMmInfo(
                mmV3.address,
                true,
                owner.address,
                tokens,
                tokens
            );

            console.log(result);
            expect(result.length).to.equal(3);

            // "accountData" contains the fake data returned in "MockMoneyMarketPool"
            const accountData = result.accountData;
            expect(accountData.length).to.equal(6);
            expect(accountData.totalCollateralETH).to.equal(BigNumber.from("12000000000000000000"));
            expect(accountData.totalDebtETH).to.equal(BigNumber.from("10000000000000000000"));
            expect(accountData.availableBorrowsETH).to.equal(
                BigNumber.from("35000000000000000000")
            );
            expect(accountData.currentLiquidationThreshold).to.equal(BigNumber.from("555"));
            expect(accountData.ltv).to.equal(BigNumber.from("125"));
            expect(accountData.healthFactor).to.equal(BigNumber.from("2000000000000000000"));

            // "balances.coin" contains the user balance
            const coinBalance = result.balances.coin;
            expect(coinBalance).to.equal(await ethers.provider.getBalance(owner.address));

            // "balances.tokens" contains the 3 tokens balances
            const balances = result.balances.tokens;
            expect(balances.length).to.equal(3);
            expect(balances[0].toNumber()).to.equal(125000);
            expect(balances[1].toNumber()).to.equal(758500);
            expect(balances[2].toNumber()).to.equal(0);

            // "APYs" contains 3 values for each token (123, 456, 789)
            const APYs = result.APYs;
            expect(APYs.length).to.equal(9);
            expect(APYs[0].toNumber()).to.equal(123);
            expect(APYs[1].toNumber()).to.equal(456);
            expect(APYs[2].toNumber()).to.equal(789);
            expect(APYs[3].toNumber()).to.equal(123);
            expect(APYs[4].toNumber()).to.equal(456);
            expect(APYs[5].toNumber()).to.equal(789);
            expect(APYs[6].toNumber()).to.equal(123);
            expect(APYs[7].toNumber()).to.equal(456);
            expect(APYs[8].toNumber()).to.equal(789);
        });
    });
});
