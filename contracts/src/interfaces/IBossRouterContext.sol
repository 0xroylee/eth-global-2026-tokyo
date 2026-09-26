// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IBossRouterContext {
    function mode() external view returns (uint8);
    function activePlayer() external view returns (address);
    function expectedStage() external view returns (uint8);
    function pendingStage() external view returns (uint8);
    function bossPoolId() external view returns (bytes32);
    function payStarterRoy(address recipient, uint256 amount) external;
}
