// frontend/QuadrantMetaPanel.js
import React, { useState, useRef, useEffect } from "react";
import { useWallet } from "./WalletContext";


function QuadrantMetaPanel({ apiBase }) {
  const { walletAddress: wallet, authToken } = useWallet();

  const loadControllerRef = useRef(null);
  const saveControllerRef = useRef(null);
  // ✅ Cleanup pri unmountovanju komponente —
  // prekini sve aktivne fetchove ako korisnik napusti stranicu
  useEffect(() => {
    return () => {
      if (loadControllerRef.current) loadControllerRef.current.abort();
      if (saveControllerRef.current) saveControllerRef.current.abort();
    };
  }, []);

  const [quadrantIdInput, setQuadrantIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const [shortDescription, setShortDescription] = useState("");
  const [ipfsCid, setIpfsCid] = useState("");

  // NOVO – dodatna polja kvadranta
  const [quadrantTagsInput, setQuadrantTagsInput] = useState("");
  const [quadrantCategory, setQuadrantCategory] = useState("");
  const [localRating, setLocalRating] = useState("");


  const handleLoad = async () => {
    // ✅ Validacija PRIJE setLoading (fix bug #3)
    const qid = quadrantIdInput.trim();
    if (!qid) {
      setError("Enter quadrant ID (e.g. Q_-80_-90).");
      return;
    }

    // ✅ Prekini prethodni fetch ako postoji
    if (loadControllerRef.current) {
      loadControllerRef.current.abort();
    }
    const controller = new AbortController();
    loadControllerRef.current = controller;

    setError("");
    setInfoMessage("");
    setLoading(true);

    try {
      const res = await fetch(
        `${apiBase}/quadrants/${encodeURIComponent(qid)}`,
        { signal: controller.signal } // ✅
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("GET /quadrants/{id} error:", res.status, text);
        if (res.status === 404) {
          setError("Quadrant not found.");
        } else {
          setError(`Server error: ${res.status}`);
        }
        return;
      }

      const data = await res.json();
      setShortDescription(data.short_description || "");
      setIpfsCid(data.ipfs_cid || "");

      if (Array.isArray(data.quadrant_tags)) {
        setQuadrantTagsInput(data.quadrant_tags.join(", "));
      } else {
        setQuadrantTagsInput("");
      }

      setQuadrantCategory(data.quadrant_category || "");
      setLocalRating(
        typeof data.local_rating === "number"
          ? String(data.local_rating)
          : ""
      );

      setInfoMessage("Quadrant loaded.");
    } catch (err) {
      if (err.name === "AbortError") return; // ✅ tiho izlazi
      console.error("QuadrantMetaPanel handleLoad exception:", err);
      setError("Error loading quadrant data.");
    } finally {
      setLoading(false);
    }
  };



  const handleSave = async () => {
    // ✅ Sve validacije PRVE — prije setSaveLoading
    const qid = quadrantIdInput.trim();
    if (!qid) {
      setError("Enter quadrant ID.");
      return; // ✅ loading nikad nije bio true
    }


    const storedWallet = wallet || "";
    if (!storedWallet) {
      setError("⚠️ Wallet not connected. Connect via the GCD Wallet panel first.");
      return; // ✅ loading nikad nije bio true, nema ručnog setSaveLoading(false)
    }


    // ✅ Tek nakon svih validacija — postavi loading
    if (saveControllerRef.current) {
      saveControllerRef.current.abort();
    }
    const saveController = new AbortController();
    saveControllerRef.current = saveController;

    setError("");
    setInfoMessage("");
    setSaveLoading(true); // ← sada je sigurno

    try {
      const tagsArray = quadrantTagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const ratingInt =
        localRating !== "" && !Number.isNaN(parseInt(localRating, 10))
          ? parseInt(localRating, 10)
          : null;

      // ✅ Validacija rating-a (bug #7 iz pregleda)
      if (ratingInt !== null && (ratingInt < 0 || ratingInt > 5)) {
        setError("Local rating must be between 0 and 5.");
        return;
        // Napomena: ovaj return je unutar try bloka ISPOD setLoading,
        // ali finally će ga pokupiti ispravno jer nema AbortController-a
        // koji bi prekinuo tok
       }
 
      const payload = {
        short_description: shortDescription || null,
        quadrant_tags: tagsArray,
        quadrant_category: quadrantCategory || null,
        local_rating: ratingInt,
      };

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`, // ✅
        "X-Wallet-Address": storedWallet, // ✅ uvijek postavljamo jer smo provjerili gore
      };

      const res = await fetch(
        `${apiBase}/quadrants/${encodeURIComponent(qid)}/meta`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
          signal: saveController.signal,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("PATCH /quadrants/{id}/meta error:", res.status, text);
        if (res.status === 403) {
          setError("You don't have permission to edit this quadrant.");
        } else if (res.status === 404) {
          setError("Quadrant not found.");
        } else {
          setError(`Server error: ${res.status}`);
        }
        return;
      }

      const data = await res.json();
      setShortDescription(data.short_description || "");
      setIpfsCid(data.ipfs_cid || "");

      if (Array.isArray(data.quadrant_tags)) {
        setQuadrantTagsInput(data.quadrant_tags.join(", "));
      } else {
        setQuadrantTagsInput("");
      }

      setQuadrantCategory(data.quadrant_category || "");
      setLocalRating(
        typeof data.local_rating === "number"
          ? String(data.local_rating)
          : ""
      );

      setInfoMessage("Quadrant metadata saved.");
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("QuadrantMetaPanel handleSave exception:", err);
      setError("Error saving quadrant metadata.");
    } finally {
      setSaveLoading(false); // ✅ uvijek se izvršava
    }
  };


  return (
    <div className="ft-quadrant-meta-panel">
      <h3>Admin / quadrant_editor only – description & quadrant metadata</h3>
      <p className="ft-quadrant-meta-hint">
        This panel is only visible to system admins and quadrant editors. 
        A short description, tags, category and local rating help the quadrant come to life in the FfT application (off-chain layer).
      </p>

      <div className="ft-quadrant-meta-row">
        <label>
          Quadrant ID (npr. Q_-80_-90)
          <input
            type="text"
            value={quadrantIdInput}
            onChange={(e) => setQuadrantIdInput(e.target.value)}
            className="ft-quadrant-meta-input"
          />
        </label>
        <button
          type="button"
          onClick={handleLoad}
          disabled={loading || !quadrantIdInput.trim()}
          className="ft-quadrant-meta-btn"
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      <div className="ft-quadrant-meta-row">
        <label>IPFS CID (read-only)</label>
        {ipfsCid ? (
          <div className="ft-quadrant-ipfs-block">
            <code className="ft-quadrant-ipfs-cid">{ipfsCid}</code>
            <a
              href={`https://ipfs.io/ipfs/${ipfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ft-quadrant-ipfs-link"
            >
              Open IPFS metadata
            </a>
          </div>
        ) : (
          <div className="ft-quadrant-ipfs-block">
            <span className="ft-quadrant-ipfs-empty">
              No IPFS CID set for this quadrant.
            </span>
          </div>
        )}
      </div>

      <div className="ft-quadrant-meta-row">
        <label>
          Brief description of the quadrant
          <textarea
            className="ft-quadrant-meta-textarea"
            rows={3}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            placeholder="Eg. Key city traffic junction, frequent congestion on weekdays 7-9am..."
          />
        </label>
      </div>

      <div className="ft-quadrant-meta-row">
        <label>
          Tags (separated by comma)
          <input
            type="text"
            className="ft-quadrant-meta-input"
            value={quadrantTagsInput}
            onChange={(e) => setQuadrantTagsInput(e.target.value)}
            placeholder="e.g. traffic, parking, school_zone"
          />
        </label>
      </div>

      <div className="ft-quadrant-meta-row">
        <label>
          Quadrant category
          <select
            className="ft-quadrant-meta-input"
            value={quadrantCategory}
            onChange={(e) => setQuadrantCategory(e.target.value)}
          >
            <option value="">(Not set)</option>
            <option value="traffic">Traffic / congestion</option>
            <option value="parking">Parking lot</option>
            <option value="public_service">Public service / institutions</option>
            <option value="residential">Residential area</option>
            <option value="commercial">Business / Commercial zone</option>
            <option value="ecology">Ecology / air quality / water</option>
            <option value="risk">Risk zone (floods, landslides...)</option>
          </select>
        </label>
      </div>

      <div className="ft-quadrant-meta-row">
        <label>
          Local rating (0–5)
          <input
            type="number"
            min="0"
            max="5"
            step="1"
            className="ft-quadrant-meta-input"
            value={localRating}
            onChange={(e) => setLocalRating(e.target.value)}
            placeholder="eg. 3"
          />
        </label>
        <div className="ft-quadrant-meta-hint-small">
          It does not have to mean good / bad - it can also be the intensity of the importance of this quadrant in the local context.
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saveLoading || !quadrantIdInput.trim()}
        className="ft-quadrant-meta-btn ft-quadrant-meta-btn-primary"
      >
        {saveLoading ? "Recording..." : "Save Meta Data"}
      </button>

      {error && <div className="ft-quadrant-meta-error">{error}</div>}
      {infoMessage && (
        <div className="ft-quadrant-meta-info">{infoMessage}</div>
      )}
    </div>
  );
}

export default QuadrantMetaPanel;

