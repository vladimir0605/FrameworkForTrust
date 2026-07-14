import React, { useState } from "react";

const CoordinateSearch = ({ onSearch, t }) => {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      setError("Coordinates must be numbers.");
      return;
    }
    if (latNum < -90 || latNum > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (lonNum < -180 || lonNum > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }

    setLoading(true);
    try {
      onSearch(latNum, lonNum);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="ft-coordinate-search" onSubmit={handleSubmit}>
      <div className="ft-coordinate-row">
        <label htmlFor="coord-lat" className="ft-coordinate-label">Lat:</label>
        <input
          id="coord-lat"
          type="number"
          step="0.000001"
          min="-90"
          max="90"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          className="ft-dapp-input"
          placeholder="e.g. 43.8563"
        />
      </div>

      <div className="ft-coordinate-row">
        <label htmlFor="coord-lon" className="ft-coordinate-label">Lon:</label>
        <input
          id="coord-lon"
          type="number"
          step="0.000001"
          min="-180"
          max="180"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          className="ft-dapp-input"
          placeholder="e.g. 18.4131"
        />
      </div>

      {error && (
        <p className="ft-error-msg" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="ft-dapp-btn-primary"
        disabled={loading}
      >
        {loading ? "Searching..." : "🔎 Find quadrant"}
      </button>
    </form>
  );
};

export default CoordinateSearch;

