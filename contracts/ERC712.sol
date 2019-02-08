pragma solidity ^0.5.0;


contract ERC712 {
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");

    function buildDomainSeparator(
        bytes32 messageDomainNameHash,
        bytes32 messageVersionHash,
        uint256 chainId,
        address contractAddress,
        bytes32 domainSalt
        ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            messageDomainNameHash,
            messageVersionHash,
            chainId,
            contractAddress,
            domainSalt));
    }

    function validateMessageSignature(
        bytes32 domainSeparator,
        bytes32 messageHash,
        uint8 v, bytes32 r, bytes32 s, address signedByWhom) internal pure returns (bool) {
        bytes32 fullhash = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            messageHash));
        return ecrecover(fullhash, v, r, s) == signedByWhom;
    }
}
