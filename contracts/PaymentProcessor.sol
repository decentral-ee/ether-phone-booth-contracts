pragma solidity ^0.5.0;

import { Ownable } from 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import { IERC20 } from 'openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';
import { UniswapExchangeInterface } from './uniswap/UniswapExchangeInterface.sol';
import { UniswapFactoryInterface } from './uniswap/UniswapFactoryInterface.sol';

contract PaymentProcessor is Ownable {
    uint256 constant UINT256_MAX = ~uint256(0);

    address public fundManager;
    UniswapFactoryInterface public uniswapFactory;
    address public intermediaryToken;
    UniswapExchangeInterface public intermediaryTokenExchange;

    constructor(UniswapFactoryInterface uniswapFactory_)
        public {
        uniswapFactory = uniswapFactory_;
    }

    function setFundManager(address fundManager_)
        onlyOwner
        public {
        fundManager = fundManager_;
    }

    function isFundManager()
        public view
        returns (bool) {
        return isOwner() || msg.sender == fundManager;
    }

    function setIntermediaryToken(address token)
        onlyOwner
        external {
        intermediaryToken = token;
        if (token != address(0)) {
            intermediaryTokenExchange = UniswapExchangeInterface(uniswapFactory.getExchange(token));
            require(address(intermediaryTokenExchange) != address(0), "The token does not have an exchange");
        } else {
            intermediaryTokenExchange = UniswapExchangeInterface(address(0));
        }
    }

    function depositEther(uint64 orderId)
        payable
        external {
        require(msg.value > 0, "Minimal deposit is 0");
        uint256 amountBought = 0;
        if (intermediaryToken != address(0)) {
            amountBought = intermediaryTokenExchange.ethToTokenSwapInput.value(msg.value)(
                1 /* min_tokens */,
                UINT256_MAX /* deadline */);
        }
        emit EtherDepositReceived(orderId, msg.sender, msg.value, intermediaryToken, amountBought);
    }

    function withdrawEther(uint256 amount, address payable to)
        onlyFundManager
        external {
        to.transfer(amount);
        emit EtherDepositWithdrawn(to, amount);
    }

    function withdrawToken(IERC20 token, uint256 amount, address to)
        onlyFundManager
        external {
        require(token.transfer(to, amount), "Withdraw token failed");
        emit TokenDepositWithdrawn(address(token), to, amount);
    }

    function depositToken(uint64 orderId, address depositor, IERC20 inputToken, uint256 amount)
        hasExchange(address(inputToken))
        onlyFundManager
        external {
        require(address(inputToken) != address(0), "Input token cannont be ZERO_ADDRESS");
        UniswapExchangeInterface tokenExchange = UniswapExchangeInterface(uniswapFactory.getExchange(address(inputToken)));
        require(inputToken.allowance(depositor, address(this)) >= amount, "Not enough allowance");
        inputToken.transferFrom(depositor, address(this), amount);
        uint256 amountBought = 0;
        if (intermediaryToken != address(0)) {
            if (intermediaryToken != address(inputToken)) {
                inputToken.approve(address(tokenExchange), amount);
                amountBought = tokenExchange.tokenToTokenSwapInput(
                    amount /* (input) tokens_sold */,
                    1 /* (output) min_tokens_bought */,
                    1 /*  min_eth_bought */,
                    UINT256_MAX /* deadline */,
                    intermediaryToken /* (input) token_addr */);
            } else {
                // same token
                amountBought = amount;
            }
        } else {
            inputToken.approve(address(tokenExchange), amount);
            amountBought = tokenExchange.tokenToEthSwapInput(
                amount /* tokens_sold */,
                1 /* min_eth */,
                UINT256_MAX /* deadline */);
        }
        emit TokenDepositReceived(orderId, depositor, address(inputToken), amount, intermediaryToken, amountBought);
    }

    event EtherDepositReceived(uint64 indexed orderId, address depositor, uint256 amount, address intermediaryToken, uint256 amountBought);
    event EtherDepositWithdrawn(address to, uint256 amount);
    event TokenDepositReceived(uint64 indexed orderId, address depositor, address indexed inputToken, uint256 amount, address intermediaryToken, uint256 amountBought);
    event TokenDepositWithdrawn(address indexed token, address to, uint256 amount);

    modifier hasExchange(address token) {
        address tokenExchange = uniswapFactory.getExchange(token);
        require(tokenExchange != address(0), "Token doesn't have an exchange");
        _;
    }

    modifier onlyFundManager() {
        require(isFundManager(), "Only fund manager allowed");
        _;
    }

    function() external payable { }
}

// for testing
import { ERC20Mintable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
