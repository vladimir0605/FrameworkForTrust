// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IFfTRegistry {
    function gcdToken()  external view returns (address);
    function treasury()  external view returns (address);
}

// ✅ FIX (critical #2): AccessControl added alongside Ownable2Step
// ORACLE_ROLE allows the backend to call reward() and slash()
// without the backend wallet needing owner privileges
contract FfTStaking is Ownable2Step, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // ── Roles ─────────────────────────────────────────────────────────────────
    // ✅ FIX (critical #2): ORACLE_ROLE for backend automation
    // The backend wallet is granted this role, not owner privileges:
    // staking.grantRole(ORACLE_ROLE, backendWalletAddress)
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ── State ─────────────────────────────────────────────────────────────────
    IFfTRegistry public registry;

    uint256 public lockPeriod;

    mapping(address => uint256) public staked;
    mapping(address => uint256) public lastStakeAt;

    uint256 public totalStaked;

    // ✅ FIX (critical #1): reward pool separated from staked tokens
    // rewardPool = tokens explicitly funded for rewarding contributors
    // User stakes are never used to pay out rewards
    uint256 public rewardPool;

    // ✅ FIX (high #2): maximum stake per user (default: unlimited)
    uint256 public maxStakePerUser = type(uint256).max;

    // ── Events ────────────────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Rewarded(address indexed user, uint256 amount, address indexed by);
    event Slashed(address indexed user, uint256 amount, address indexed by);
    event SweptToTreasury(uint256 amount, address indexed by);
    event LockPeriodUpdated(uint256 newPeriod, address indexed by);
    event RegistryUpdated(address indexed registry, address indexed by);
    // ✅ FIX (critical #1): event for funding the reward pool
    event RewardPoolFunded(uint256 amount, address indexed by);
    // ✅ FIX (high #2): event for updating maxStakePerUser
    event MaxStakePerUserUpdated(uint256 newMax, address indexed by);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address registryAddr,
        uint256 initialLockPeriod
    )
        Ownable(initialOwner)
    {
        require(initialOwner  != address(0), "owner=0");
        require(registryAddr  != address(0), "registry=0");

        // ✅ FIX (medium #1): validate that registryAddr is a contract
        require(registryAddr.code.length > 0, "registry not contract");

        registry   = IFfTRegistry(registryAddr);
        lockPeriod = initialLockPeriod;

        // ✅ FIX (critical #2): grant DEFAULT_ADMIN_ROLE and ORACLE_ROLE to owner
        // Owner can later grant ORACLE_ROLE to the backend wallet:
        // staking.grantRole(ORACLE_ROLE, backendWallet)
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ORACLE_ROLE,        initialOwner);

        emit RegistryUpdated(registryAddr,        initialOwner);
        emit LockPeriodUpdated(initialLockPeriod, initialOwner);
    }

    // ── Admin setters ─────────────────────────────────────────────────────────

    // ✅ FIX (medium #1): added code.length check
    function setRegistry(address registryAddr) external onlyOwner {
        require(registryAddr != address(0),       "registry=0");
        require(registryAddr.code.length > 0,    "registry not contract");
        registry = IFfTRegistry(registryAddr);
        emit RegistryUpdated(registryAddr, msg.sender);
    }

    function setLockPeriod(uint256 newPeriod) external onlyOwner {
        lockPeriod = newPeriod;
        emit LockPeriodUpdated(newPeriod, msg.sender);
    }

    // ✅ FIX (high #2): setter for maximum stake per user
    function setMaxStakePerUser(uint256 max) external onlyOwner {
        require(max > 0, "max=0");
        maxStakePerUser = max;
        emit MaxStakePerUserUpdated(max, msg.sender);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _token() internal view returns (IERC20) {
        address t = registry.gcdToken();
        require(t != address(0), "GCD not set in registry");
        return IERC20(t);
    }

    // ── Reward pool management ────────────────────────────────────────────────

    // ✅ FIX (critical #1): function for funding the reward pool
    // Owner or oracle funds the pool separately from user stakes.
    // These funds are exclusively reserved for rewarding contributors —
    // they cannot be confused with staked tokens.
    //
    // Example workflow:
    //   1. Protocol wallet approves FfTStaking to spend GCD
    //   2. Calls fundRewardPool(amount) to transfer funds into the pool
    //   3. Backend oracle calls reward() to reward contributors
    function fundRewardPool(uint256 amount) external whenNotPaused {
        require(amount > 0, "amount=0");
        _token().safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;
        emit RewardPoolFunded(amount, msg.sender);
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    function stake(uint256 amount) external whenNotPaused {
        require(amount > 0, "amount=0");

        // ✅ FIX (high #2): enforce maxStakePerUser
        require(
            staked[msg.sender] + amount <= maxStakePerUser,
            "Exceeds max stake per user"
        );

        // Checks-Effects-Interactions pattern: state changes before transfer
        staked[msg.sender] += amount;
        totalStaked        += amount;

        // Lock period resets on every new stake.
        // NOTE: this also resets the lock for existing stakes.
        // Documented in the UI so users are aware.
        lastStakeAt[msg.sender] = block.timestamp;

        _token().safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function canUnstake(address user) public view returns (bool) {
        return block.timestamp >= lastStakeAt[user] + lockPeriod;
    }

    function unstake(uint256 amount) external whenNotPaused {
        require(amount > 0,                         "amount=0");
        require(staked[msg.sender] >= amount,       "insufficient stake");
        require(canUnstake(msg.sender),             "locked");

        // Checks-Effects-Interactions pattern
        staked[msg.sender] -= amount;
        totalStaked        -= amount;

        _token().safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    // ── Reward ────────────────────────────────────────────────────────────────

    // ✅ FIX (critical #1 + critical #2):
    //   - Reward is paid FROM rewardPool, NOT from staked tokens
    //   - onlyRole(ORACLE_ROLE) instead of onlyOwner —
    //     backend wallet can reward automatically without owner privileges
    function reward(address user, uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
    {
        require(user   != address(0), "user=0");
        require(amount > 0,           "amount=0");
        // ✅ FIX (critical #1): check that the reward pool has sufficient funds
        require(rewardPool >= amount,  "Insufficient reward pool");

        // Decrease reward pool before transfer (reentrancy protection)
        rewardPool -= amount;

        _token().safeTransfer(user, amount);
        emit Rewarded(user, amount, msg.sender);
    }

    // ── Slash ─────────────────────────────────────────────────────────────────

    // ✅ FIX (critical #2): onlyRole(ORACLE_ROLE) instead of onlyOwner
    // Backend oracle can automatically slash without owner privileges
    function slash(address user, uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
    {
        require(user   != address(0), "user=0");
        require(amount > 0,           "amount=0");

        uint256 s   = staked[user];
        uint256 cut = amount > s ? s : amount;

        // Slashed tokens remain in the contract as surplus
        // sweepSurplusToTreasury() can move them to the treasury
        staked[user]  = s - cut;
        totalStaked  -= cut;

        emit Slashed(user, cut, msg.sender);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// @notice Total GCD token balance held by this contract
    function contractTokenBalance() public view returns (uint256) {
        return _token().balanceOf(address(this));
    }

    /// @notice Surplus = balance - totalStaked - rewardPool
    /// @dev These are slashed tokens that can be swept to treasury
    // ✅ FIX (critical #1): surplusBalance accounts for rewardPool as well
    function surplusBalance() public view returns (uint256) {
        uint256 bal      = contractTokenBalance();
        uint256 reserved = totalStaked + rewardPool;
        if (bal <= reserved) return 0;
        return bal - reserved;
    }

    // ── Treasury sweep ────────────────────────────────────────────────────────

    function sweepSurplusToTreasury(uint256 amount)
        external
        onlyOwner
        whenNotPaused
    {
        address t = registry.treasury();
        require(t != address(0), "treasury=0");

        uint256 surplus = surplusBalance();
        require(amount <= surplus, "amount>surplus");

        _token().safeTransfer(t, amount);
        emit SweptToTreasury(amount, msg.sender);
    }

    // ── Interface support ─────────────────────────────────────────────────────

    // ✅ Required due to multiple inheritance: Ownable2Step + AccessControl
    function supportsInterface(bytes4 interfaceId)
        public view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
