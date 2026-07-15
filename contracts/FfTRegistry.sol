// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract FfTRegistry is Ownable2Step {

    // ── State ─────────────────────────────────────────────────────────────────
    address public gcdToken;
    address public quadrantsNft;
    address public staking;
    address public treasury;

    // ── Events ────────────────────────────────────────────────────────────────
    event RegistryUpdated(string indexed key, address indexed value, address indexed by);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address initialOwner, address initialTreasury)
        Ownable(initialOwner)
    {
        require(initialOwner    != address(0), "owner=0");
        require(initialTreasury != address(0), "treasury=0");
        treasury = initialTreasury;
        emit RegistryUpdated("treasury", initialTreasury, initialOwner);
    }

    // ── Setters ───────────────────────────────────────────────────────────────

    /// @notice Postavi treasury adresu (može biti EOA multisig ili contract)
    // ✅ FIX (medium #1): dodata provjera da adrese nisu iste
    // Treasury može biti EOA (wallet/multisig) pa nema code.length provjere
    function setTreasury(address a) external onlyOwner {
        require(a != address(0), "treasury=0");
        // ✅ FIX (low #1): provjera da nova adresa nije ista kao postojeća
        require(a != treasury, "Same address");
        treasury = a;
        emit RegistryUpdated("treasury", a, msg.sender);
    }

    /// @notice Postavi GCD token contract adresu
    function setGcdToken(address a) external onlyOwner {
        require(a != address(0),      "gcd=0");
        require(a.code.length > 0,   "gcd not contract");
        // ✅ FIX (medium #1): provjera da nije ista kao quadrantsNft ili staking
        require(a != quadrantsNft,   "Same as quadrantsNft");
        require(a != staking,        "Same as staking");
        // ✅ FIX (low #1): provjera da nova adresa nije ista kao postojeća
        require(a != gcdToken,       "Same address");
        gcdToken = a;
        emit RegistryUpdated("gcdToken", a, msg.sender);
    }

    /// @notice Postavi GeoQuadrants NFT contract adresu
    function setQuadrantsNft(address a) external onlyOwner {
        require(a != address(0),     "nft=0");
        require(a.code.length > 0,  "nft not contract");
        // ✅ FIX (medium #1): provjera da nije ista kao gcdToken ili staking
        require(a != gcdToken,      "Same as gcdToken");
        require(a != staking,       "Same as staking");
        // ✅ FIX (low #1): provjera da nova adresa nije ista kao postojeća
        require(a != quadrantsNft,  "Same address");
        quadrantsNft = a;
        emit RegistryUpdated("quadrantsNft", a, msg.sender);
    }

    /// @notice Postavi FfTStaking contract adresu
    function setStaking(address a) external onlyOwner {
        require(a != address(0),     "staking=0");
        require(a.code.length > 0,  "staking not contract");
        // ✅ FIX (medium #1): provjera da nije ista kao gcdToken ili quadrantsNft
        require(a != gcdToken,      "Same as gcdToken");
        require(a != quadrantsNft,  "Same as quadrantsNft");
        // ✅ FIX (low #1): provjera da nova adresa nije ista kao postojeća
        require(a != staking,       "Same address");
        staking = a;
        emit RegistryUpdated("staking", a, msg.sender);
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    /// @notice Vrati sve adrese u jednom pozivu — smanjuje broj RPC poziva
    /// @dev web3Config.js može koristiti ovaj getter umjesto 4 zasebna poziva:
    ///      const [gcd, nft, stk, trs] = await registry.getAllAddresses();
    // ✅ FIX (medium #2): getAllAddresses() za efikasniji frontend pristup
    function getAllAddresses()
        external view
        returns (
            address _gcdToken,
            address _quadrantsNft,
            address _staking,
            address _treasury
        )
    {
        return (gcdToken, quadrantsNft, staking, treasury);
    }

    /// @notice Provjeri da li su sve adrese postavljene
    /// @dev Korisno za health check pri deployu
    function isFullyConfigured() external view returns (bool) {
        return (
            gcdToken     != address(0) &&
            quadrantsNft != address(0) &&
            staking      != address(0) &&
            treasury     != address(0)
        );
    }
}