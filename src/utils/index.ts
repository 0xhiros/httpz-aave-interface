import {
  FAUCET_ADDRESS,
  MULTICALL_ADDRESS,
  pools,
  WRAPPER_ADDRESS,
} from "@/constants";
import { Asset, Pool, WalletBalances } from "@/types";
import { BrowserProvider, Contract, formatUnits, Interface } from "ethers";
import MulticallAbi from "@/constants/abis/Multicall.json";
import ERC20Abi from "@/constants/abis/FaucetERC20.json";
import WrapperAbi from "@/constants/abis/Wrapper.json";
import FaucetAbi from "@/constants/abis/Faucet.json";
import { ContractRunner } from "ethers";

export const getWalletHumanBalance = (
  balances: WalletBalances,
  token: Asset | Pool
) => {
  const asset: Asset = (token as any).asset ?? token;

  if (balances[token.address.toLowerCase()] !== undefined) {
    return (
      formatUnits(balances[token.address.toLowerCase()]!, asset.decimals) +
      " " +
      token.symbol
    );
  }

  return "--.--";
};

export const getMulticallContract = (provider: BrowserProvider): Contract =>
  new Contract(MULTICALL_ADDRESS, MulticallAbi, provider);

export const getTokenBalances = async (
  provider: BrowserProvider,
  tokens: string[],
  user: string
) => {
  const multicall = getMulticallContract(provider);

  const ERC20Iface = new Interface(ERC20Abi);

  const calls = tokens.map((token) => ({
    target: token,
    allowFailure: false,
    callData: ERC20Iface.encodeFunctionData("balanceOf", [user]),
  }));

  const results = await multicall.aggregate3.staticCall(calls);

  return results.map(
    (res: any) => ERC20Iface.decodeFunctionResult("balanceOf", res[1])[0]
  );
};

export const getTokens = () => {
  const tokens: string[] = [];

  pools.forEach((item) => {
    tokens.push(item.address);
    tokens.push(item.asset.address);
  });

  return tokens;
};

export const getEpochInfo = (provider: BrowserProvider, user: string) => {
  const wrapperContract = new Contract(WRAPPER_ADDRESS, WrapperAbi, provider);

  return wrapperContract.getWrapperInfo(getTokens(), user);
};

export const getFaucetContract = (provider: ContractRunner): Contract =>
  new Contract(FAUCET_ADDRESS, FaucetAbi, provider);

export const getWrapperContract = (provider: ContractRunner): Contract =>
  new Contract(WRAPPER_ADDRESS, WrapperAbi, provider);

export const getTokenContract = (
  provider: ContractRunner,
  token: string
): Contract => new Contract(token, ERC20Abi, provider);
