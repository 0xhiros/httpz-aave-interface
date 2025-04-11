import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Card, Modal } from "@mui/material";
import { Pool } from "@/types";
import { useMainContext } from "@/hooks";
import { getWalletHumanBalance } from "@/utils";
import { useAccount, useWriteContract } from "wagmi";
import PoolAbi from "@/constants/abis/Pool.json";
import WrapperAbi from "@/constants/abis/Wrapper.json";
import ERC20Abi from "@/constants/abis/FaucetERC20.json";
import { POOL_ADDRESS, WRAPPER_ADDRESS } from "@/constants";
import { formatUnits, parseUnits } from "ethers";

type Props = {
  open: boolean;
  isDeposit: boolean;
  isWrap: boolean;
  changeIsWrap: (isWrap: boolean) => void;
  handleClose?: () => void;
  pool: Pool;
};

export const ActionModal = ({
  open,
  isDeposit,
  isWrap,
  pool,
  changeIsWrap,
  handleClose,
}: Props) => {
  const { isConnected, address } = useAccount();
  const { balances, epochInfo, approveToken, wrap, decryptEuint256 } =
    useMainContext();

  const [pendingAmount, setPendingAmount] = useState<string>();
  const encryptedPendingAmount = useMemo(() => {
    const token = isDeposit ? pool.asset.address : pool.address;

    return epochInfo[token.toLowerCase()]
      ? epochInfo[token.toLowerCase()].pendingUserRequest
      : undefined;
  }, [epochInfo, isDeposit, pool]);

  const revealPendingAmount = useCallback(async () => {
    if (encryptedPendingAmount === undefined || encryptedPendingAmount === 0n) {
      return;
    }
    const _amount = await decryptEuint256(encryptedPendingAmount);

    if (_amount !== undefined) {
      setPendingAmount(formatUnits(_amount, pool.asset.decimals));
    }
  }, [encryptedPendingAmount, pool, decryptEuint256]);

  useEffect(() => {
    setPendingAmount(undefined);
  }, [encryptedPendingAmount]);

  const getPendingAmountElement = useCallback(() => {
    if (encryptedPendingAmount === undefined) {
      return <span></span>;
    } else if (encryptedPendingAmount === 0n) {
      return <span>No pending amount</span>;
    } else {
      if (pendingAmount === undefined) {
        return (
          <span className="mb-2">
            Your pending amount has been encrypted.{" "}
            <button
              className="underline cursor-pointer"
              onClick={revealPendingAmount}
            >
              Reveal it?
            </button>
          </span>
        );
      } else {
        return (
          <span className="mb-2">
            Your pending amount: {pendingAmount}
            {isDeposit ? pool.asset.symbol : pool.symbol}
          </span>
        );
      }
    }
  }, [
    encryptedPendingAmount,
    pendingAmount,
    pool,
    isDeposit,
    revealPendingAmount,
  ]);

  const [amount, setAmount] = useState("");
  const { writeContractAsync } = useWriteContract();

  const withdraw = () => {
    if (isConnected && address) {
      writeContractAsync({
        abi: PoolAbi,
        address: POOL_ADDRESS,
        functionName: "withdraw",
        args: [
          pool.asset.address,
          parseUnits(amount, pool.asset.decimals),
          address,
        ],
      });
    }
  };

  const sendWrapRequest = useCallback(async () => {
    const parsedAmount = parseUnits(amount, pool.asset.decimals);
    const res = await approveToken(pool, isDeposit, parsedAmount);
    if (res) {
      await wrap(isDeposit, pool, parsedAmount);
    }
  }, [approveToken, wrap, pool, isDeposit, amount]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      className="flex items-center justify-center"
    >
      <Card className="bg-white flex flex-col w-120">
        <div className="flex w-full border-b">
          <Button
            className="flex-1 !rounded-none"
            variant={isWrap ? "contained" : "text"}
            onClick={() => changeIsWrap(true)}
          >
            {isDeposit ? "Deposit wrap request" : "Withdraw wrap request"}
          </Button>
          <Button
            className="flex-1 !rounded-none"
            variant={!isWrap ? "contained" : "text"}
            onClick={() => changeIsWrap(false)}
          >
            {isDeposit
              ? `Redeem ${pool.symbol}`
              : `Redeem ${pool.asset.symbol}`}
          </Button>
        </div>
        <div className="flex flex-col px-4 py-10 h-40">
          {getPendingAmountElement()}

          {isWrap && (
            <>
              <div className="flex justify-between mt-2">
                <span>
                  Input {isWrap ? pool.asset.symbol : pool.symbol} amount to
                  send {isDeposit ? "deposit" : "withdraw"} request:
                </span>
                <button>
                  Max:{" "}
                  {getWalletHumanBalance(balances, isWrap ? pool.asset : pool)}
                </button>
              </div>
              <div className="flex border-1 rounded">
                <input
                  className="flex-1 px-1 text-2xl"
                  placeholder="0.0"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex">
          {isWrap ? (
            <Button
              className="flex-1 !rounded-none"
              variant="contained"
              onClick={sendWrapRequest}
            >
              {isDeposit ? "Deposit request" : "Withdrawal request"}
            </Button>
          ) : (
            <Button
              className="flex-1 !rounded-none"
              variant="contained"
              onClick={isWrap ? sendWrapRequest : withdraw}
            >
              Redeem request
            </Button>
          )}
        </div>
      </Card>
    </Modal>
  );
};
