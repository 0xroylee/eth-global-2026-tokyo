// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Optional victory collectibles. Only the configured game hook can mint.
contract BossCollectibles is ERC721 {
    address public immutable owner;
    address public minter;
    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => bool) public isVictoryToken;

    error Unauthorized();
    error MinterAlreadySet();

    constructor(address initialOwner) ERC721("Boss Pool Collectibles", "BPC") {
        require(initialOwner != address(0), "zero owner");
        owner = initialOwner;
    }

    function setMinter(address gameHook) external {
        if (msg.sender != owner) revert Unauthorized();
        if (minter != address(0)) revert MinterAlreadySet();
        require(gameHook != address(0), "zero minter");
        minter = gameHook;
    }

    function mintVictory(address recipient) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert Unauthorized();
        require(recipient != address(0), "zero recipient");
        tokenId = nextTokenId++;
        isVictoryToken[tokenId] = true;
        _safeMint(recipient, tokenId);
    }
}
