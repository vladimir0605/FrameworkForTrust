import React, { useState } from "react";
import { rewardContributor } from "./web3Config";
import { isAddress } from "ethers";
import { useWallet } from "./WalletContext";

const RewardForm = () => {
  const { walletAddress } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);


  const handleReward = async () => {
    // wallet must be connected
    if (!walletAddress) {
      setStatus("Connect wallet first. Use the GCD Wallet panel.");
      return;
    }

    // ✅ Step 1 — check that fields are filled
    if (!recipient || !amount) {
      setStatus("⚠️ Enter both address and amount.");
      return;
    }

    // ✅ Step 2 — validate Ethereum address
    // isAddress checks: must be "0x" + exactly 40 hex characters
    if (!isAddress(recipient)) {
      setStatus("⚠️ Invalid recipient address. Must be a valid 0x... Ethereum address.");
      return;
    }

    // ✅ Step 3 — validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setStatus("⚠️ Amount must be a positive number.");
      return;
    }

    // ✅ Only after all validations — set loading
    setLoading(true);
    setStatus("⏳ Sending reward...");

    try {
      const success = await rewardContributor(recipient, amountNum);
      if (success) {
        setStatus("✅ Reward sent successfully!");
        setRecipient(""); // ✅ clear form after success
        setAmount("");
      } else {
        setStatus("❌ Error sending reward.");
      }
    } catch (err) {
      console.error("[RewardForm] rewardContributor error:", err);
      setStatus("❌ Unexpected error. Check console for details.");
    } finally {
      setLoading(false); // ✅ always reset loading
    }
  };


  return (
    <div className="ft-reward-panel">
      <h3>🎁 Reward user with GCD tokens</h3>

      {/* ✅ If wallet is not connected — show message instead of form */}
      {!walletAddress ? (
        <div className="ft-reward-no-wallet">
          <p>⚠️ Connect your wallet to use this panel.</p>
          <p className="ft-reward-hint">
            This panel is intended for admin and oracle roles only.
            Regular users will receive a rejection from the backend.
          </p>
        </div>
      ) : (
        // ✅ Form is shown only when wallet is connected
        <>
          <label className="ft-reward-label">
            👤 Recipient address:
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="ft-wallet-input"
          />

          <label className="ft-reward-label">
            💰 Amount (GCD):
          </label>
          <input
            type="number"
            min="0.0001"
            step="0.0001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 10"
            className="ft-wallet-input"
          />

          {/* ✅ Show which wallet is sending the reward */}
          <div className="ft-reward-sender">
            Sending from:{" "}
            <code>
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </code>
          </div>

          <button
            type="button"
            onClick={handleReward}
            disabled={loading}
            className="ft-wallet-send-btn"
          >
            {loading ? "⏳ Sending..." : "🚀 Send reward"}
          </button>

          {status && (
            <p className={
              status.startsWith("✅")
                ? "ft-wallet-status ft-status-success"
                : status.startsWith("❌")
                ? "ft-wallet-status ft-status-error"
                : status.startsWith("⚠️")
                ? "ft-wallet-status ft-status-warning"
                : "ft-wallet-status"
            }>
              {status}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default RewardForm;
