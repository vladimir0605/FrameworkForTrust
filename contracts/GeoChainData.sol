// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract GeoChainData is ERC20, ERC20Capped, AccessControl, Ownable2Step, Pausable {

    // ── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ✅ FIX (medium #1): BURN_ROLE for the on-chain slash mechanism
    bytes32 public constant BURN_ROLE   = keccak256("BURN_ROLE");

    // ── Events ───────────────────────────────────────────────────────────────
    // ✅ FIX (medium #2): custom event for reward audit trail
    event ContributionRewarded(
        address indexed contributor,
        uint256 amount,
        uint256 timestamp
    );

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address initialTreasury,
        uint256 initialSupply,  // in smallest units (e.g. 1_000_000e18)
        uint256 capSupply       // in smallest units (e.g. 2_000_000_000e18)
    )
        ERC20("GeoChainData", "GCD")
        ERC20Capped(capSupply)
        Ownable(initialOwner)
    {
        require(initialOwner    != address(0), "owner=0");
        require(initialTreasury != address(0), "treasury=0");
        require(initialSupply   <= capSupply,  "init>cap");

        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE,        initialOwner);
        _grantRole(PAUSER_ROLE,        initialOwner);
        // ✅ FIX: BURN_ROLE is granted to the initial owner
        // The backend oracle wallet must be granted this role explicitly:
        // gcdToken.grantRole(BURN_ROLE, backendWallet)
        _grantRole(BURN_ROLE, initialOwner);

        _mint(initialTreasury, initialSupply);
    }

    // ── Pause ─────────────────────────────────────────────────────────────────
    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ── Mint / Reward ─────────────────────────────────────────────────────────

    /// @notice Mint tokens — MINTER_ROLE only
    /// @dev amount is in smallest units (wei-like), without multiplying by decimals()
    ///      e.g. for 5 GCD: amount = 5 * 10**18
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        require(to     != address(0), "to=0");
        // ✅ FIX (high #2): check that amount is not zero
        require(amount > 0,           "amount=0");
        _mint(to, amount);
    }

    /// @notice Reward a contributor — emits ContributionRewarded event
    /// @dev Semantic alias for mint, but with a custom event for audit trail.
    ///      amount is in smallest units (wei-like).
    ///      Backend conversion: amount_wei = int(gcd_amount * 10**18)
    function reward(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        require(to     != address(0), "to=0");
        // ✅ FIX (high #2): check that amount is not zero
        require(amount > 0,           "amount=0");
        _mint(to, amount);
        // ✅ FIX (medium #2): emit custom event with context
        emit ContributionRewarded(to, amount, block.timestamp);
    }

    // ── Burn (slash) ──────────────────────────────────────────────────────────

    /// @notice On-chain token burn for the slash mechanism — BURN_ROLE only
    /// @dev Called by the backend oracle when an event is marked as fake/spam.
    ///      Reduces total supply — deflationary mechanism.
    ///      amount is in smallest units (wei-like).
    // ✅ FIX (high #1): added burn function for on-chain slash
    function burn(address from, uint256 amount)
        external
        onlyRole(BURN_ROLE)
        whenNotPaused
    {
        require(from   != address(0), "burn from zero");
        require(amount > 0,           "amount=0");
        _burn(from, amount);
    }

    // ── Ownership & Role sync ─────────────────────────────────────────────────

    /// @dev Automatically synchronises roles on ownership transfer.
    ///      Uses Ownable2Step — transfer is two-step (acceptOwnership).
    // ✅ FIX (critical #2): added oldOwner != newOwner check
    //    Prevents accidental role revocation if oldOwner == newOwner
    function _transferOwnership(address newOwner) internal override {
        address oldOwner = owner();
        super._transferOwnership(newOwner);

        // Grant roles to the new owner
        if (newOwner != address(0)) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
            _grantRole(MINTER_ROLE,        newOwner);
            _grantRole(PAUSER_ROLE,        newOwner);
            _grantRole(BURN_ROLE,          newOwner);
        }

        // ✅ FIX: Revoke roles from the old owner ONLY if different from new owner
        // Without this check: if oldOwner == newOwner, roles are granted then
        // immediately revoked
        if (oldOwner != address(0) && oldOwner != newOwner) {
            _revokeRole(BURN_ROLE,          oldOwner);
            _revokeRole(PAUSER_ROLE,        oldOwner);
            _revokeRole(MINTER_ROLE,        oldOwner);
            _revokeRole(DEFAULT_ADMIN_ROLE, oldOwner);
        }
    }

    // ── ERC20 hook ────────────────────────────────────────────────────────────

    /// @dev OZ hook: enforces the cap. Pause now applies only to mint/reward/burn,
    ///      NOT to all transfers — users can still transfer tokens when mint is paused.
    // ✅ FIX (critical #1): removed whenNotPaused from _update
    //    Reason: whenNotPaused on _update blocks ALL transfers (including
    //    user transfers and burns) when the contract is paused.
    //    Pause now blocks only mint(), reward() and burn() — not user transfers.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped)
        // whenNotPaused  ← REMOVED
    {
        super._update(from, to, value);
    }
}
