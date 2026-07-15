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

    /// @notice Set the treasury address (can be an EOA, multisig, or contract)
    // ✅ FIX (medium #1): added check that addresses are not the same
    // Treasury can be an EOA (wallet/multisig) so no code.length check is applied
    function setTreasury(address a) external onlyOwner {
        require(a != address(0), "treasury=0");
        // ✅ FIX (low #1): check that new address differs from the current one
        require(a != treasury, "Same address");
        treasury = a;
        emit RegistryUpdated("treasury", a, msg.sender);
    }

    /// @notice Set the GCD token contract address
    function setGcdToken(address a) external onlyOwner {
        require(a != address(0),      "gcd=0");
        require(a.code.length > 0,   "gcd not contract");
        // ✅ FIX (medium #1): check that it does not collide with quadrantsNft or staking
        require(a != quadrantsNft,   "Same as quadrantsNft");
        require(a != staking,        "Same as staking");
        // ✅ FIX (low #1): check that new address differs from the current one
        require(a != gcdToken,       "Same address");
        gcdToken = a;
        emit RegistryUpdated("gcdToken", a, msg.sender);
    }

    /// @notice Set the GeoQuadrants NFT contract address
    function setQuadrantsNft(address a) external onlyOwner {
        require(a != address(0),     "nft=0");
        require(a.code.length > 0,  "nft not contract");
        // ✅ FIX (medium #1): check that it does not collide with gcdToken or staking
        require(a != gcdToken,      "Same as gcdToken");
        require(a != staking,       "Same as staking");
        // ✅ FIX (low #1): check that new address differs from the current one
        require(a != quadrantsNft,  "Same address");
        quadrantsNft = a;
        emit RegistryUpdated("quadrantsNft", a, msg.sender);
    }

    /// @notice Set the FfTStaking contract address
    function setStaking(address a) external onlyOwner {
        require(a != address(0),     "staking=0");
        require(a.code.length > 0,  "staking not contract");
        // ✅ FIX (medium #1): check that it does not collide with gcdToken or quadrantsNft
        require(a != gcdToken,      "Same as gcdToken");
        require(a != quadrantsNft,  "Same as quadrantsNft");
        // ✅ FIX (low #1): check that new address differs from the current one
        require(a != staking,       "Same address");
        staking = a;
        emit RegistryUpdated("staking", a, msg.sender);
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    /// @notice Return all addresses in a single call — reduces RPC call count
    /// @dev web3Config.js can use this getter instead of 4 separate calls:
    ///      const [gcd, nft, stk, trs] = await registry.getAllAddresses();
    // ✅ FIX (medium #2): getAllAddresses() for more efficient frontend access
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

    /// @notice Check whether all addresses have been configured
    /// @dev Useful for health check on deploy
    function isFullyConfigured() external view returns (bool) {
        return (
            gcdToken     != address(0) &&
            quadrantsNft != address(0) &&
            staking      != address(0) &&
            treasury     != address(0)
        );
    }
}
