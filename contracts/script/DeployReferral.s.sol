// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Referral} from "../src/Referral.sol";

contract DeployReferral is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        Referral referral = new Referral();

        console.log("Referral deployed at:", address(referral));

        vm.stopBroadcast();
    }
}