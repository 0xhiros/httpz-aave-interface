import React, {
  useState,
  useEffect,
  createContext,
  PropsWithChildren,
  useCallback,
  useMemo,
} from "react";
import { createInstance, FhevmInstance, initFhevm } from "fhevmjs";
import { WRAPPER_ADDRESS } from "@/constants";
import {
  useAccount,
  useChainId,
  useConnectorClient,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import { Asset, EpochInfo, Pool, WalletBalances } from "@/types";
import { BrowserProvider } from "ethers";
import {
  getEpochInfo,
  getFaucetContract,
  getTokenBalances,
  getTokenContract,
  getTokens,
  getWrapperContract,
} from "@/utils";
import { ZeroAddress } from "ethers";
import { Id as ToastId, ToastContainer, toast } from "react-toastify";
import { formatUnits } from "ethers";
import CustomNotification from "@/components/CustomNotification";
import { sepolia } from "wagmi/chains";

interface IMainContext {
  fhEVMInstance?: FhevmInstance;
  balances: WalletBalances;
  epochInfo: EpochInfo;
  decryptEuint256: (value: bigint) => void;
  updateBalances: () => void;
  updateEpochInfo: () => void;
  getFreeToken: (asset: Asset) => void;
  approveToken: (
    pool: Pool,
    isDeposit: boolean,
    amount: bigint
  ) => Promise<boolean>;
  wrap: (isDeposit: boolean, pool: Pool, amount: bigint) => void;
}

export const MainContext = createContext<IMainContext>({
  balances: {},
  epochInfo: {},
  decryptEuint256: () => {},
  updateBalances: () => {},
  updateEpochInfo: () => {},
  getFreeToken: () => {},
  approveToken: async () => {
    return true;
  },
  wrap: () => {},
});

const MainProvider = ({ children }: PropsWithChildren) => {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: connectorClient } = useConnectorClient();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [fhEVMInstance, setFVMInstance] = useState<FhevmInstance>();
  const [balances, setBalances] = useState<WalletBalances>({});
  const [epochInfo, setEpochInfo] = useState<EpochInfo>({});
  const [fvmInitialized, setFvmInitialized] = useState(false);

  useEffect(() => {
    if (chainId !== sepolia.id) {
      switchChain({ chainId: sepolia.id });
    }
  }, [chainId, switchChain]);

  const provider = useMemo(() => {
    if (connectorClient) {
      return new BrowserProvider(connectorClient.transport);
    }
    return undefined;
  }, [connectorClient]);

  const initFhevmInstance = useCallback(async () => {
    try {
      if (!fvmInitialized) {
        const res = await initFhevm();
        if (res) {
          setFvmInitialized(true);
        } else {
          return;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [fvmInitialized]);

  const createFhevmIntance = useCallback(async () => {
    let toastId: ToastId | undefined = undefined;
    try {
      if (fvmInitialized && !fhEVMInstance) {
        toastId = toast(CustomNotification, {
          data: {
            title: "Initializing FVM instance",
            content: `Initializing and creating FVM instance...`,
          },
          isLoading: true,
          closeButton: false,
        });

        const _instance = await createInstance({
          network: window.ethereum,
          gatewayUrl: "https://gateway.sepolia.zama.ai",
          kmsContractAddress: "0x9D6891A6240D6130c54ae243d8005063D05fE14b",
          aclContractAddress: "0xFee8407e2f5e3Ee68ad77cAE98c434e637f516e5",
        });

        setFVMInstance(_instance);

        toast.update(toastId, {
          isLoading: false,
          type: "success",
          autoClose: 5000,
          closeButton: true,
        });
      }
    } catch (err) {
      console.error(err);
      if (toastId) {
        toast.update(toastId, {
          data: {
            title: "Initializing FVM instance",
            content: `Failed to initialize FVM instance...`,
            onClick: () => {
              createFhevmIntance();
              toast.dismiss(toastId);
            },
            allowRetry: true,
          },
          isLoading: false,
          type: "error",
        });
      }
    }
  }, [fvmInitialized, fhEVMInstance]);

  useEffect(() => {
    initFhevmInstance();
  }, [initFhevmInstance]);

  useEffect(() => {
    createFhevmIntance();
  }, [createFhevmIntance]);

  const updateBalances = useCallback(
    async () => {
      try {
        if (provider && address) {
          const tokens = getTokens();
          const res = await getTokenBalances(provider, tokens, address);
          const bal = { ...balances };
          for (let i = 0; i < tokens.length; i += 1) {
            bal[tokens[i].toLowerCase()] = res[i];
          }

          setBalances(bal);
        }
      } catch (err) {
        console.error(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, address]
  );

  const updateEpochInfo = useCallback(
    async () => {
      try {
        if (provider) {
          const res = await getEpochInfo(provider, address ?? ZeroAddress);
          const tokens = getTokens();
          const epoch = { ...epochInfo };
          for (let i = 0; i < tokens.length; i += 1) {
            epoch[tokens[i].toString()] = {
              currentEpoch: Number(res[0][i]),
              lastWrappedTime: Number(res[1][i]),
              hasRequest: res[2][i],
              pendingUserRequest: res[3][i],
            };
          }

          setEpochInfo(epoch);
        }
      } catch (err) {
        console.error(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, address]
  );

  const getFreeToken = useCallback(
    async (asset: Asset) => {
      if (provider) {
        try {
          const signer = await provider.getSigner();
          const contract = getFaucetContract(signer);

          const toastId = toast(CustomNotification, {
            data: {
              title: "Get free token!",
              content: `Requested ${formatUnits(
                asset.faucetAmount,
                asset.decimals
              )}${asset.symbol} from Faucet.`,
            },
            isLoading: true,
          });

          const tx = await contract.mint(
            asset.address,
            address,
            asset.faucetAmount
          );

          toast.update(toastId, {
            data: {
              title: "Get free token!",
              content: `Requested ${formatUnits(
                asset.faucetAmount,
                asset.decimals
              )}${asset.symbol} from Faucet.`,
              tx: tx.hash,
            },
          });

          await tx.wait(1);

          await updateBalances();
          toast.update(toastId, {
            isLoading: false,
            type: "success",
            autoClose: 5000,
          });
        } catch (err) {
          console.error(err);
          toast(CustomNotification, {
            data: {
              title: "Failed to get free token!",
              content: `There was an unexpected error to get free token!`,
            },
            type: "error",
            autoClose: 5000,
          });
        }
      }
    },
    [provider, address, updateBalances]
  );

  const approveToken = useCallback(
    async (
      pool: Pool,
      isDeposit: boolean,
      amount: bigint
    ): Promise<boolean> => {
      if (provider && address) {
        let toastId: ToastId | undefined = undefined;

        try {
          const signer = await provider.getSigner();

          const token = isDeposit ? pool.asset.address : pool.address;

          const contract = getTokenContract(signer, token);

          const allowance = await contract.allowance(address, WRAPPER_ADDRESS);
          if (allowance >= amount) {
            return true;
          }

          toastId = toast(CustomNotification, {
            data: {
              title: "Approve token to wrap",
              content: `Approving ${formatUnits(amount, pool.asset.decimals)}${
                isDeposit ? pool.asset.symbol : pool.symbol
              } to wrap.`,
            },
            isLoading: true,
          });

          const tx = await contract.approve(WRAPPER_ADDRESS, amount);
          toast.update(toastId, {
            data: {
              title: "Approve token to wrap",
              content: `Approving ${formatUnits(amount, pool.asset.decimals)}${
                isDeposit ? pool.asset.symbol : pool.symbol
              } to wrap.`,
              tx: tx.hash,
            },
          });

          await tx.wait(1);

          toast.update(toastId, {
            isLoading: false,
            type: "success",
            autoClose: 5000,
          });

          return true;
        } catch (err) {
          console.error(err);
          if (toastId) {
            toast.update(toastId, {
              data: {
                title: "Failed to approve token!",
                content: `There was an unexpected error to approve token!`,
              },
              type: "error",
              autoClose: 5000,
              isLoading: false,
            });
          } else {
            toast(CustomNotification, {
              data: {
                title: "Failed to approve token!",
                content: `There was an unexpected error to approve token!`,
              },
              type: "error",
              autoClose: 5000,
            });
          }
          return false;
        }
      }

      return false;
    },
    [provider, address]
  );

  const wrap = useCallback(
    async (isDeposit: boolean, pool: Pool, amount: bigint) => {
      let toastId: ToastId | undefined = undefined;
      if (provider) {
        try {
          const signer = await provider.getSigner();
          const contract = getWrapperContract(signer);

          toastId = toast(CustomNotification, {
            data: {
              title: `Sending ${
                isDeposit ? "deposit" : "withdraw"
              } wrap request`,
              content: `Sending wrap request to ${
                isDeposit ? "deposit" : "withdraw"
              } ${formatUnits(amount, pool.asset.decimals)}${
                isDeposit ? pool.asset.symbol : pool.symbol
              }.`,
            },
            isLoading: true,
          });

          const tx = await contract.wrapRequest(
            pool.asset.address,
            amount,
            isDeposit
          );

          toast.update(toastId, {
            data: {
              title: `Sending ${
                isDeposit ? "deposit" : "withdraw"
              } wrap request`,
              content: `Sending wrap request to ${
                isDeposit ? "deposit" : "withdraw"
              } ${formatUnits(amount, pool.asset.decimals)}${
                isDeposit ? pool.asset.symbol : pool.symbol
              }.`,
            },
          });

          await tx.wait(1);

          await Promise.all([updateEpochInfo(), updateBalances()]);

          toast.update(toastId, {
            isLoading: false,
            type: "success",
            autoClose: 5000,
          });
        } catch (err) {
          console.error(err);
          if (toastId) {
            toast.update(toastId, {
              data: {
                title: "Failed to send wrap request!",
                content: `There was an unexpected error to send wrap request!`,
              },
              type: "error",
              autoClose: 5000,
              isLoading: false,
            });
          } else {
            toast(CustomNotification, {
              data: {
                title: "Failed to send wrap request!",
                content: `There was an unexpected error to send wrap request!`,
              },
              type: "error",
              autoClose: 5000,
            });
          }
        }
      }
    },
    [provider, updateEpochInfo, updateBalances]
  );

  useEffect(() => {
    updateBalances();
  }, [updateBalances]);

  useEffect(() => {
    updateEpochInfo();
  }, [updateEpochInfo]);

  const decryptEuint256 = useCallback(
    async (value: bigint): Promise<bigint | undefined> => {
      let toastId: ToastId | undefined = undefined;
      try {
        if (fhEVMInstance && address) {
          toastId = toast(CustomNotification, {
            data: {
              title: "Decrypting encrypted value",
              content: `Decrypting encrypted value to reveal it.`,
            },
            isLoading: true,
          });

          const { publicKey, privateKey } = fhEVMInstance.generateKeypair();

          const eip712 = fhEVMInstance.createEIP712(publicKey, WRAPPER_ADDRESS);

          const signature = await signTypedDataAsync({
            types: { Reencrypt: eip712.types.Reencrypt },
            primaryType: "Reencrypt", //eip712.primaryType,
            message: eip712.message,
            domain: eip712.domain as any,
          });

          const decryptedValue = await fhEVMInstance.reencrypt(
            value,
            privateKey,
            publicKey,
            signature,
            WRAPPER_ADDRESS,
            address
          );

          toast.update(toastId, {
            isLoading: false,
            type: "success",
            autoClose: 5000,
          });
          return decryptedValue;
        } else {
          toast(CustomNotification, {
            data: {
              title: "Decrypting encrypted value",
              content: `FVM Instance is not initialized yet. Try again later.`,
            },
            type: "error",
            autoClose: 5000,
          });
        }
      } catch (err) {
        if (toastId) {
          toast.update(toastId, {
            data: {
              title: "Failed to decrypt",
              content: `There was an unexpected error to decrypt!`,
            },
            type: "error",
            autoClose: 5000,
            isLoading: false,
          });
        } else {
          toast(CustomNotification, {
            data: {
              title: "Failed to decrypt",
              content: `There was an unexpected error to decrypt!`,
            },
            type: "error",
            autoClose: 5000,
          });
        }
      }
    },
    [fhEVMInstance, address, signTypedDataAsync]
  );

  return (
    <MainContext.Provider
      value={{
        fhEVMInstance,
        balances,
        epochInfo,
        decryptEuint256,
        updateBalances,
        updateEpochInfo,
        getFreeToken,
        approveToken,
        wrap,
      }}
    >
      {children}
      <ToastContainer position="bottom-right" autoClose={false} />
    </MainContext.Provider>
  );
};

export default MainProvider;
