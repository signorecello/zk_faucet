import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying NullifierRegistry with account:", deployer.address);

  const factory = await ethers.getContractFactory("NullifierRegistry");
  const registry = await factory.deploy(deployer.address);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("NullifierRegistry deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
