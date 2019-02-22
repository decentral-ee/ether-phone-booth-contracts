pragma solidity ^0.5.0;

import { Ownable } from 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import { SafeMath } from 'openzeppelin-solidity/contracts/math/SafeMath.sol';
//import { EIP712 } from 'eip712-helpers/contracts/EIP712.sol';

contract EtherPhoneBooth is Ownable {
    using SafeMath for uint256;

    bytes32 private constant ETHERPHONEBOOTH_DOMAIN_SALT = 0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406;

    constructor(uint256 /*chainId*/) public {
    }

    function depositEther(uint64 orderId) payable external {
        require(msg.value > 0, "Minimal deposit is 0");
        emit EtherDepositReceived(orderId, msg.value);
    }

    function withdrawEther(uint256 amount) onlyOwner external {
        address payable owner = address(uint160(owner()));
        owner.transfer(amount);
        emit EtherDepositWithdrawn(owner, amount);
    }

    event EtherDepositReceived(uint64 indexed orderId, uint256 amount);
    event EtherDepositWithdrawn(address owner, uint256 amount);
}
