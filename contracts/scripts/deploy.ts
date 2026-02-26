import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const WalletFactory = await ethers.getContractFactory("WalletFactory");
  const factory = await WalletFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("WalletFactory deployed to:", factoryAddress);

  // 可选：用当前账户作为 owner 部署一个示例钱包
  const salt = ethers.zeroPadBytes(ethers.toBeHex(1), 32);
  const predicted = await factory.computeAddress(deployer.address, salt);
  console.log("Predicted wallet address (owner=%s, salt=0x01...):", deployer.address, predicted);

  const tx = await factory.deployWallet(deployer.address, salt);
  const receipt = await tx.wait();
  console.log("Sample wallet deployed at:", receipt?.logs ? "check events" : predicted);
  const event = (factory.interface as any).parseLog(receipt!.logs[0]);
  if (event?.name === "WalletDeployed") {
    console.log("WalletDeployed event wallet:", event.args[0]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
