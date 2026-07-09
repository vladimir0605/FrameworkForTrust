// GCDWallet.js
import React, { useState, useEffect, useRef } from "react";
import { transferGcd } from "./web3Config"; // ✅ connectWallet removed — comes from WalletContext
import { BrowserProvider, Contract, formatUnits, isAddress } from "ethers"; // ✅ isAddress added
import { useWallet } from "./WalletContext"; // ✅ global wallet context

// const GCD_CONTRACT_ADDRESS = "0xA9216Afa1f3C0E855fDc5771b6a339A20a5D480D";
const GCD_CONTRACT_ADDRESS = process.env.REACT_APP_GCD_ADDRESS || "0x3131AcA746B7613390DED61613E5C0Ae9944B635"; // ✅ new address


// Minimal ABI: only necessary functions (symbol, decimals, balanceOf)
const GCD_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

const GCDWallet = ({ eventsCount, apiBase }) => {
  // ✅ wallet logic comes from global context
  const {
    walletAddress: wallet,
    isConnecting,
    connectWallet,
    walletError,
    authToken,        // ✅ added
    isAuthenticating, // ✅ added
    authError,        // ✅ added
  } = useWallet();

  // ✅ Local state — only what is specific to this UI
  const [network, setNetwork] = useState("");
  const [balance, setBalance] = useState("0");
  const [tokenSymbol, setTokenSymbol] = useState("GCD");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [gcdBalance, setGcdBalance] = useState(null);
  const [gcdStatus, setGcdStatus] = useState("");
  const [gcdToday, setGcdToday] = useState({
    eventsToday: 0,
    totalRewardToday: 0,
  });
  const [gcdTodayStatus, setGcdTodayStatus] = useState("");

  // ✅ AbortController refs for fetch calls
  const balanceControllerRef = useRef(null);
  const rewardsControllerRef = useRef(null);

  // ─────────────────────────────────────────────
  // Mapping chainId → human readable network name
  // ─────────────────────────────────────────────
  const mapChainIdToName = (chainId) => {
    if (!chainId && chainId !== 0) return "Unknown / local";
    switch (Number(chainId)) {
      case 80002:    return "Polygon Amoy testnet (80002)";
      case 137:      return "Polygon mainnet (137)";
      case 1:        return "Ethereum mainnet (1)";
      case 11155111: return "Ethereum Sepolia testnet (11155111)";
      default:       return `Unknown network (chainId: ${chainId})`;
    }
  };

  // ─────────────────────────────────────────────
  // Load network name from MetaMask
  // ─────────────────────────────────────────────
  const refreshNetworkInfo = async () => {
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        setNetwork("MetaMask not available");
        return;
      }
      const provider = new BrowserProvider(window.ethereum);
      const net = await provider.getNetwork();
      const chainId = Number(net.chainId);
      setNetwork(mapChainIdToName(chainId));
    } catch (err) {
      console.error("[GCDWallet] Network loading error:", err);
      setNetwork("Unknown / local");
    }
  };

  // ─────────────────────────────────────────────
  // On-chain GCD balance (directly from contract)
  // ─────────────────────────────────────────────
  const loadBalance = async (address) => {
    if (!address) {
      setBalance("0");
      return;
    }
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        setStatus("⚠️ MetaMask not available in browser.");
        return;
      }
      const provider = new BrowserProvider(window.ethereum);
      const contract = new Contract(GCD_CONTRACT_ADDRESS, GCD_ABI, provider);

      const [rawBalance, decimals, symbol] = await Promise.all([
        contract.balanceOf(address),
        contract.decimals(),
        contract.symbol(),
      ]);

      setBalance(formatUnits(rawBalance, decimals));
      setTokenSymbol(symbol || "GCD");
    } catch (err) {
      console.error("[GCDWallet] Error loading balance:", err);
      setStatus("⚠️ Error loading on-chain balance.");
    }
  };

  // ─────────────────────────────────────────────
  // Off-chain GCD balance (from FfT backend)
  // ✅ AbortController to cancel if wallet changes
  // ─────────────────────────────────────────────
  const loadGcdBalance = async (address) => {
    if (!apiBase || !address) return;
    // ✅ Auth token required
    if (!authToken) {
      setGcdStatus("⚠️ Not authenticated. Connect wallet first.");
      return;
    }

    if (balanceControllerRef.current) {
      balanceControllerRef.current.abort();
    }
    const controller = new AbortController();
    balanceControllerRef.current = controller;

    try {
      const res = await fetch(`${apiBase}/wallet/gcd_balance`, {
        headers: {
          "Authorization": `Bearer ${authToken}`, // ✅ JWT token
          "X-Wallet-Address": address,             // ✅ kept for compatibility
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error("GET /wallet/gcd_balance error:", await res.text());
        setGcdStatus("⚠️ GCD balance unavailable.");
        return;
      }

      const data = await res.json();
      const val = typeof data.gcd_balance === "number" ? data.gcd_balance : 0.0;
      setGcdBalance(val);
      setGcdStatus("GCD balance loaded.");
    } catch (err) {
      if (err.name === "AbortError") return; // ✅ silent exit
      console.error("wallet/gcd_balance exception:", err);
      setGcdStatus("⚠️ Error loading GCD balance.");
    }
  };

  // ─────────────────────────────────────────────
  // Daily GCD rewards (from FfT backend)
  // ✅ AbortController + correct position (above useEffect)
  // ─────────────────────────────────────────────
  const loadGcdRewardsToday = async (address) => {
    if (!apiBase || !address) return;

    if (rewardsControllerRef.current) {
      rewardsControllerRef.current.abort();
    }
    const controller = new AbortController();
    rewardsControllerRef.current = controller;

    try {
      const res = await fetch(`${apiBase}/wallet/gcd_rewards_today`, {
        headers: {
          "Authorization": `Bearer ${authToken}`, // ✅ auth token added
          "X-Wallet-Address": address,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error("GET /wallet/gcd_rewards_today error:", await res.text());
        setGcdTodayStatus("⚠️ GCD rewards unavailable today.");
        return;
      }

      const data = await res.json();
      setGcdToday({
        eventsToday: data.events_today ?? 0,
        totalRewardToday: data.total_reward_today ?? 0.0,
      });
      setGcdTodayStatus("GCD rewards loaded.");
    } catch (err) {
      if (err.name === "AbortError") return; // ✅ silent exit
      console.error("wallet/gcd_rewards_today exception:", err);
      setGcdTodayStatus("⚠️ Error loading GCD rewards.");
    }
  };

  // ─────────────────────────────────────────────
  // ✅ Reacts to wallet change from WalletContext
  // When user connects / changes wallet →
  // automatically loads all data
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (wallet) {
      loadBalance(wallet);
      loadGcdBalance(wallet);
      loadGcdRewardsToday(wallet);
      refreshNetworkInfo();
    } else {
      // ✅ Wallet disconnected — reset UI
      setBalance("0");
      setGcdBalance(null);
      setGcdToday({ eventsToday: 0, totalRewardToday: 0 });
      setNetwork("");
      setStatus("");
      setGcdStatus("");
      setGcdTodayStatus("");
    }

    // ✅ Cleanup: cancel all active fetches
    return () => {
      if (balanceControllerRef.current) balanceControllerRef.current.abort();
      if (rewardsControllerRef.current) rewardsControllerRef.current.abort();
    };
  }, [wallet, apiBase, authToken]); // ✅ wallet in dep list — event sensitive

  // ─────────────────────────────────────────────
  // Connect button handler
  // ✅ connectWallet comes from WalletContext
  // loadBalance and others fire automatically
  // through useEffect listening to wallet change
  // ─────────────────────────────────────────────
  const connect = async () => {
    setStatus("🔌 Connecting to wallet...");
    const address = await connectWallet();
    if (address) {
      setStatus("✅ Wallet connected.");
    } else {
      setStatus("⚠️ Wallet not connected or request rejected.");
    }
  };

  // ─────────────────────────────────────────────
  // Transfer GCD tokens
  // ✅ address and amount validation
  // ─────────────────────────────────────────────
  const sendTokens = async () => {
    if (!wallet) {
      setStatus("⚠️ Connect wallet first.");
      return;
    }
    if (!recipient || !amount) {
      setStatus("⚠️ Enter recipient address and amount.");
      return;
    }

    // ✅ Ethereum address validation
    if (!isAddress(recipient)) {
      setStatus("⚠️ Invalid recipient address. Must be a valid 0x... Ethereum address.");
      return;
    }

    // ✅ Amount validation
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setStatus("⚠️ Amount must be a positive number.");
      return;
    }

    setStatus("⏳ Sending tokens...");
    try {
      const tx = await transferGcd(recipient, amount);
      if (tx) {
        setStatus("✅ Tokens sent successfully!");
        await loadBalance(wallet);
      } else {
        setStatus("❌ Transfer failed.");
      }
    } catch (err) {
      console.error("[GCDWallet] Transfer error:", err);
      setStatus("⚠️ Error during transfer.");
    }
  };

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────
  const shortWallet =
    wallet && wallet.length > 10
      ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
      : wallet || "Not connected";

  const eventsDisplay =
    typeof eventsCount === "number" ? eventsCount : "—";

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="ft-wallet-card">

      {/* Header — title and connect button */}
      <div className="ft-wallet-header">
        <div>
          <h3 className="ft-wallet-title">GCD Wallet</h3>
          <p className="ft-wallet-label">Geo Quadrant Credits</p>
        </div>
        <button
          type="button"
          className={`ft-wallet-connect-btn ${wallet ? "is-connected" : ""}`}
          onClick={connect}
          disabled={isConnecting} // ✅ disabled while connecting
        >
          {isConnecting
            ? "⏳ Connecting..."
            : wallet
            ? "🔁 Change wallet"
            : "🔌 Connect wallet"}
        </button>
      </div>

      {walletError && (
        <p className="ft-wallet-status" style={{ color: "#ef4444" }}>
          ⚠️ {walletError}
        </p>
      )}

      {/* Address and network */}
      <div className="ft-wallet-row">
        <div className="ft-wallet-col">
          <div className="ft-wallet-label">📬 Address</div>
          <div
            className="ft-wallet-address"
            title={wallet || ""} // hover → full address
          >
            {shortWallet}
          </div>
        </div>
        <div className="ft-wallet-col">
          <div className="ft-wallet-label">🌐 Network</div>
          <div className="ft-wallet-network">
            {network || "Unknown / local"}
          </div>
        </div>
      </div>

      {/* Balance and event count */}
      <div className="ft-wallet-row">
        <div className="ft-wallet-col">
          <div className="ft-wallet-label">💰 Balance</div>
          <div className="ft-wallet-balance">
            {balance} {tokenSymbol}
          </div>
        </div>
        <div className="ft-wallet-col">
          <div className="ft-wallet-label">📍 Events in quadrant</div>
          <div className="ft-wallet-events">{eventsDisplay}</div>
        </div>
      </div>

      {/* Refresh button — shown only when wallet is connected */}
      {wallet && (
        <button
          type="button"
          className="ft-wallet-send-btn"
          style={{ marginBottom: "0.75rem" }}
          onClick={() => {
            loadBalance(wallet);
            loadGcdBalance(wallet);
            loadGcdRewardsToday(wallet);
          }}
        >
          🔄 Refresh balance
        </button>
      )}

      {/* Transfer section */}
      <div className="ft-wallet-transfer">
        <div className="ft-wallet-transfer-header">
          <span className="ft-wallet-label">Transfer</span>
          <span className="ft-wallet-label">Send GCD tokens</span>
        </div>

        <input
          type="text"
          placeholder="📨 Recipient (0x...)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="ft-wallet-input"
        />
        <input
          type="number"
          min="0"
          step="0.0001"
          placeholder="💸 Amount GCD"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="ft-wallet-input"
        />
        <button
          type="button"
          className="ft-wallet-send-btn"
          onClick={sendTokens}
          disabled={!wallet} // ✅ disabled when no wallet connected
        >
          📤 Send GCD
        </button>
      </div>

      {/* Off-chain GCD balance */}
      <div className="gcdwallet-row">
        <span>FfT GCD balance (off-chain beta):</span>
        <strong>
          {gcdBalance !== null ? `${gcdBalance.toFixed(4)} GCD` : "—"}
        </strong>
      </div>

      {/* ✅ Daily rewards — shown once, no duplicates */}
      <div className="gcdwallet-row">
        <span>Events today (rewarded):</span>
        <strong>
          {typeof gcdToday.eventsToday === "number"
            ? gcdToday.eventsToday
            : "—"}
        </strong>
      </div>

      <div className="gcdwallet-row">
        <span>GCD earned today:</span>
        <strong>
          {typeof gcdToday.totalRewardToday === "number"
            ? `${gcdToday.totalRewardToday.toFixed(4)} GCD`
            : "—"}
        </strong>
      </div>

      {/* ✅ Status messages — each shown once */}
      {gcdStatus && (
        <div className="gcdwallet-status gcdwallet-status-secondary">
          {gcdStatus}
        </div>
      )}

      {gcdTodayStatus && (
        <div className="gcdwallet-status gcdwallet-status-secondary">
          {gcdTodayStatus}
        </div>
      )}

      {status && (
        <p className="ft-wallet-status">{status}</p>
      )}

    </div>
  );
};

export default GCDWallet;
