import { connectWallet as web3ConnectWallet } from "./web3Config";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

// ✅ Same pattern as in web3Config.js
const API_BASE_RAW = (process.env.REACT_APP_API_BASE || "").trim();
const API_BASE =
  API_BASE_RAW ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "/api");

const WalletContext = createContext(null);

export const WalletProvider = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState(null);
  // ✅ JWT token state
  const [authToken, setAuthToken] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);


  const loginWithWallet = useCallback(async (address) => {
    if (!address || !window.ethereum) return null;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // ✅ Step 1: Request nonce from backend
      const nonceRes = await fetch(`${API_BASE}/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });

      if (!nonceRes.ok) {
        throw new Error(`Nonce request failed: ${nonceRes.status}`);
      }

      const nonceData = await nonceRes.json();
      const { nonce, message } = nonceData;

      // ✅ Step 2: User signs the message with MetaMask
      // personal_sign does not open a transaction approval popup
      // — it only requests a message signature
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      // ✅ Step 3: Send signature to backend and receive JWT
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          nonce: nonce,
          signature: signature,
        }),
      });

      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}));
        throw new Error(
          err.detail || `Login failed: ${loginRes.status}`
        );
      }

      const loginData = await loginRes.json();
      const token = loginData.token;

      // ✅ Step 4: Save token in state
      setAuthToken(token);

      // ✅ Optional: save to sessionStorage to survive page refresh
      // (not localStorage — token is short-lived)
      sessionStorage.setItem("fft_auth_token", token);

      console.log("[WalletContext] Auth login successful for:", address);
      return token;

    } catch (err) {
      if (err.code === 4001) {
        // User rejected the signature in MetaMask
        setAuthError("Signature rejected. Please sign to authenticate.");
      } else {
        setAuthError("Authentication failed: " + (err.message || "Unknown error"));
      }
      console.error("[WalletContext] loginWithWallet error:", err);
      setAuthToken(null);
      sessionStorage.removeItem("fft_auth_token");
      return null;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);


  useEffect(() => {
    if (!window.ethereum) return;

    // ✅ Check sessionStorage for existing token
    const savedToken = sessionStorage.getItem("fft_auth_token");
    if (savedToken) {
      // Quick check that token has not expired (no API call)
      try {
        const parts = savedToken.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp > now) {
            // Token is still valid
            setAuthToken(savedToken);
            // Restore wallet address from token
            if (payload.sub) setWalletAddress(payload.sub);
          } else {
            // Token has expired — clear it
            sessionStorage.removeItem("fft_auth_token");
          }
        }
      } catch (e) {
        sessionStorage.removeItem("fft_auth_token");
      }
    }

    // Listener for account change
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setWalletAddress(null);
        setAuthToken(null);  // ✅ Clear token on disconnect
        sessionStorage.removeItem("fft_auth_token");
      } else {
        setWalletAddress(accounts[0]);
        // ✅ New account requires a new token
        loginWithWallet(accounts[0]);
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [loginWithWallet]);


  // ✅ Explicit connect — called only on button click
  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setWalletError(null);

    try {
      const result = await web3ConnectWallet();

      if (result?.address) {
        setWalletAddress(result.address);

        // ✅ Immediately after connecting — perform auth login
        // User will see MetaMask popup for signature
        await loginWithWallet(result.address);

        return result.address;
      }
      return null;

    } catch (err) {
      if (err.code === 4001) {
        setWalletError("Connection rejected by user.");
      } else if (err.message?.includes("Wrong network")) {
        setWalletError(
          "Wrong network. Please switch MetaMask to Polygon Amoy testnet."
        );
      } else if (err.message?.includes("not installed")) {
        setWalletError(
          "MetaMask is not installed. Please install it from metamask.io."
        );
      } else {
        setWalletError(
          "Failed to connect wallet: " + (err.message || "Unknown error")
        );
      }
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [loginWithWallet]);


  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setAuthToken(null);                          // ✅ clear JWT state
    sessionStorage.removeItem("fft_auth_token"); // ✅ correct storage key
  }, []);


  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        isConnecting,
        walletError,
        connectWallet,
        disconnectWallet,
        authToken,           // ✅ added
        isAuthenticating,    // ✅ added
        authError,           // ✅ added
        loginWithWallet,     // ✅ added (for manual re-login)
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

// ✅ Custom hook for easy use in any component
export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return ctx;
};
