pragma solidity ^0.5.0;

import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import { ERC712 } from './ERC712.sol';


contract EtherPhoneBooth is Ownable, ERC712 {
    using SafeMath for uint256;

    bytes32 private constant ETHERPHONEBOOTH_DOMAIN_SALT = 0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406;
    bytes32 private constant GRANT_DOMAIN_NAME_HASH = keccak256("EtherPhoneBooth.Grant");
    bytes32 private constant GRANT_VERSION_HASH = keccak256("v1");
    bytes32 private GRANT_DOMAIN_SEPARATOR;
    bytes32 private constant GRANT_TYPEHASH = keccak256("Grant(address customer,uint64 txCounter,uint256 creditBalance,uint256 approvedAmount)");

    mapping(address => uint256) private credits;
    mapping(address => uint32) private txCounters;

    constructor(uint256 chainId) public {
        GRANT_DOMAIN_SEPARATOR = buildDomainSeparator(
            GRANT_DOMAIN_NAME_HASH,
            GRANT_VERSION_HASH,
            chainId,
            address(this),
            ETHERPHONEBOOTH_DOMAIN_SALT);
    }

    function getCreditBalance(address who) public view returns (uint256) {
        return credits[who];
    }

    function depositCredit() payable public {
        credits[msg.sender] += msg.value;
    }

    function getCurrentTxCounter() public view returns (uint64) {
        return txCounters[msg.sender];
    }

    function validateGrantSignature(
        address customer,
        uint64 txCounter,
        uint256 creditBalance,
        uint256 approvedAmount,
        uint8 v, bytes32 r, bytes32 s) public view returns (bool isValid) {
        bytes32 grantHash = keccak256(abi.encode(
            GRANT_TYPEHASH,
            customer,
            txCounter,
            creditBalance,
            approvedAmount));
        return validateMessageSignature(GRANT_DOMAIN_SEPARATOR, grantHash, v, r, s, customer);
    }

    function validateChargeRequest(
        uint256 requestedAmount,
        address customer,
        uint64 txCounter,
        uint256 creditBalance,
        uint256 approvedAmount) public view returns (bool isValid)  {
        return
            txCounters[customer] == txCounter && // txCounter mismatch
            credits[customer] == creditBalance && // creditBalance mismatch
            requestedAmount <= approvedAmount && // Cannot request more
            credits[customer] >= requestedAmount; // Not enough credits
    }

    function charge(
        uint256 requestedAmount,
        address customer,
        uint64 txCounter,
        uint256 creditBalance,
        uint256 approvedAmount,
        uint8 v, bytes32 r, bytes32 s) public onlyOwner {
        require(validateGrantSignature(customer, txCounter, creditBalance, approvedAmount, v, r, s), "invalid grant signature");
        require(validateChargeRequest(requestedAmount, customer, txCounter, creditBalance, approvedAmount), "invalid charge request");

        credits[customer] -= requestedAmount;
        ++txCounters[customer];

        msg.sender.transfer(requestedAmount);

        emit CustomerCharged(customer, requestedAmount, txCounter, creditBalance, approvedAmount);
    }

    /**
     * NOTE:
     * - If single charge fail, the transaction should not fail as a whole
     * - CustomerCharged should be relied on for knowing which charges are successful
     */
    function batchCharge(
        uint256[] memory requestedAmount,
        address[] memory customer,
        uint64[] memory txCounter,
        uint256[] memory creditBalance,
        uint256[] memory approvedAmount,
        uint8[] memory v, bytes32[] memory r, bytes32[] memory s) public onlyOwner returns (bool someFailed) {
        require(requestedAmount.length == customer.length);
        require(txCounter.length == customer.length);
        require(creditBalance.length == customer.length);
        require(approvedAmount.length == customer.length);
        require(v.length == customer.length);
        require(r.length == customer.length);
        require(s.length == customer.length);
        for (uint i = 0; i < customer.length; ++i) {
            (bool success,) = address(this).delegatecall(
                abi.encodeWithSignature(
                    "charge(uint256,address,uint64,uint256,uint256,uint8,bytes32,bytes32)",
                    requestedAmount[i],
                    customer[i],
                    txCounter[i],
                    creditBalance[i],
                    approvedAmount[i],
                    v[i], r[i], s[i]));
            someFailed = someFailed || !success;
        }
    }

    event CustomerCharged(address customer, uint256 requestedAmount, uint256 txCounter, uint256 creditBalance, uint256 approvedAmount);
}
