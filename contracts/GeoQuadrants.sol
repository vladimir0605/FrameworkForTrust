// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract GeoQuadrants is ERC721URIStorage, AccessControl, Ownable2Step {

    // ── Roles ─────────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ── Special tokens (polovi) ───────────────────────────────────────────────
    uint8  public constant SPECIAL_RESOLUTION = 255;
    uint64 public constant NORTH_POLE_ID      = 1;
    uint64 public constant SOUTH_POLE_ID      = 2;

    // ── Data structures ───────────────────────────────────────────────────────
    struct Quadrant {
        int32  lat;
        int32  lon;
        uint8  resolution;
        uint64 cellId;        // H3 index (uint64) ili grid cell id
        string metadataHash;  // IPFS CID
    }

    mapping(uint256 => Quadrant) public quadrants;

    // ✅ FIX (medium #1): editors mapping promijenjen iz public u internal
    // Dodana isEditor() getter funkcija za kontrolisani pristup
    mapping(uint256 => mapping(address => bool)) internal editors;

    // ── Events ────────────────────────────────────────────────────────────────
    // ✅ FIX (medium #2): dodan lat/lon u QuadrantMinted event za bolji audit trail
    event QuadrantMinted(
        uint256 indexed tokenId,
        uint8   res,
        uint64  cellId,
        address indexed to,
        int32   lat,    // ✅ novo
        int32   lon     // ✅ novo
    );
    event MetadataUpdated(uint256 indexed tokenId, string newHash, address indexed by);
    event EditorSet(uint256 indexed tokenId, address indexed editor, bool allowed, address indexed by);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address initialOwner)
        ERC721("GeoQuadrants", "GQ")
        Ownable(initialOwner)
    {
        require(initialOwner != address(0), "owner=0");
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE,        initialOwner);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// @notice Deterministički tokenId iz (resolution, cellId)
    /// @dev tokenId = (uint256(resolution) << 64) | uint256(cellId)
    ///      Frontend mora koristiti identičan izračun:
    ///      const tokenId = (BigInt(resolution) << 64n) | BigInt(cellId)
    function computeTokenId(uint8 resolution, uint64 cellId)
        public pure returns (uint256)
    {
        return (uint256(resolution) << 64) | uint256(cellId);
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    // ✅ FIX (medium #1): kontrolisani getter umjesto public mapping
    function isEditor(uint256 tokenId, address editor)
        external view returns (bool)
    {
        return editors[tokenId][editor];
    }

    // ── Mint ─────────────────────────────────────────────────────────────────

    /// @notice Mint jednog kvadranta — samo MINTER_ROLE
    function mintQuadrant(
        address to,
        int32   lat,
        int32   lon,
        uint8   resolution,
        uint64  cellId,
        string calldata metadataHash
    ) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "to=0");

        // ✅ FIX (medium #3): validacija metadataHash nije prazan
        require(bytes(metadataHash).length > 0, "Empty hash");

        uint256 tokenId = computeTokenId(resolution, cellId);
        require(!exists(tokenId), "Already minted");

        _mint(to, tokenId);
        _setTokenURI(tokenId, metadataHash);
        quadrants[tokenId] = Quadrant(lat, lon, resolution, cellId, metadataHash);

        // ✅ FIX (medium #2): dodan lat/lon u event
        emit QuadrantMinted(tokenId, resolution, cellId, to, lat, lon);
    }

    // ✅ FIX (high #2): dodan batchMint za efikasno mintovanje svih kvadranata
    /// @notice Batch mint više kvadranata u jednoj transakciji
    /// @dev Znatno jeftinije od 326 zasebnih transakcija.
    ///      Svi nizovi moraju biti iste dužine.
    function batchMintQuadrants(
        address          to,
        int32[]  calldata lats,
        int32[]  calldata lons,
        uint8[]  calldata resolutions,
        uint64[] calldata cellIds,
        string[] calldata metadataHashes
    ) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "to=0");
        require(
            lats.length == lons.length         &&
            lons.length == resolutions.length  &&
            resolutions.length == cellIds.length &&
            cellIds.length == metadataHashes.length,
            "Length mismatch"
        );

        for (uint256 i = 0; i < lats.length; i++) {
            require(bytes(metadataHashes[i]).length > 0, "Empty hash");

            uint256 tokenId = computeTokenId(resolutions[i], cellIds[i]);

            // Preskoči ako već mintovan (idempotentno)
            if (exists(tokenId)) continue;

            _mint(to, tokenId);
            _setTokenURI(tokenId, metadataHashes[i]);
            quadrants[tokenId] = Quadrant(
                lats[i], lons[i],
                resolutions[i], cellIds[i],
                metadataHashes[i]
            );

            
            uint8 res = resolutions[i];
            int32 lat = lats[i];
            int32 lon = lons[i];
            emit QuadrantMinted(tokenId, res, cellIds[i], to, lat, lon);
        }
    }

    // ✅ FIX (critical #1): ispravljen lat za sjeverni pol — 90, ne 80
    function mintNorthPole(address to, string calldata metadataHash)
        external onlyRole(MINTER_ROLE)
    {
        require(bytes(metadataHash).length > 0, "Empty hash");
        uint256 tokenId = computeTokenId(SPECIAL_RESOLUTION, NORTH_POLE_ID);
        require(!exists(tokenId), "Already minted");
        _mint(to, tokenId);
        _setTokenURI(tokenId, metadataHash);
        // ✅ lat=90 (ispravljeno sa 80)
        quadrants[tokenId] = Quadrant(90, 0, SPECIAL_RESOLUTION, NORTH_POLE_ID, metadataHash);
        emit QuadrantMinted(tokenId, SPECIAL_RESOLUTION, NORTH_POLE_ID, to, 90, 0);
    }

    // ✅ FIX (critical #1): ispravljen lat za južni pol — -90, ne -80
    function mintSouthPole(address to, string calldata metadataHash)
        external onlyRole(MINTER_ROLE)
    {
        require(bytes(metadataHash).length > 0, "Empty hash");
        uint256 tokenId = computeTokenId(SPECIAL_RESOLUTION, SOUTH_POLE_ID);
        require(!exists(tokenId), "Already minted");
        _mint(to, tokenId);
        _setTokenURI(tokenId, metadataHash);
        // ✅ lat=-90 (ispravljeno sa -80)
        quadrants[tokenId] = Quadrant(-90, 0, SPECIAL_RESOLUTION, SOUTH_POLE_ID, metadataHash);
        emit QuadrantMinted(tokenId, SPECIAL_RESOLUTION, SOUTH_POLE_ID, to, -90, 0);
    }

    // ── Metadata update ───────────────────────────────────────────────────────

    /// @notice Ažuriraj IPFS hash metadataka za kvadrant
    /// @dev Dozvoljeno vlasniku NFT-a, aprovovanim operatorima i editorima
    function updateMetadata(uint256 tokenId, string calldata newHash) external {
        require(exists(tokenId), "Not exists");
        // ✅ FIX (medium #3): provjera da novi hash nije prazan
        require(bytes(newHash).length > 0, "Empty hash");

        address nftOwner  = ownerOf(tokenId);
        bool    isApproved =
            (getApproved(tokenId) == msg.sender) ||
            isApprovedForAll(nftOwner, msg.sender);

        require(
            msg.sender == nftOwner ||
            isApproved             ||
            editors[tokenId][msg.sender],
            "No rights"
        );

        _setTokenURI(tokenId, newHash);
        quadrants[tokenId].metadataHash = newHash;
        emit MetadataUpdated(tokenId, newHash, msg.sender);
    }

    // ── Editor management ─────────────────────────────────────────────────────

    function setEditor(uint256 tokenId, address editor, bool allowed) external {
        require(exists(tokenId),      "Not exists");
        require(editor != address(0), "editor=0");

        address nftOwner  = ownerOf(tokenId);
        bool    isApproved =
            (getApproved(tokenId) == msg.sender) ||
            isApprovedForAll(nftOwner, msg.sender);

        require(msg.sender == nftOwner || isApproved, "Not owner/approved");

        editors[tokenId][editor] = allowed;
        emit EditorSet(tokenId, editor, allowed, msg.sender);
    }

    // ── Ownership & Role sync ─────────────────────────────────────────────────

    // ✅ FIX (high #1): dodata provjera oldOwner != newOwner
    //    Sprečava slučajnu revokaciju rola ako je oldOwner == newOwner
    function _transferOwnership(address newOwner) internal override {
        address oldOwner = owner();
        super._transferOwnership(newOwner);

        if (newOwner != address(0)) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
            _grantRole(MINTER_ROLE,        newOwner);
        }

        // ✅ FIX: revokuj SAMO ako je oldOwner različit od newOwner
        if (oldOwner != address(0) && oldOwner != newOwner) {
            _revokeRole(MINTER_ROLE,        oldOwner);
            _revokeRole(DEFAULT_ADMIN_ROLE, oldOwner);
        }
    }

    // ── Interface support ─────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}