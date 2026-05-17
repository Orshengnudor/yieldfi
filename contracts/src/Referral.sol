// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Referral is Ownable {
    mapping(address => string) public referralCodes;
    mapping(string => address) public codeToReferrer;
    mapping(address => address) public referrerOf;

    event ReferralCodeCreated(address indexed user, string code);
    event ReferralUsed(address indexed referrer, address indexed referee);

    constructor() Ownable(msg.sender) {}

    function createReferralCode(string memory code) external {
        require(bytes(code).length > 0, "Code cannot be empty");
        require(codeToReferrer[code] == address(0), "Code already taken");
        require(referralCodes[msg.sender] == "", "User already has a code");

        referralCodes[msg.sender] = code;
        codeToReferrer[code] = msg.sender;

        emit ReferralCodeCreated(msg.sender, code);
    }

    function getReferrer(address user) external view returns (address) {
        return referrerOf[user];
    }

    function getReferralCode(address user) external view returns (string memory) {
        return referralCodes[user];
    }

    // Called by the FeeDistributor to link a referee to a referrer
    function useReferralCode(string memory code, address referee) external onlyOwner {
        require(codeToReferrer[code] != address(0), "Invalid referral code");
        require(referrerOf[referee] == address(0), "Referee already has a referrer");

        address referrer = codeToReferrer[code];
        referrerOf[referee] = referrer;

        emit ReferralUsed(referrer, referee);
    }
}