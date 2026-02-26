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

  describe("EIP-712 executeBySignature", function () {
    it("should executeBySignature when owner signs", async function () {
      const { wallet, owner, other } = await loadFixture(deployWalletFixture);
      await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("1") });
      const to = other.address;
      const value = ethers.parseEther("0.3");
      const data = "0x";
      const nonce = await wallet.getNonce();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const domain = {
        name: "Create2Wallet",
        version: "1",
        chainId: Number(chainId),
        verifyingContract: await wallet.getAddress(),
      };
      const types = {
        ExecuteRequest: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const dataHash = ethers.keccak256(data);
      const message = { to, value, dataHash, nonce, deadline };
      const signature = await owner.signTypedData(domain, types, message);
      const before = await ethers.provider.getBalance(to);
      await wallet.executeBySignature(to, value, data, deadline, signature);
      expect(await ethers.provider.getBalance(to)).to.eq(before + value);
      expect(await wallet.getNonce()).to.eq(1n);
    });

    it("should executeBatchBySignature when owner signs", async function () {
      const { wallet, owner, other } = await loadFixture(deployWalletFixture);
      await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("1") });
      const targets = [other.address];
      const values = [ethers.parseEther("0.2")];
      const payloads = ["0x"];
      const nonce = await wallet.getNonce();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const payloadHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]", "uint256[]", "bytes[]"],
          [targets, values, payloads]
        )
      );
      const domain = {
        name: "Create2Wallet",
        version: "1",
        chainId: Number(chainId),
        verifyingContract: await wallet.getAddress(),
      };
      const types = {
        ExecuteBatchRequest: [
          { name: "payloadHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = { payloadHash, nonce, deadline };
      const signature = await owner.signTypedData(domain, types, message);
      const before = await ethers.provider.getBalance(other.address);
      await wallet.executeBatchBySignature(targets, values, payloads, deadline, signature);
      expect(await ethers.provider.getBalance(other.address)).to.eq(before + values[0]);
      expect(await wallet.getNonce()).to.eq(1n);
    });
  });

  describe("Session Key", function () {
    it("should add and remove session key", async function () {
      const { wallet, owner, other } = await loadFixture(deployWalletFixture);
      const limit = ethers.parseEther("1");
      const validUntil = Math.floor(Date.now() / 1000) + 86400;
      await wallet.addSessionKey(other.address, limit, validUntil);
      const sk = await wallet.sessionKeys(other.address);
      expect(sk.spendingLimit).to.eq(limit);
      expect(sk.used).to.eq(0n);
      expect(sk.validUntil).to.eq(validUntil);
      await wallet.removeSessionKey(other.address);
      const sk2 = await wallet.sessionKeys(other.address);
      expect(sk2.validUntil).to.eq(0n);
    });

    it("should executeBySignature when session key signs within limit", async function () {
      const { wallet, owner, other } = await loadFixture(deployWalletFixture);
      const signers = await ethers.getSigners();
      const recipientAddr = signers[2].address;
      await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("1") });
      const limit = ethers.parseEther("0.5");
      const validUntil = Math.floor(Date.now() / 1000) + 3600;
      await wallet.addSessionKey(other.address, limit, validUntil);
      const to = recipientAddr;
      const value = ethers.parseEther("0.2");
      const data = "0x";
      const nonce = await wallet.getNonce();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const domain = {
        name: "Create2Wallet",
        version: "1",
        chainId: Number(chainId),
        verifyingContract: await wallet.getAddress(),
      };
      const types = {
        ExecuteRequest: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const dataHash = ethers.keccak256(data);
      const message = { to, value, dataHash, nonce, deadline };
      const signature = await other.signTypedData(domain, types, message);
      const before = await ethers.provider.getBalance(recipientAddr);
      await wallet.executeBySignature(to, value, data, deadline, signature);
      expect(await ethers.provider.getBalance(recipientAddr)).to.eq(before + value);
      const sk = await wallet.sessionKeys(other.address);
      expect(sk.used).to.eq(value);
    });

    it("should revert executeBySignature when session key over limit", async function () {
      const { wallet, owner, other } = await loadFixture(deployWalletFixture);
      const signers = await ethers.getSigners();
      const recipientAddr = signers[2].address;
      await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("1") });
      const limit = ethers.parseEther("0.1");
      const validUntil = Math.floor(Date.now() / 1000) + 3600;
      await wallet.addSessionKey(other.address, limit, validUntil);
      const to = recipientAddr;
      const value = ethers.parseEther("0.5");
      const data = "0x";
      const nonce = await wallet.getNonce();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const domain = {
        name: "Create2Wallet",
        version: "1",
        chainId: Number(chainId),
        verifyingContract: await wallet.getAddress(),
      };
      const types = {
        ExecuteRequest: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const dataHash = ethers.keccak256(data);
      const message = { to, value, dataHash, nonce, deadline };
      const signature = await other.signTypedData(domain, types, message);
      await expect(
        wallet.executeBySignature(to, value, data, deadline, signature)
      ).to.be.revertedWithCustomError(wallet, "SessionKeyInvalid");
    });

    it("should revert executeBySignature when deadline expired", async function () {
      const { wallet, owner, other } = await loadFixture(deployWalletFixture);
      await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("1") });
      const to = other.address;
      const value = ethers.parseEther("0.1");
      const data = "0x";
      const nonce = await wallet.getNonce();
      const deadline = Math.floor(Date.now() / 1000) - 60;
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const domain = {
        name: "Create2Wallet",
        version: "1",
        chainId: Number(chainId),
        verifyingContract: await wallet.getAddress(),
      };
      const types = {
        ExecuteRequest: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const dataHash = ethers.keccak256(data);
      const message = { to, value, dataHash, nonce, deadline };
      const signature = await owner.signTypedData(domain, types, message);
      await expect(
        wallet.executeBySignature(to, value, data, deadline, signature)
      ).to.be.revertedWithCustomError(wallet, "Expired");
    });
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
