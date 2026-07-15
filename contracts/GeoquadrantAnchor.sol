// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract GeoquadrantAnchor {

    struct CIDEntry {
        string  ipfsCid;
        uint256 blockNumber;
        uint256 timestamp;
        address author;
        string  eventType; // "pin_json" | "mint" | "review" | "oracle_confirm"
    }

    mapping(uint256 => CIDEntry[]) public cidHistory;

    event CIDAnchored(
        uint256 indexed tokenId,
        string  ipfsCid,
        uint256 blockNumber,
        uint256 timestamp,
        address indexed author,
        string  eventType
    );

    function anchorCID(
        uint256 tokenId,
        string calldata ipfsCid,
        string calldata eventType
    ) external {
        cidHistory[tokenId].push(CIDEntry({
            ipfsCid:     ipfsCid,
            blockNumber: block.number,
            timestamp:   block.timestamp,
            author:      msg.sender,
            eventType:   eventType
        }));

        emit CIDAnchored(
            tokenId, ipfsCid,
            block.number, block.timestamp,
            msg.sender, eventType
        );
    }

    function getCIDHistory(uint256 tokenId)
        external view
        returns (CIDEntry[] memory)
    {
        return cidHistory[tokenId];
    }

    function getLatestCID(uint256 tokenId)
        external view
        returns (CIDEntry memory)
    {
        uint256 len = cidHistory[tokenId].length;
        require(len > 0, "No history for this token");
        return cidHistory[tokenId][len - 1];
    }
}