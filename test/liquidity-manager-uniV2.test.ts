import { BaseProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, utils } from "ethers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import hre from "hardhat";

describe("UniswapV2LiquidityManager [FORKED CHAIN]", function () {
    let provider: BaseProvider;
    let owner: SignerWithAddress;
    let otherUser: SignerWithAddress;
    let daemToken: Contract;
    let wethToken: Contract;
    let liquidityManager: Contract;

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

        // get the default provider
        provider = ethers.provider;

        // get some wallets
        [owner, otherUser] = await ethers.getSigners();

        // Token contracts
        const TokenContract = await ethers.getContractFactory("MockToken");
        daemToken = await TokenContract.deploy("Daemons Token", "DAEM");
        wethToken = await ethers.getContractAt(
            "IERC20",
            "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"
        );

        // Get real Uniswap V2 router
        const quickswapRouter = await ethers.getContractAt(
            "IUniswapV2Router01",
            "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506"
        );

        // UniswapV2LiquidityManager contract
        const LiquidityManager = await ethers.getContractFactory("UniswapV2LiquidityManager");
        liquidityManager = await LiquidityManager.deploy(
            daemToken.address,
            quickswapRouter.address
        );

        // get a snapshot of the current state so to speed up tests
        snapshotId = await network.provider.send("evm_snapshot", []);
    });

    const createLp = async () => {
        // set amounts that will be used to create the LP
        // and give allowance
        const ETHAmount = utils.parseEther("1");
        const DAEMAmount = utils.parseEther("1500");
        await daemToken.mint(owner.address, DAEMAmount);
        await daemToken.approve(liquidityManager.address, DAEMAmount);

        // create the LP
        await liquidityManager
            .connect(owner)
            .createLP(DAEMAmount, owner.address, { value: ETHAmount });
    };

    describe("create LP", () => {
        it("LP creation can only be executed by admin", async () => {
            const ETHAmount = utils.parseEther("1.0");
            const DAEMAmount = utils.parseEther("1500");

            await expect(
                liquidityManager
                    .connect(otherUser)
                    .createLP(DAEMAmount, otherUser.address, { value: ETHAmount })
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("LP creation uses the passed ETH & DAEM", async () => {
            await createLp();

            // all funds have been used
            const ETHBalance = await provider.getBalance(liquidityManager.address);
            const DAEMBalance = await daemToken.balanceOf(liquidityManager.address);
            expect(ETHBalance).to.equal(ethers.utils.parseEther("0"));
            expect(DAEMBalance).to.equal(ethers.utils.parseEther("0"));

            // owner has the LP (as it was specified in the `to` argument)
            const lpAddress = await liquidityManager.polLp();
            const LP = await ethers.getContractAt("MockToken", lpAddress);
            const LPBalance = await LP.balanceOf(owner.address);
            expect(LPBalance.gt(0)).to.equal(true);
        });

        it("LP creation can only be executed once", async () => {
            await createLp();
            await expect(createLp()).to.be.revertedWith("LP already initialized");
        });
    });

    describe("setPolLP", () => {
        const fakeAddress = "0x9999000099990000999900009999000099990000";

        it("LP setting can only be executed by admin", async () => {
            await expect(
                liquidityManager.connect(otherUser).setPolLP(fakeAddress)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("updates the polLP value", async () => {
            await liquidityManager.setPolLP(fakeAddress);

            // owner has the LP (as it was specified in the `to` argument)
            const lpAddress = await liquidityManager.polLp();
            expect(lpAddress).to.equal(fakeAddress);
        });

        it("LP creation can only be executed once", async () => {
            await liquidityManager.setPolLP(fakeAddress);
            await expect(liquidityManager.setPolLP(fakeAddress)).to.be.revertedWith(
                "LP already initialized"
            );
        });
    });

    describe("Quotations", () => {
        it("correctly quote ETH to DAEM", async () => {
            await createLp();

            const amount = ethers.utils.parseEther("0.001");
            const quote = await liquidityManager.ETHToDAEM(amount);
            expect(quote).to.equal(ethers.utils.parseEther("1.494010471559854824")); // ~ 1.5
        });

        it("correctly quote DAEM to ETH", async () => {
            await createLp();

            const amount = ethers.utils.parseEther("1.5");
            const quote = await liquidityManager.DAEMToETH(amount);
            expect(quote).to.equal(ethers.utils.parseEther("0.000996006981039903")); // ~ 0.001
        });
    });

    describe("percentageOfDAEMInLP", () => {
        it("needs the LP to be initialized to work", async () => {
            await expect(liquidityManager.percentageOfDAEMInLP(owner.address)).to.be.revertedWith(
                "LP not initialized yet"
            );
        });

        it("correctly gets the percentage of DAEM in LP", async () => {
            await createLp();

            // 100% of DAEM is in the LP as of now (a tiny bit of the LP goes in fees, so it's lost)
            const percentage1 = await liquidityManager.percentageOfDAEMInLP(owner.address);
            expect(percentage1.toNumber()).to.equal(9999);

            // after minting, the percentage should drop to 50%
            await daemToken.mint(owner.address, ethers.utils.parseEther("1500"));
            const percentage2 = await liquidityManager.percentageOfDAEMInLP(owner.address);
            expect(percentage2.toNumber()).to.equal(4999);

            // by adding even more, percentage should drop
            await daemToken.mint(owner.address, ethers.utils.parseEther("13500"));
            const percentage3 = await liquidityManager.percentageOfDAEMInLP(owner.address);
            expect(percentage3.toNumber()).to.equal(909);
        });
    });

    describe("swapETHforDAEM", () => {
        it("gets the user the expected amount of DAEM", async () => {
            await createLp();

            const amount = ethers.utils.parseEther("0.001");
            const quote = await liquidityManager.ETHToDAEM(amount);
            await liquidityManager.swapETHforDAEM(quote, owner.address, 0xffffffffffff, {
                value: amount
            });

            const DAEMBalance = await daemToken.balanceOf(owner.address);
            expect(DAEMBalance.sub(quote).toNumber()).is.greaterThanOrEqual(0);
        });
    });

    describe("swapTokenForToken", () => {
        it("successfully swaps DAEM -> WETH", async () => {
            await createLp();

            const zero = BigNumber.from(0);
            const amount = ethers.utils.parseEther("5");
            const quote = await liquidityManager.DAEMToETH(amount);

            // get some DAEM and give allowance
            await daemToken.mint(owner.address, amount);
            await daemToken.approve(liquidityManager.address, amount);

            // verify user has 5 DAEM and 0 WETH
            expect(await daemToken.balanceOf(owner.address)).is.equal(amount);
            expect(await wethToken.balanceOf(owner.address)).is.equal(zero);

            // swap
            await liquidityManager.swapTokenForToken(
                amount,
                1, //1:DAEM-to-WETH
                quote,
                owner.address,
                0xffffffffffff
            );

            // verify `quote` WETH has been added to user balance
            const WETHBalance = await wethToken.balanceOf(owner.address);
            expect(WETHBalance.sub(quote).toNumber()).is.greaterThanOrEqual(0);

            // verify DAEM have been used
            expect(await daemToken.balanceOf(owner.address)).is.equal(zero);
        });

        it("successfully swaps DAEM -> ETH", async () => {
            await createLp();

            const zero = BigNumber.from(0);
            const amount = ethers.utils.parseEther("500");
            const quote = await liquidityManager.DAEMToETH(amount);

            // get some DAEM and give allowance
            await daemToken.mint(owner.address, amount);
            await daemToken.approve(liquidityManager.address, amount);

            // verify user has 5 DAEM and 0 WETH
            expect(await daemToken.balanceOf(owner.address)).is.equal(amount);
            const ethBalancePre = await provider.getBalance(owner.address);

            // swap
            await liquidityManager.swapTokenForToken(
                amount,
                2, //2:DAEM-to-ETH
                quote,
                owner.address,
                0xffffffffffff
            );

            // verify `quote` ETH has been added to user balance
            const ethBalanceAfter = await provider.getBalance(owner.address);
            const diff = ethBalancePre.add(quote).sub(ethBalanceAfter);
            const gasCost = ethers.utils.parseEther("0.0002");
            expect(diff.lte(gasCost)).to.equal(true);

            // verify DAEM have been used
            expect(await daemToken.balanceOf(owner.address)).is.equal(zero);
        });

        it("successfully swaps WETH -> DAEM", async () => {
            await createLp();

            const zero = BigNumber.from(0);
            const amount = ethers.utils.parseEther("0.5");
            const quote = await liquidityManager.ETHToDAEM(amount);

            // get some WETH and give allowance
            await owner.sendTransaction({ to: wethToken.address, value: amount });
            await wethToken.approve(liquidityManager.address, amount);

            // verify user has 0 DAEM and 0.5 WETH
            expect(await daemToken.balanceOf(owner.address)).is.equal(zero);
            expect(await wethToken.balanceOf(owner.address)).is.equal(amount);

            // swap
            await liquidityManager.swapTokenForToken(
                amount,
                0, //0: WETH-to-DAEM
                quote,
                owner.address,
                0xffffffffffff
            );

            // verify `quote` DAEM has been added to user balance
            const DAEMBalance = await daemToken.balanceOf(owner.address);
            expect(DAEMBalance.sub(quote).toNumber()).is.greaterThanOrEqual(0);

            // verify WETH have been used
            expect(await wethToken.balanceOf(owner.address)).is.equal(zero);
        });
    });

    describe("addLiquidityETH", () => {
        it("fails if LP is not initialized", async () => {
            const amountETH = ethers.utils.parseEther("0.001");
            const amountDAEM = ethers.utils.parseEther("1.494010471559854824");
            await daemToken.mint(owner.address, amountDAEM);
            await daemToken.approve(liquidityManager.address, amountDAEM);
            await expect(
                liquidityManager.addLiquidityETH(amountDAEM, owner.address, 0xffffffffffff, {
                    value: amountETH
                })
            ).to.be.revertedWith("LP not initialized yet");
        });

        it("adds the specified amounts to the LP", async () => {
            await createLp();

            // measure initial LP Balance
            const lpAddress = await liquidityManager.polLp();
            const LP = await ethers.getContractAt("MockToken", lpAddress);
            const initialLpBalance = await LP.balanceOf(owner.address);
            expect(initialLpBalance.gt(0)).to.equal(true);

            const amountETH = ethers.utils.parseEther("0.001");
            const amountDAEM = ethers.utils.parseEther("1.5");
            await daemToken.mint(owner.address, amountDAEM);
            await daemToken.approve(liquidityManager.address, amountDAEM);
            await liquidityManager.addLiquidityETH(amountDAEM, owner.address, 0xffffffffffff, {
                value: amountETH
            });

            const finalLpBalance = await LP.balanceOf(owner.address);
            expect(finalLpBalance.gt(initialLpBalance)).to.equal(true);
        });

        it("sends back DAEM tokens in excess", async () => {
            await createLp();

            const amountETH = ethers.utils.parseEther("0.001");
            const amountDAEM = ethers.utils.parseEther("15001.5");
            await daemToken.mint(owner.address, amountDAEM);
            await daemToken.approve(liquidityManager.address, amountDAEM);
            await liquidityManager.addLiquidityETH(amountDAEM, owner.address, 0xffffffffffff, {
                value: amountETH
            });

            // user should have ~15000 DAEM tokens
            const DAEMBalance = await daemToken.balanceOf(owner.address);
            expect(DAEMBalance).to.equal(ethers.utils.parseEther("15000"));
        });
    });
});
