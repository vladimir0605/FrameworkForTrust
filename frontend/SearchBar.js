import React, { useState } from "react";
import { getQuadrantData } from "./web3Config";

const SearchBar = ({ onSearch }) => {
    const [tokenId, setTokenId] = useState("");
    const [error, setError] = useState(null);    // ✅ za inline error poruku
    const [loading, setLoading] = useState(false); // ✅ za loading stanje


  const handleSearch = async () => {
    // ✅ Resetuj grešku pri svakom novom pokušaju
    setError(null);

    // ✅ Validacija Token ID-a
    const id = parseInt(tokenId, 10);
    if (!tokenId || isNaN(id) || id < 0) {
      setError("Enter a valid Token ID.");
      return;
    }

    // ✅ Loading state — onemogući dupli klik
    setLoading(true);

    try {
      const data = await getQuadrantData(id);

      if (data) {
        onSearch(data); // ✅ proslijedi rezultat parent komponenti
      } else {
        setError("Quadrant not found for this Token ID.");
      }
    } catch (err) {
      console.error("[SearchBar] getQuadrantData error:", err);
      setError("Error connecting to blockchain. Try again.");
    } finally {
      setLoading(false); // ✅ uvijek resetuj loading
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
          setError(null); // ✅ očisti grešku čim korisnik počne tipkati
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

    {/* ✅ Inline error poruka — umjesto alert() */}
    {error && (
      <p className="ft-error-msg" role="alert">
        ❌ {error}
      </p>
    )}
  </form>
);


};

export default SearchBar;

