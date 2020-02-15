pragma solidity ^0.5.0;

import { Ownable } from 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { UniswapExchangeInterface } from '../uniswap/contracts/UniswapExchangeInterface.sol';
import { UniswapFactoryInterface } from '../uniswap/contracts/UniswapFactoryInterface.sol';
import { IRToken } from '@rtoken/contracts/contracts/IRToken.sol';

contract PaymentProcessor is Ownable {
    uint256 constant UINT256_MAX = ~uint256(0);

    address public fundManager;
    address public depositAgent;
    UniswapFactoryInterface public uniswapFactory;
    address public intermediaryToken;
    UniswapExchangeInterface public intermediaryTokenExchange;

    bool public isIntermediaryRToken;

    constructor(UniswapFactoryInterface uniswapFactory_)
        public {
        uniswapFactory = uniswapFactory_;
    }

    function setFundManager(address fundManager_)
        onlyOwner
        public {
        fundManager = fundManager_;
    }

    function setDepositAgent(address depositAgent_)
        onlyOwner
        public {
        depositAgent = depositAgent_;
    }

    function isFundManager()
        public view
        returns (bool) {
        return isOwner() || msg.sender == fundManager;
    }

    function isDepositAgent()
        public view
        returns (bool) {
        return isOwner() || msg.sender == depositAgent;
    }

    function setIntermediaryToken(address token)
        onlyOwner
        external {
        isIntermediaryRToken = false;
        intermediaryToken = token;
        if (token != address(0)) {
            intermediaryTokenExchange = UniswapExchangeInterface(uniswapFactory.getExchange(token));
            require(address(intermediaryTokenExchange) != address(0), "The token does not have an exchange");
        } else {
            intermediaryTokenExchange = UniswapExchangeInterface(address(0));
        }
    }

    /**
     * Since there isn't a efficient way to check if
     * the token really is an RToken, we assume that it is
     * It is in the best interests of the owner to supply
     * a correct RToken address, otherwise they cannot collect payments
     */
    function setIntermediaryRToken(address token)
        onlyOwner
        external {
        isIntermediaryRToken = true;
        intermediaryToken = token;
        if (token != address(0)) {
            IRToken rToken = IRToken(token);
            address underlying = address(rToken.token());
            require (underlying != address(0), "No underlying token for rToken");
            //this will infact represent the underlying token's exchange, since the RToken itself does not need one
            intermediaryTokenExchange = UniswapExchangeInterface(uniswapFactory.getExchange(underlying));
            require(address(intermediaryTokenExchange) != address(0), "The underlying token does not have an exchange");
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
            if (isIntermediaryRToken) {
                IRToken rToken = IRToken(intermediaryToken);
                IERC20 underlying = IERC20(rToken.token());
                require (address(underlying) != address(0), "No underlying token for rToken");
                underlying.approve(address(rToken), amountBought);
                rToken.mint(amountBought);
            }
        }
        emit EtherDepositReceived(orderId, msg.sender, msg.value, intermediaryToken, amountBought);
    }

    function depositToken(uint64 orderId, address depositor, IERC20 inputToken, uint256 amount)
        hasExchange(address(inputToken))
        onlyDepositAgent
        external {
        require(address(inputToken) != address(0), "Input token cannont be ZERO_ADDRESS");
        UniswapExchangeInterface tokenExchange = UniswapExchangeInterface(uniswapFactory.getExchange(address(inputToken)));
        require(inputToken.allowance(depositor, address(this)) >= amount, "Not enough allowance");
        inputToken.transferFrom(depositor, address(this), amount);
        uint256 amountBought = 0;
        if (intermediaryToken != address(0)) {
            if (intermediaryToken != address(inputToken)) {

                if (isIntermediaryRToken) {
                    IRToken rToken = IRToken(intermediaryToken);
                    IERC20 underlying = IERC20(rToken.token());
                    require (address(underlying) != address(0), "No underlying token for rToken");
                    if (underlying != inputToken) {
                        inputToken.approve(address(tokenExchange), amount);
                        amountBought = tokenExchange.tokenToTokenSwapInput(amount, 1, 1, UINT256_MAX, address(underlying));
                        underlying.approve(address(rToken), amountBought);
                        rToken.mint(amountBought);

                    } else {
                        inputToken.approve(address(rToken), amount);
                        rToken.mint(amount);
                        amountBought = amount;
                    }
                } else {
                    inputToken.approve(address(tokenExchange), amount);
                    amountBought = tokenExchange.tokenToTokenSwapInput(
                        amount /* (input) tokens_sold */,
                        1 /* (output) min_tokens_bought */,
                        1 /*  min_eth_bought */,
                        UINT256_MAX /* deadline */,
                        intermediaryToken /* (input) token_addr */);
                }
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

    function withdrawEther(uint256 amount, address payable to)
        onlyFundManager
        external {
        to.transfer(amount);
        emit EtherDepositWithdrawn(to, amount);
    }

    function withdrawToken(IERC20 token, uint256 amount, address to)
        onlyFundManager
        external {
        if (isIntermediaryRToken) {
            IRToken rToken = IRToken(intermediaryToken);
            require(token == rToken.token(), "Supplied token is not underlying token");
            require(rToken.redeemAndTransfer(to, amount), "Redeeming rTokens failed");
        } else {
            require(token.transfer(to, amount), "Withdraw token failed");
        }
        emit TokenDepositWithdrawn(address(token), to, amount);
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

    modifier onlyDepositAgent() {
        require(isDepositAgent(), "Only deposit agent allowed");
        _;
    }

    function() external payable { }
}

// for testing
import { ERC20Mintable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import { ComptrollerMock } from "@rtoken/contracts/contracts/test/ComptrollerMock.sol";
import { InterestRateModelMock } from "@rtoken/contracts/contracts/test/InterestRateModelMock.sol";
import { CErc20 } from "@rtoken/contracts/compound/contracts/CErc20.sol";
import { CompoundAllocationStrategy } from "@rtoken/contracts/contracts/CompoundAllocationStrategy.sol";
import { RToken } from "@rtoken/contracts/contracts/RToken.sol";
import { Proxy } from "@rtoken/contracts/contracts/Proxy.sol";