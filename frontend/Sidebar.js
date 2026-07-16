// wallet address, search by coordinates
import React from "react";
import CoordinateSearch from "./CoordinateSearch";
import { useWallet } from "./WalletContext"; 

const Sidebar = ({ onCoordinateSearch, onRefresh, selectionInfo }) => {
  const { walletAddress } = useWallet(); // ← from context

  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <aside className="ft-dapp-controls-card">
      <div className="ft-dapp-controls-header">
        <div>
          <div className="ft-dapp-controls-title">🗺️ Controls</div>
          <div className="ft-dapp-controls-subtitle">🔍 Coordinate search</div>
        </div>
      </div>

      <div className="ft-dapp-controls-body">
        {/* Coordinate search block */}
        <div className="ft-dapp-section">
          <CoordinateSearch onSearch={onCoordinateSearch} />
        </div>


{selectionInfo && (
  <div className="ft-selection-info">
    <div className="ft-selection-info-title">📍Selected location: </div>

    <div className="ft-selection-info-row">
      <span className="ft-selection-info-label">Source:</span>
      <span className="ft-selection-info-value">
        {selectionInfo.source === "search" ? "Coordinate search" : "Click on Map"}
      </span>
    </div>

    <div className="ft-selection-info-row">
      <span className="ft-selection-info-label">Lat:</span>
      <span className="ft-selection-info-value">
        {typeof selectionInfo.lat === "number" ? selectionInfo.lat.toFixed(6) : "N/A"}
      </span>
    </div>

    <div className="ft-selection-info-row">
      <span className="ft-selection-info-label">Lon:</span>
      <span className="ft-selection-info-value">
        {typeof selectionInfo.lon === "number" ? selectionInfo.lon.toFixed(6) : "N/A"}
      </span>
    </div>

    {selectionInfo.subcell_id && (
      <div className="ft-selection-info-row">
        <span className="ft-selection-info-label">H3:</span>
        <span className="ft-selection-info-value">{selectionInfo.subcell_id}</span>
      </div>
    )}

    {selectionInfo.quadrantLabel && (
      <div className="ft-selection-info-row">
        <span className="ft-selection-info-label">Quadrant:</span>
        <span className="ft-selection-info-value">{selectionInfo.quadrantLabel}</span>
      </div>
    )}


  </div>
)}


        {/* Wallet address block */}
        <div className="ft-dapp-section">
          <h4 className="ft-dapp-section-title">👛 Your wallet</h4>
            <p className="ft-dapp-wallet-text" title={walletAddress || undefined}>
              {shortWallet ?? "Not connected"}
            </p>
        </div>

        {/* Button: reload quadrants */}
        <div className="ft-dapp-controls-row">
          <button
            type="button"
            onClick={onRefresh}
            className="ft-dapp-btn-secondary"
          >
            ♻️ Reload quadrants
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
