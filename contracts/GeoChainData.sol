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

    // ✅ FIX (medium #1): BURN_ROLE za on-chain slash mehanizam
    bytes32 public constant BURN_ROLE   = keccak256("BURN_ROLE");

    // ── Events ───────────────────────────────────────────────────────────────
    // ✅ FIX (medium #2): custom event za audit trail nagrada
    event ContributionRewarded(
        address indexed contributor,
        uint256 amount,
        uint256 timestamp
    );

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address initialTreasury,
        uint256 initialSupply,  // u najmanjim jedinicama (npr. 1_000_000e18)
        uint256 capSupply       // u najmanjim jedinicama (npr. 2_000_000_000e18)
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
        // ✅ FIX: BURN_ROLE se dodjeljuje initijalnom owneru
        // Backend oracle wallet treba dobiti ovu ulogu eksplicitno:
        // gcdToken.grantRole(BURN_ROLE, backendWallet)
        _grantRole(BURN_ROLE, initialOwner);

        _mint(initialTreasury, initialSupply);
    }

    // ── Pause ─────────────────────────────────────────────────────────────────
    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ── Mint / Reward ─────────────────────────────────────────────────────────

    /// @notice Mint tokena — samo MINTER_ROLE
    /// @dev amount je u najmanjim jedinicama (wei-like), bez množenja sa decimals()
    ///      Npr. za 5 GCD: amount = 5 * 10**18
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        require(to     != address(0), "to=0");
        // ✅ FIX (high #2): provjera da amount nije nula
        require(amount > 0,           "amount=0");
        _mint(to, amount);
    }

    /// @notice Nagradi kontributora — emituje ContributionRewarded event
    /// @dev Semantički alias za mint, ali sa custom eventom za audit trail.
    ///      amount je u najmanjim jedinicama (wei-like).
    ///      Backend konverzija: amount_wei = int(gcd_amount * 10**18)
    function reward(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        require(to     != address(0), "to=0");
        // ✅ FIX (high #2): provjera da amount nije nula
        require(amount > 0,           "amount=0");
        _mint(to, amount);
        // ✅ FIX (medium #2): emituj custom event sa kontekstom
        emit ContributionRewarded(to, amount, block.timestamp);
    }

    // ── Burn (slash) ──────────────────────────────────────────────────────────

    /// @notice On-chain burn tokena za slash mehanizam — samo BURN_ROLE
    /// @dev Poziva se od strane backend oracle-a kad je event označen fake/spam.
    ///      Smanjuje ukupnu supply — deflatorni mehanizam.
    ///      amount je u najmanjim jedinicama (wei-like).
    // ✅ FIX (high #1): dodata burn funkcija za on-chain slash
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

    /// @dev Automatski sinhronizuje role pri transferu vlasništva.
    ///      Koristi Ownable2Step — transfer je dvostepeni (acceptOwnership).
    // ✅ FIX (critical #2): dodata provjera oldOwner != newOwner
    //    Sprečava slučajnu revokaciju rola ako oldOwner == newOwner
    function _transferOwnership(address newOwner) internal override {
        address oldOwner = owner();
        super._transferOwnership(newOwner);

        // Dodijeli role novom owneru
        if (newOwner != address(0)) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
            _grantRole(MINTER_ROLE,        newOwner);
            _grantRole(PAUSER_ROLE,        newOwner);
            _grantRole(BURN_ROLE,          newOwner);
        }

        // ✅ FIX: Revokuj role starom owneru SAMO ako je drugačiji od novog
        // Bez ove provjere: ako oldOwner == newOwner, role se dodijele pa odmah revokuju
        if (oldOwner != address(0) && oldOwner != newOwner) {
            _revokeRole(BURN_ROLE,          oldOwner);
            _revokeRole(PAUSER_ROLE,        oldOwner);
            _revokeRole(MINTER_ROLE,        oldOwner);
            _revokeRole(DEFAULT_ADMIN_ROLE, oldOwner);
        }
    }

    // ── ERC20 hook ────────────────────────────────────────────────────────────

    /// @dev OZ hook: enforce cap. Pause je sada samo na mint/reward/burn,
    ///      NE na svim transferima — korisnici mogu transferovati i kad je pauziran mint.
    // ✅ FIX (critical #1): uklonjen whenNotPaused iz _update
    //    Razlog: whenNotPaused na _update blokira SVE transfere (uključujući
    //    korisničke transfers i burns) kad je contract pauziran.
    //    Pause sada blokira samo mint(), reward() i burn() — ne user transfere.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped)
        // whenNotPaused  ← UKLONJENO
    {
        super._update(from, to, value);
    }
}