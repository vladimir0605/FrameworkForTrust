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

// ✅ FIX (critical #2): dodan AccessControl uz Ownable2Step
// ORACLE_ROLE omogućava backendu da poziva reward() i slash()
// bez da backend wallet ima owner privilegije
contract FfTStaking is Ownable2Step, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // ── Roles ─────────────────────────────────────────────────────────────────
    // ✅ FIX (critical #2): ORACLE_ROLE za backend automatizaciju
    // Backend wallet dobija ovu rolu, ne owner privilegije:
    // staking.grantRole(ORACLE_ROLE, backendWalletAddress)
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ── State ─────────────────────────────────────────────────────────────────
    IFfTRegistry public registry;

    uint256 public lockPeriod;

    mapping(address => uint256) public staked;
    mapping(address => uint256) public lastStakeAt;

    uint256 public totalStaked;

    // ✅ FIX (critical #1): odvojen reward pool od staked tokena
    // rewardPool = tokeni koji su eksplicitno funded za nagrađivanje
    // Ne koriste se stakovi korisnika za isplatu nagrada
    uint256 public rewardPool;

    // ✅ FIX (high #2): maksimalni stake po korisniku (default: bez limita)
    uint256 public maxStakePerUser = type(uint256).max;

    // ── Events ────────────────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Rewarded(address indexed user, uint256 amount, address indexed by);
    event Slashed(address indexed user, uint256 amount, address indexed by);
    event SweptToTreasury(uint256 amount, address indexed by);
    event LockPeriodUpdated(uint256 newPeriod, address indexed by);
    event RegistryUpdated(address indexed registry, address indexed by);
    // ✅ FIX (critical #1): event za punjenje reward poola
    event RewardPoolFunded(uint256 amount, address indexed by);
    // ✅ FIX (high #2): event za promjenu maxStakePerUser
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

        // ✅ FIX (medium #1): validacija da registryAddr je contract
        require(registryAddr.code.length > 0, "registry not contract");

        registry   = IFfTRegistry(registryAddr);
        lockPeriod = initialLockPeriod;

        // ✅ FIX (critical #2): dodijeli DEFAULT_ADMIN_ROLE i ORACLE_ROLE owneru
        // Owner može naknadno grantovati ORACLE_ROLE backend walletu:
        // staking.grantRole(ORACLE_ROLE, backendWallet)
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ORACLE_ROLE,        initialOwner);

        emit RegistryUpdated(registryAddr,     initialOwner);
        emit LockPeriodUpdated(initialLockPeriod, initialOwner);
    }

    // ── Admin setters ─────────────────────────────────────────────────────────

    // ✅ FIX (medium #1): dodata code.length provjera
    function setRegistry(address registryAddr) external onlyOwner {
        require(registryAddr != address(0),        "registry=0");
        require(registryAddr.code.length > 0,     "registry not contract");
        registry = IFfTRegistry(registryAddr);
        emit RegistryUpdated(registryAddr, msg.sender);
    }

    function setLockPeriod(uint256 newPeriod) external onlyOwner {
        lockPeriod = newPeriod;
        emit LockPeriodUpdated(newPeriod, msg.sender);
    }

    // ✅ FIX (high #2): setter za maksimalni stake po korisniku
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

    // ✅ FIX (critical #1): funkcija za punjenje reward poola
    // Owner ili oracle puni pool zasebno od stakova korisnika.
    // Ova sredstva su namijenjena isključivo za nagrađivanje —
    // ne mogu se pobrkati sa stakovanim tokenima.
    //
    // Primjer workflow-a:
    //   1. Protocol wallet odobri (approve) FfTStaking da troši GCD
    //   2. Pozove fundRewardPool(amount) da prenese u pool
    //   3. Backend oracle poziva reward() za nagrađivanje korisnika
    function fundRewardPool(uint256 amount) external whenNotPaused {
        require(amount > 0, "amount=0");
        _token().safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;
        emit RewardPoolFunded(amount, msg.sender);
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    function stake(uint256 amount) external whenNotPaused {
        require(amount > 0, "amount=0");

        // ✅ FIX (high #2): provjera maxStakePerUser
        require(
            staked[msg.sender] + amount <= maxStakePerUser,
            "Exceeds max stake per user"
        );

        // Checks-Effects-Interactions pattern: state promjene prije transfera
        staked[msg.sender] += amount;
        totalStaked        += amount;

        // Reset lock perioda pri svakom novom staku
        // NAPOMENA: ovo resetuje lock i za postojeće stakove.
        // Dokumentovano u UI-u kako bi korisnici bili svjesni.
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
    //   - Nagrada se isplaćuje IZ rewardPool-a, NE iz staked tokena
    //   - onlyRole(ORACLE_ROLE) umjesto onlyOwner —
    //     backend wallet može automatski nagrađivati bez owner privilegija
    function reward(address user, uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
    {
        require(user   != address(0), "user=0");
        require(amount > 0,           "amount=0");
        // ✅ FIX (critical #1): provjera da postoji dovoljno u reward poolu
        require(rewardPool >= amount,  "Insufficient reward pool");

        // Smanji reward pool prije transfera (reentrancy zaštita)
        rewardPool -= amount;

        _token().safeTransfer(user, amount);
        emit Rewarded(user, amount, msg.sender);
    }

    // ── Slash ─────────────────────────────────────────────────────────────────

    // ✅ FIX (critical #2): onlyRole(ORACLE_ROLE) umjesto onlyOwner
    // Backend oracle može automatski kažnjavati bez owner privilegija
    function slash(address user, uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
    {
        require(user   != address(0), "user=0");
        require(amount > 0,           "amount=0");

        uint256 s   = staked[user];
        uint256 cut = amount > s ? s : amount;

        // Slashed tokeni ostaju u contractu kao surplus
        // sweepSurplusToTreasury() ih može prebaciti u treasury
        staked[user]  = s - cut;
        totalStaked  -= cut;

        emit Slashed(user, cut, msg.sender);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// @notice Ukupan balans GCD tokena u contractu
    function contractTokenBalance() public view returns (uint256) {
        return _token().balanceOf(address(this));
    }

    /// @notice Surplus = balans - totalStaked - rewardPool
    /// @dev Ovo su slashed tokeni koji mogu ići u treasury
    // ✅ FIX (critical #1): surplusBalance uzima u obzir i rewardPool
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

    // ✅ Potrebno zbog višestrukog nasljeđivanja Ownable2Step + AccessControl
    function supportsInterface(bytes4 interfaceId)
        public view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}