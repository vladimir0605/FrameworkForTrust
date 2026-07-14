// TestnetFaucet.js
import React, { useState, useRef } from "react";
import { useWallet } from "./WalletContext"; // ✅ same global wallet context as GCDWallet

// ─────────────────────────────────────────────
// Testnet faucet button.
// NOTE: this is deliberately NOT part of the GCD reputation economy.
// It calls POST /faucet/claim, which the backend only serves when
// ENABLE_TESTNET_FAUCET=1 is set — on a mainnet deployment the backend
// returns 404 and this component simply shows an "unavailable" state.
// ─────────────────────────────────────────────
const TestnetFaucet = ({ apiBase }) => {
  const { walletAddress: wallet } = useWallet();

  const [status, setStatus] = useState("idle"); // idle | loading | success | cooldown | unavailable | error
  const [message, setMessage] = useState("");
  const [nextClaimAt, setNextClaimAt] = useState(null);

  const controllerRef = useRef(null);

  const claim = async () => {
    if (!apiBase) return;

    if (!wallet) {
      setStatus("error");
      setMessage("⚠️ Connect a wallet first.");
      return;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus("loading");
    setMessage("⏳ Requesting testnet GCD...");

    try {
      const res = await fetch(`${apiBase}/faucet/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 404) {
        setStatus("unavailable");
        setMessage("Faucet is not available on this deployment.");
        return;
      }

      if (res.status === 429) {
        setStatus("cooldown");
        setNextClaimAt(data.detail?.match(/after (.+)\.?$/)?.[1] || null);
        setMessage(data.detail || "Faucet already claimed today.");
        return;
      }

      if (!res.ok) {
        setStatus("error");
        setMessage(data.detail || "⚠️ Faucet request failed.");
        return;
      }

      setStatus("success");
      setNextClaimAt(data.next_claim_available_at || null);
      setMessage(`✅ Received ${data.amount_gcd} test GCD.`);
    } catch (err) {
      if (err.name === "AbortError") return; // silent exit
      console.error("[TestnetFaucet] claim error:", err);
      setStatus("error");
      setMessage("⚠️ Could not reach the faucet endpoint.");
    }
  };

  const isBusy = status === "loading";
  const isDone = status === "success" || status === "cooldown";

  return (
    <div className="ft-faucet-card">
      <div className="ft-faucet-header">
        <h3 className="ft-wallet-title">🚰 Testnet faucet</h3>
        <span className="ft-faucet-badge">Testnet only</span>
      </div>

      <p className="ft-faucet-description">
        Get a small amount of test GCD to try staking and other features
        without spending real reputation. This faucet is a developer
        convenience — it is <strong>not</strong> part of the Proof-of-Contribution
        reputation mechanism, and GCD received here does not reflect
        trustworthiness or any real contribution.
      </p>

      <button
        type="button"
        className="ft-wallet-send-btn"
        onClick={claim}
        disabled={isBusy || status === "unavailable" || !wallet}
      >
        {isBusy ? "⏳ Requesting..." : "🚰 Get test GCD"}
      </button>

      {!wallet && (
        <p className="ft-faucet-status">⚠️ Connect a wallet to use the faucet.</p>
      )}

      {message && wallet && (
        <p
          className={`ft-faucet-status ${
            status === "error" || status === "unavailable" ? "is-error" : ""
          }`}
        >
          {message}
        </p>
      )}

      {isDone && nextClaimAt && (
        <p className="ft-faucet-hint">
          Next claim available: {new Date(nextClaimAt).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default TestnetFaucet;
