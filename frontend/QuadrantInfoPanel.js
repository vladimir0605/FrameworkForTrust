// frontend/QuadrantInfoPanel.js
import React, { useState, useRef, useEffect } from "react";

// Staro - vracaj ak novo ne bude radilo:
// const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || "https://ipfs.io/ipfs/";

// Bolje — koristi backend proxy kao default (kao u web3Config.js):
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || `${API_BASE}/ipfs/cid/`;

function QuadrantInfoPanel({ apiBase }) {
  const [quadrantIdInput, setQuadrantIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);
  const loadControllerRef = useRef(null); //holding active fetch between clicks

  useEffect(() => {
    // ✅ Cleanup pri unmountovanju —
    // prekini fetch ako korisnik napusti stranicu
    return () => {
      if (loadControllerRef.current) {
        loadControllerRef.current.abort();
      }
    };
  }, []); // prazan niz — izvršava se samo pri unmount


  const formatDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const shortWallet = (w) => {
    if (!w) return "—";
    if (w.length <= 12) return w;
    return `${w.slice(0, 6)}…${w.slice(-4)}`;
  };


const handleLoad = async () => {
  const qid = quadrantIdInput.trim();
  if (!qid) {
    setError("Enter quadrant ID (eg. Q_-80_-90).");
    setMeta(null);
    return;
  }
  if (!apiBase) {
    setError("API base not configured.");
    setMeta(null);
    return;
  }

  // ✅ Ako postoji prethodni fetch koji još traje — prekini ga
  // Npr. korisnik klikne "Load info" dva puta brzo
  if (loadControllerRef.current) {
    loadControllerRef.current.abort();
  }
  // ✅ Kreiraj novi controller za ovaj klik
  const controller = new AbortController();
  loadControllerRef.current = controller;

  setLoading(true);
  setError("");
  try {
    const res = await fetch(
      `${apiBase}/quadrants/${encodeURIComponent(qid)}`,
      { signal: controller.signal } // ✅ veži signal za fetch
    );

    if (!res.ok) {
      const txt = await res.text();
      console.error("GET /quadrants/{id} error:", res.status, txt);

      if (res.status === 404) {
        setError("Quadrant not found.");
      } else {
        setError(`Server error: ${res.status}`);
      }
      setMeta(null);
      return;
    }

    const data = await res.json();
    setMeta(data);
  } catch (err) {
    // ✅ AbortError nije greška — korisnik je pokrenuo novi request
    if (err.name === "AbortError") return;
    console.error("quadrant info error:", err);
    setError("Unable to load quadrant data.");
    setMeta(null);
  } finally {
    setLoading(false);
  }
};


  const tags =
    meta && Array.isArray(meta.quadrant_tags) ? meta.quadrant_tags : [];

  return (
    <div className="ft-quadrant-info-card">
      <h3>Quadrant info (read-only)</h3>
      <p className="ft-quadrant-info-hint">
        Enter the quadrant ID (eg <code>Q_-80_-90</code>) to see description and
        metadata. Panel for all users.
      </p>

   <form
      onSubmit={(e) => {
       e.preventDefault(); // ✅ sprečava reload stranice
       handleLoad();
     }}
     className="ft-quadrant-info-row"
   >
     <input
       type="text"
       className="ft-input"
       placeholder="Q_lat_lon (e.g. Q_-80_-90)"
       value={quadrantIdInput}
       onChange={(e) => setQuadrantIdInput(e.target.value)}
     />
     <button
       type="submit"  
       className="ft-btn"
       disabled={loading}
       
     >
       {loading ? "Loading..." : "Load info"}
     </button>
   </form>


      {error && <div className="ft-quadrant-info-error">{error}</div>}

      {meta && !error && (
        <div className="ft-quadrant-info-body">

          <div className="ft-quadrant-info-header">
           <div>
             <div className="ft-quadrant-id">{meta.quadrant_id}</div>
             <div className="ft-quadrant-description">
              {meta.short_description || "No description for this quadrant."}
             </div>
            </div>

      {meta.local_rating !== null && meta.local_rating !== undefined && (
       <div className="ft-quadrant-rating">
         {/* ✅ engleski tekst */}
         <div className="ft-quadrant-rating-label">Local rating</div>

          {/* ✅ zvjezdice sa zaštitom gornje i donje granice */}
           <div
            className="ft-quadrant-rating-stars"
            title={`${Math.min(Math.max(meta.local_rating, 0), 5)} / 5`}
           // ✅ hover prikazuje numeričku vrijednost
          >
            {"★".repeat(Math.min(Math.max(meta.local_rating, 0), 5))}
            {"☆".repeat(Math.max(0, 5 - Math.min(Math.max(meta.local_rating, 0), 5)))}
          </div>

      {/* ✅ numerički prikaz ispod zvjezdica */}
      <div className="ft-quadrant-rating-number">
        {Math.min(Math.max(meta.local_rating, 0), 5)} / 5
      </div>
    </div>
  )}
</div>



          {tags.length > 0 && (
            <div className="ft-quadrant-tags">
              {tags.map((tag) => (
                <span key={tag} className="ft-quadrant-tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="ft-quadrant-meta-grid">
            <div>
              <div className="ft-quadrant-meta-label">Category</div>
              <div className="ft-quadrant-meta-value">
                {meta.quadrant_category || "—"}
              </div>
            </div>

            <div>
              <div className="ft-quadrant-meta-label">Region type</div>
              <div className="ft-quadrant-meta-value">
                {meta.region_type || "—"}
              </div>
            </div>

            <div>
              <div className="ft-quadrant-meta-label">Owner wallet</div>
              <div className="ft-quadrant-meta-value">
                {shortWallet(meta.owner_wallet)}
              </div>
            </div>


            <div>
              <div className="ft-quadrant-meta-label">IPFS CID</div>
              <div className="ft-quadrant-meta-value">
                {meta.ipfs_cid ? (
                <a  
                href={`${IPFS_GATEWAY}${meta.ipfs_cid}`}
                target="_blank"
                rel="noreferrer"
              >  
              {meta.ipfs_cid.slice(0, 10)}…
              </a>
              ) : (
              "—"
              )}
              </div>
            </div>


            <div>
              <div className="ft-quadrant-meta-label">Created</div>
              <div className="ft-quadrant-meta-value">
                {formatDate(meta.created_at)}
              </div>
            </div>

            <div>
              <div className="ft-quadrant-meta-label">Updated</div>
              <div className="ft-quadrant-meta-value">
                {formatDate(meta.updated_at)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuadrantInfoPanel;

