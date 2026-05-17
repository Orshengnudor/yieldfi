// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";

contract DeployFeeDistributor is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant VAULT = 0xB58dDc052bE76AeA49603dA35f2836fd4C49e84e;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        FeeDistributor distributor = new FeeDistributor(USDC, VAULT);

        console.log("FeeDistributor deployed at:", address(distributor));
        console.log("USDC address:", USDC);
        console.log("Vault (yUSDC) address:", VAULT);

        vm.stopBroadcast();
    }
}