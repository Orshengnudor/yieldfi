// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Vault} from "../src/Vault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployVault is Script {
    // Arc testnet USDC ERC-20 interface (6 decimals)
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        Vault vault = new Vault(IERC20(USDC));

        console.log("Vault deployed at:", address(vault));
        console.log("USDC address used:", USDC);

        vm.stopBroadcast();
    }
}