import React, { useState } from "react";
import { getQuadrantData } from "./web3Config";

const SearchBar = ({ onSearch }) => {
  const [tokenId, setTokenId] = useState("");
  const [error, setError] = useState(null);    // ✅ for inline error message
  const [loading, setLoading] = useState(false); // ✅ for loading state


  const handleSearch = async () => {
    // ✅ Reset error on each new attempt
    setError(null);

    // ✅ Validate Token ID
    const id = parseInt(tokenId, 10);
    if (!tokenId || isNaN(id) || id < 0) {
      setError("Enter a valid Token ID.");
      return;
    }

    // ✅ Loading state — prevent double click
    setLoading(true);

    try {
      const data = await getQuadrantData(id);

      if (data) {
        onSearch(data); // ✅ pass result to parent component
      } else {
        setError("Quadrant not found for this Token ID.");
      }
    } catch (err) {
      console.error("[SearchBar] getQuadrantData error:", err);
      setError("Error connecting to blockchain. Try again.");
    } finally {
      setLoading(false); // ✅ always reset loading
    }
  };


  return (
    <form
      className="ft-search-bar"
      onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
    >
      <div className="ft-search-bar-row">
        <input
          type="number"
          placeholder="Enter Token ID..."
          value={tokenId}
          onChange={(e) => {
            setTokenId(e.target.value);
            setError(null); // ✅ clear error as soon as user starts typing
          }}
          className="ft-wallet-input"
          min="0"
          disabled={loading}
        />
        <button
          type="submit"
          className="ft-dapp-btn-primary"
          disabled={loading || !tokenId}
        >
          {loading ? "⏳ Searching..." : "🔍 Search"}
        </button>
      </div>

      {/* ✅ Inline error message — instead of alert() */}
      {error && (
        <p className="ft-error-msg" role="alert">
          ❌ {error}
        </p>
      )}
    </form>
  );
};

export default SearchBar;
