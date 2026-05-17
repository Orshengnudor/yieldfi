// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Swap} from "../src/Swap.sol";

contract DeploySwap is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        Swap swap = new Swap(USDC, EURC);

        console.log("Swap deployed at:", address(swap));
        console.log("USDC:", USDC);
        console.log("EURC:", EURC);

        vm.stopBroadcast();
    }
}