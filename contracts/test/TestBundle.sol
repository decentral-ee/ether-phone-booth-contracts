pragma solidity ^0.5.0;

import { ERC20Mintable } from "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";
import { ComptrollerMock } from "@rtoken/contracts/contracts/test/ComptrollerMock.sol";
import { InterestRateModelMock } from "@rtoken/contracts/contracts/test/InterestRateModelMock.sol";
import { CErc20 } from "@rtoken/contracts/compound/contracts/CErc20.sol";
import { CompoundAllocationStrategy } from "@rtoken/contracts/contracts/CompoundAllocationStrategy.sol";
import { RToken } from "@rtoken/contracts/contracts/RToken.sol";
import { Proxy } from "@rtoken/contracts/contracts/Proxy.sol";
