// UpdateMetadata.js
import React, { useState, useEffect } from "react";
import Modal from "react-modal";
import "./App.css";

import {
  uploadMetadataToIPFS,
  updateQuadrantMetadata,
  authorizeEditor,
  getQuadrantData,
} from "./web3Config";
import { useWallet } from "./WalletContext"; 
import { isAddress } from "ethers";

Modal.setAppElement("#root");

const UpdateMetadata = ({ isOpen, onClose, tokenId }) => {
  const { walletAddress } = useWallet();
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("");
  const [historicalData, setHistoricalData] = useState("");
  const [regionType, setRegionType] = useState("Urban");
  const [population, setPopulation] = useState("");
  const [infrastructure, setInfrastructure] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");
  const [editorAddress, setEditorAddress] = useState("");

  // NEW: what's already on-chain / on IPFS
  const [currentCid, setCurrentCid] = useState("");
  const [currentMetadata, setCurrentMetadata] = useState(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authMessage, setAuthMessage] = useState(false);

  // When the modal opens and we have tokenId -> load current metadata
  useEffect(() => {
    if (!isOpen || !tokenId) return;

    // ✅ Reset the form every time it opens
    setDescription("");
    setEnvironment("");
    setHistoricalData("");
    setRegionType("Urban");
    setPopulation("");
    setInfrastructure("");
    setError("");
    setAuthMessage("");
    setCurrentCid("");
    setCurrentMetadata(null);

    // ✅ cancelled flag — prevents setState on an unmounted component
    let cancelled = false;

    const loadCurrent = async () => {
      // ✅ Only set loading if the component is still alive
      if (!cancelled) setLoadingCurrent(true);

      try {
        const q = await getQuadrantData(tokenId);

        // ✅ Check cancelled after every await
        // If the modal was closed while we were waiting — exit quietly
        if (cancelled) return;

        if (!q) {
          setLoadingCurrent(false);
          return;
        }
 
        if (q.metadataHash) {
          setCurrentCid(q.metadataHash);
        }

        if (q.metadata) {
          const meta = q.metadata;

          // ✅ Guard every setState call with the cancelled flag
          if (!cancelled) {
            setCurrentMetadata(meta);

            if (meta.description) setDescription(meta.description);

            const attrs = meta.attributes || {};
            if (attrs.environment) setEnvironment(attrs.environment);
            if (attrs.historicalData) setHistoricalData(attrs.historicalData);
            if (attrs.regionType) setRegionType(attrs.regionType);

            if (typeof attrs.population !== "undefined") {
              setPopulation(String(attrs.population));
            }
            if (typeof attrs.infrastructure !== "undefined") {
              setInfrastructure(attrs.infrastructure);
            }
          }
        }
      } catch (e) {
        // ✅ Don't log the error if the modal is already closed
        if (cancelled) return;
        console.error("❌ Failed to load modal metadata:", e);
        setError("Unable to load existing metadata for this quadrant.");
      } finally {
        // ✅ finally always runs, but cancelled protects setState
        if (!cancelled) setLoadingCurrent(false);
      }
    };

    loadCurrent();

    // ✅ Cleanup function — sets cancelled=true
    // React calls it automatically:
    //   - when isOpen or tokenId changes
    //   - when the component unmounts (modal closed)
    return () => {
      cancelled = true;
    };

  }, [isOpen, tokenId]);



  const handleSubmit = async (e) => {
    e.preventDefault();

    // ✅ Check 1 — wallet must be connected
    if (!walletAddress) {
      setError("⚠️ Connect your wallet first. Use the GCD Wallet panel.");
      return;
    }

    // ✅ Check 2 — tokenId must exist
    if (!tokenId) {
      setError("⚠️ No quadrant selected. Close and select a quadrant first.");
      return;
    }

    // ✅ Only after validation — set loading
    setIsUpdating(true);
    setError("");

    const baseMeta = currentMetadata || {};

  // ✅ Compute once — cleaner and easier to read
  const includesPopulation =
    regionType === "Urban" || regionType === "Rural" || regionType === "Polar" || regionType === "Coastal" || regionType === "Ocean" || regionType === "Mountainous";

  const newMetadata = {
    ...baseMeta,
    description,
    attributes: {
      ...(baseMeta.attributes || {}),
      environment,
      historicalData,
      regionType,
      population: includesPopulation
        ? population || null   // ✅ empty field → null, not an empty string
        : null,                // ✅ null instead of undefined — explicitly clears the old value
      infrastructure: includesPopulation
        ? infrastructure || null // ✅ same
        : null,                  // ✅ null instead of undefined
      lastUpdated: new Date().toISOString(),
    },
  };


    try {
      const newHash = await uploadMetadataToIPFS(newMetadata, walletAddress);
      if (!newHash) throw new Error("IPFS upload failed.");

      const tx = await updateQuadrantMetadata(tokenId, newHash);
      if (tx) {
        // ✅ alert() replaced with an inline message
        setError("");
        setAuthMessage("✅ Metadata updated successfully!");
        setTimeout(() => {
          onClose(); // ✅ close the modal after a short pause
        }, 1500);
      } else {
        setError("❌ Failed to update metadata on the blockchain.");
      }
    } catch (err) {
      console.error("❌ Error:", err);
      setError("⚠️ Error: " + (err.message || String(err)));
    } finally {
      setIsUpdating(false);
    }
  };


  const handleAuthorizeEditor = async () => {
    // Check 1 — wallet
    if (!walletAddress) {
      setError("⚠️ Connect your wallet first.");
      return;
    }

    // Check 2 — empty field
    if (!editorAddress) {
      setError("⚠️ Enter the editor address (0x...).");
      return;
    }

    // ✅ Check 3 — Ethereum address validation
    if (!isAddress(editorAddress)) {
      setError(
        "⚠️ Invalid editor address. Must be a valid 0x... Ethereum address."
        );
      return;
    }

    // ✅ Check 4 — you cannot authorize your own address
    if (editorAddress.toLowerCase() === walletAddress.toLowerCase()) {
      setError("⚠️ You cannot authorize your own address as editor.");
      return;
    }

    // Only after all checks — set loading
    setIsAuthorizing(true);
    setError("");
    setAuthMessage("");

    try {
      const success = await authorizeEditor(tokenId, editorAddress);
      if (success) {
        setAuthMessage("✅ Editor authorized successfully!");
        setEditorAddress(""); // ✅ clear the field
      } else {
        setError("❌ Authorization failed. Check permissions.");
      }
    } catch (err) {
      console.error("❌ Authorization error:", err);
      setError("⚠️ Transaction error: " + (err.message || String(err)));
    } finally {
      setIsAuthorizing(false);
    }
  };



  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="modal-content"
      overlayClassName="modal-overlay"
      contentLabel="Update Metadata"
    >
      <h2>✏️ Update Metadata</h2>




{loadingCurrent && (
  <p className="ft-modal-loading">
    ⏳ Loading existing metadata from blockchain/IPFS...
  </p>
)}

{currentCid && (
  <div className="ft-modal-cid-info">
    <span>Current CID: </span>
    <code className="ft-modal-cid-code">{currentCid}</code>
    <br />
      <a
      href={`https://ipfs.io/ipfs/${currentCid}`}
      target="_blank"
      rel="noreferrer"
      className="ft-modal-cid-link"
    >
      🔗 Open current JSON on IPFS
    </a>
  </div>
)}

{error && (
  <p className="ft-quadrant-meta-error">{error}</p>
  // ✅ ft-quadrant-meta-error already exists from QuadrantMetaPanel.js
)}

{authMessage && (
  <p className="ft-modal-success">{authMessage}</p>
)}



      <form onSubmit={handleSubmit}>
        <label>
          📜 Description:
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Enter a description..."
          />
        </label>

        <label>
          🏞️ Environment:
          <input
            type="text"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            required
            placeholder="e.g. Mountain, forest..."
          />
        </label>

        <label>
          🏛️ History:
          <input
            type="text"
            value={historicalData}
            onChange={(e) => setHistoricalData(e.target.value)}
            required
            placeholder="Historical notes..."
          />
        </label>

        <label>
          🧭 Region type:
          <select value={regionType} onChange={(e) => setRegionType(e.target.value)}>
            <option value="Urban">Urban</option>
            <option value="Rural">Rural</option>
            <option value="Coastal">Coastal</option>
            <option value="Mountainous">Mountainous</option>
            <option value="Polar">Polar</option>
            <option value="Ocean">Ocean</option>
          </select>
        </label>


       {/* ✅ Population — shared between Urban and Rural */}
       {(regionType === "Urban" || regionType === "Rural" || regionType === "Coastal") && (
         <label>
           👥 Population:
          <input
            type="number"
             value={population}
             onChange={(e) => setPopulation(e.target.value)}
             placeholder="Population count"
            min="0"
           />
        </label>
      )}

      {/* ✅ Specific field — different for Urban and Rural */}
      {regionType === "Urban" && (
        <label>
           🏗 Infrastructure:
           <input
            type="text"
            value={infrastructure}
            onChange={(e) => setInfrastructure(e.target.value)}
            placeholder="e.g. Metro, roads..."
          />
        </label>
      )}

      {regionType === "Rural" && (
        <label>
          🌾 Crop / Agriculture:
          <input
            type="text"
            value={infrastructure}
            onChange={(e) => setInfrastructure(e.target.value)}
            placeholder="e.g. Wheat, corn..."
          />
        </label>
      )}

      {regionType === "Coastal" && (
        <label>
          🌾 Coastal type:
          <input
            type="text"
            value={infrastructure}
            onChange={(e) => setInfrastructure(e.target.value)}
            placeholder="e.g. Sandy beach, rocky cliff..."
          />
        </label>
      )}


      <label>
        👤 Authorized editor:
        <input
          type="text"
          value={editorAddress}
          onChange={(e) => {
            setEditorAddress(e.target.value);
            setError("");      // ✅ reset the error while the user is typing
            setAuthMessage(""); // ✅ reset the success message too
          }}
          placeholder="0x... user address"
          // ✅ visual border feedback — green if valid, red if not
          style={{
            borderColor: editorAddress
              ? isAddress(editorAddress)
                ? "#22c55e"   // green — valid address
                : "#ef4444"   // red — invalid address
               : undefined,    // default — empty field
          }}
        />
      </label>

      {/* ✅ Inline hint below the input while the user is typing */}
      {editorAddress && !isAddress(editorAddress) && (
        <p style={{ fontSize: "11px", color: "#ef4444", marginTop: "2px" }}>
          Must be a valid Ethereum address (0x + 40 hex characters)
        </p>
      )}
      {editorAddress && isAddress(editorAddress) && (
        <p style={{ fontSize: "11px", color: "#22c55e", marginTop: "2px" }}>
          ✓ Valid address
        </p>
      )}

       <button
        type="button"
        onClick={handleAuthorizeEditor}
        className="ft-modal-authorize-btn"
         disabled={
          isAuthorizing ||      // ✅ during the transaction
          !walletAddress ||     // ✅ without a wallet
          !editorAddress ||     // ✅ without an address
          !isAddress(editorAddress)  // ✅ invalid address
        }
       >
        {isAuthorizing
          ? "⏳ Authorizing..."   // ✅ visual indicator
          : "✅ Authorize editor"}
       </button>


        <div className="modal-buttons">
          <button
            type="submit"
            disabled={
              isUpdating ||       // ✅ during upload/transaction
              isAuthorizing ||    // ✅ while authorize is in progress (don't allow it in parallel)
              !walletAddress      // ✅ without a wallet
            }
          >
           {isUpdating
              ? "⏳ Saving..."    // ✅ consistent with other components
              : "💾 Save changes"}
          </button>

         <button
            type="button"
            onClick={onClose}
            className="cancel-button"
            disabled={isUpdating || isAuthorizing} // ✅ don't allow closing during the transaction
          >
            ❌ Cancel
          </button>
        </div>

      </form>
    </Modal>
  );
};

export default UpdateMetadata;

