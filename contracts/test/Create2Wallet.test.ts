import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Create2Wallet", function () {
  async function deployWalletFixture() {
    const [owner, other] = await ethers.getSigners();
    const WalletFactory = await ethers.getContractFactory("WalletFactory");
    const factory = await WalletFactory.deploy();
    const salt = ethers.zeroPadBytes(ethers.toBeHex(42), 32);
    await factory.deployWallet(owner.address, salt);
    const predicted = await factory.computeAddress(owner.address, salt);
    const wallet = await ethers.getContractAt("Create2Wallet", predicted);
    return { factory, wallet, owner, other };
  }

  it("should set owner and nonce zero", async function () {
    const { wallet, owner } = await loadFixture(deployWalletFixture);
    expect(await wallet.owner()).to.eq(owner.address);
    expect(await wallet.getNonce()).to.eq(0);
  });

  it("should execute call (owner only)", async function () {
    const { wallet, owner, other } = await loadFixture(deployWalletFixture);
    await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("1") });
    const recipient = other.address;
    const value = ethers.parseEther("0.5");
    const before = await ethers.provider.getBalance(recipient);
    await wallet.execute(recipient, value, "0x");
    expect(await ethers.provider.getBalance(recipient)).to.eq(before + value);
  });

  it("should reject execute from non-owner", async function () {
    const { wallet, other } = await loadFixture(deployWalletFixture);
    await expect(
      wallet.connect(other).execute(other.address, 0n, "0x")
    ).to.be.revertedWithCustomError(wallet, "OnlyOwner");
  });

  it("should executeBatch", async function () {
    const { wallet, owner, other } = await loadFixture(deployWalletFixture);
    await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("1") });
    const targets = [other.address, other.address];
    const values = [ethers.parseEther("0.3"), ethers.parseEther("0.2")];
    const payloads = ["0x", "0x"];
    const before = await ethers.provider.getBalance(other.address);
    await wallet.executeBatch(targets, values, payloads);
    expect(await ethers.provider.getBalance(other.address)).to.eq(before + ethers.parseEther("0.5"));
  });

  it("should reject executeBatch from non-owner", async function () {
    const { wallet, other } = await loadFixture(deployWalletFixture);
    await expect(
      wallet.connect(other).executeBatch([other.address], [0n], ["0x"])
    ).to.be.revertedWithCustomError(wallet, "OnlyOwner");
  });
});

describe("WalletFactory", function () {
  it("should deploy wallet and computeAddress match", async function () {
    const [owner] = await ethers.getSigners();
    const WalletFactory = await ethers.getContractFactory("WalletFactory");
    const factory = await WalletFactory.deploy();
    const salt = ethers.zeroPadBytes(ethers.toBeHex(1), 32);
    const predicted = await factory.computeAddress(owner.address, salt);
    const tx = await factory.deployWallet(owner.address, salt);
    const receipt = await tx.wait();
    const event = (factory.interface as any).parseLog(receipt!.logs[0]);
    expect(event.args[0]).to.eq(predicted);
    const wallet = await ethers.getContractAt("Create2Wallet", predicted);
    expect(await wallet.owner()).to.eq(owner.address);
  });

  it("should predict same address for same owner and salt", async function () {
    const [owner] = await ethers.getSigners();
    const WalletFactory = await ethers.getContractFactory("WalletFactory");
    const factory = await WalletFactory.deploy();
    const salt = ethers.zeroPadBytes(ethers.toBeHex(999), 32);
    const a = await factory.computeAddress(owner.address, salt);
    const b = await factory.computeAddress(owner.address, salt);
    expect(a).to.eq(b);
  });
});
