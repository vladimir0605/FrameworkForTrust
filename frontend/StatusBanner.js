// src/StatusBanner.js
import React, { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 30000; // 30s

/**
 * Small status indicator for the backend:
 * - polls /health endpoint every 30s
 * - displays DB / Qdrant / Web3 status
 *
 * Props:
 *   apiBase – e.g. "http://localhost:8000"
 */
const StatusBanner = ({ apiBase }) => {
  const [status, setStatus] = useState("loading"); // loading | ok | degraded | error
  const [detail, setDetail] = useState({
    db_ok: false,
    qdrant_ok: false,
    web3_ok: false,
    version: "",
  });

  const base = apiBase || "";

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${base}/health`);
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = await res.json();

      setDetail({
        db_ok: !!data.db_ok,
        qdrant_ok: !!data.qdrant_ok,
        web3_ok: !!data.web3_ok,
        version: data.version || "",
      });

      if (data.status === "ok") {
        setStatus("ok");
      } else {
        setStatus("degraded");
      }
    } catch (err) {
      console.error("[StatusBanner] Health fetch error:", err);
      setStatus("error");
    }
  };

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  let dotClass = "status-dot status-dot-neutral";
  let text = "Checking system status…";

  if (status === "ok") {
    dotClass = "status-dot status-dot-ok";
    text = "System status: OK";
  } else if (status === "degraded") {
    dotClass = "status-dot status-dot-degraded";
    text = "System status: Degraded";
  } else if (status === "error") {
    dotClass = "status-dot status-dot-error";
    text = "System status: Error";
  }

  const extraParts = [];
  if (status !== "loading") {
    extraParts.push(`DB: ${detail.db_ok ? "OK" : "DOWN"}`);
    extraParts.push(`Qdrant: ${detail.qdrant_ok ? "OK" : "DOWN"}`);
    extraParts.push(`Web3: ${detail.web3_ok ? "OK" : "DOWN"}`);
    if (detail.version) {
      extraParts.push(`v${detail.version}`);
    }
  }

  return (
    <div className="status-banner">
      <span className={dotClass} />
      <span className="status-main-text">{text}</span>
      {extraParts.length > 0 && (
        <span className="status-extra-text">({extraParts.join(" · ")})</span>
      )}
    </div>
  );
};

export default StatusBanner;
