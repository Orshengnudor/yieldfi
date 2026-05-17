// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Vault
/// @notice ERC-4626 vault wrapping USDC. Shares are yUSDC.
///         Owner can call injectYield() to simulate yield accrual on testnet.
contract Vault is ERC4626, Ownable {
    event YieldInjected(address indexed from, uint256 amount);

    constructor(IERC20 _usdc)
        ERC4626(_usdc)
        ERC20("YieldFi USDC", "yUSDC")
        Ownable(msg.sender)
    {}

    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Inject yield by transferring USDC directly into the vault.
    ///         Increases totalAssets without minting new shares → each share
    ///         becomes redeemable for more USDC. Onlyowner, for testnet demos.
    function injectYield(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be >0");
        require(totalSupply() > 0, "No shares outstanding");
        require(IERC20(asset()).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit YieldInjected(msg.sender, amount);
    }
}
