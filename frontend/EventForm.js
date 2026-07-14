import React, { useState, useEffect, useRef } from "react";
import { signEventPayload } from "./web3Config";
import { useWallet } from "./WalletContext";

// REQUIRED: set the real server IP/URL
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

const EventForm = ({
  activeQuadrant,
  // walletAddress,
  eventLocation,
  onEventHover,
  onEventLeave,
  onSubcellClick,
  onClearPinnedSubcell,  
}) => {
  const { walletAddress } = useWallet(); 

  const [kind, setKind] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  // trust breakdown (last submitted event)
  const [trustDebug, setTrustDebug] = useState(null);

  // for similar events (Qdrant semantic search)
  const [lastEventForSimilarity, setLastEventForSimilarity] = useState(null);
  const [similarEvents, setSimilarEvents] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState("");

  // 👉 NEW: source reputation estimate (0–1)
  const [reporterConfidence, setSourceReputation] = useState(0.5);

  // 👉 NEW: subjective report rating (normal, suspicious, fake, verified)
  const [reportFlag, setReportFlag] = useState("normal");

  // universal event history for the active quadrant
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

  // transport – optional layer (shown when checkbox is checked)
  const [isTransport, setIsTransport] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [delayMinutes, setDelayMinutes] = useState("");
  const [severity, setSeverity] = useState("");
  const [stake, setStake] = useState("");

  // 👉: event details (modal)
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // AbortController refs for handleFindSimilar and handleShowProof  
  const similarControllerRef = useRef(null);
  const proofControllerRef = useRef(null);


  const handleOpenDetails = (ev) => {
    setSelectedEvent(ev);
    setShowDetailsModal(true);
  };

  const handleCloseDetails = () => {
    setShowDetailsModal(false);
    setSelectedEvent(null);
  };

  const formatLatLon = (lat, lon) => {
    if (typeof lat !== "number" || typeof lon !== "number") return "—";
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  };

  // 👉 Proof-of-event UI state
  const [proofData, setProofData] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState("");

  // 📜 Flow of Time — timeline state
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [showTimeline, setShowTimeline] = useState(false);

  const [timelineOffset, setTimelineOffset] = useState(0);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const TIMELINE_LIMIT = 20;


  // 👉 NEW: filters for event history
  const [filterKind, setFilterKind] = useState("");
  const [filterTag, setFilterTag] = useState("");

  const hasQuadrant = !!activeQuadrant;

  // 📍 NEW: device geolocation state
  const [deviceLoc, setDeviceLoc] = useState(null);
  // deviceLoc = { lat, lon, accuracy_m, ts_ms, source: "gps" }

  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [useDeviceLoc, setUseDeviceLoc] = useState(true);

  const canGeo = typeof navigator !== "undefined" && !!navigator.geolocation;

  const locateMe = async () => {
    setLocError("");
    if (!canGeo) {
      setLocError("Geolocation not available in this browser.");
      return;
    }

    setLocating(true);
    const opts = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setDeviceLoc({
          lat: Number(latitude),
          lon: Number(longitude),
          accuracy_m: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
          ts_ms: Date.now(),
          source: "gps",
        });
        setUseDeviceLoc(true);
        setLocating(false);
      },
      (err) => {
        setLocError(err?.message || "Failed locating.");
        setLocating(false);
      },
      opts
    );
  };

  // helper: generate a unique event_id
  const generateEventId = () => {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch (e) {
      // ignore
    }
    return `ev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  // helper: parse tags from comma-separated input "a,b,c"
  const parseTopicTags = (raw) => {
    if (!raw || typeof raw !== "string") return [];
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50); // safety limit
  };



  // 🔹 1) fetch events for the active quadrant
useEffect(() => {
  if (!activeQuadrant || !activeQuadrant.tokenId) {
    setEvents([]);
    setEventsError("");
    setShowTimeline(false);
    setTimelineData(null);
    setTimelineError("");
    return;
  }

  // ✅ AbortController: if the quadrant changes or the component unmounts,
  // the fetch is cancelled and setState is not called on a dead component
  const controller = new AbortController();

  const fetchEvents = async () => {
    setEventsLoading(true);
    setEventsError("");
    const quadrantId = String(activeQuadrant.tokenId);

    try {
      const res = await fetch(
        `${API_BASE}/events/by_quadrant?quadrant_id=${encodeURIComponent(quadrantId)}`,
        { signal: controller.signal }  // ✅ signal tied to controller
      );
      if (!res.ok) {
        const text = await res.text();
        console.error("GET /events/by_quadrant error:", text);
        setEventsError(`Server error: ${res.status}`);
        setEvents([]);
      } else {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      // ✅ AbortError is not a real error — silently ignore
      if (err.name === "AbortError") return;
      console.error("GET /events/by_quadrant exception:", err);
      setEventsError("Can't connect to the event history API.");
      setEvents([]);
    } finally {
      // ✅ finally still runs, but setEventsLoading(false)
      // is safe because we already handled AbortError in catch
      setEventsLoading(false);
    }
  };

  fetchEvents();

  // ✅ cleanup: called when activeQuadrant changes
  // or when the component unmounts — automatically cancels the fetch
  return () => controller.abort();

}, [activeQuadrant]);



  // 🔹 2) transport event aggregation (frontend only)
  let transportSummary = null;
  if (events && events.length > 0) {
    const transportEvents = events.filter(
      (ev) =>
        ev.vehicle_id ||
        ev.route_id ||
        (ev.kind &&
          typeof ev.kind === "string" &&
          ev.kind.startsWith("transport"))
    );

    if (transportEvents.length > 0) {
      let sumDelay = 0;
      let countDelay = 0;
      let sumScore = 0;
      let countScore = 0;

      transportEvents.forEach((ev) => {
        if (typeof ev.delay_minutes === "number") {
          sumDelay += ev.delay_minutes;
          countDelay += 1;
        }
        if (typeof ev.trust_score === "number") {
          sumScore += ev.trust_score;
          countScore += 1;
        }
      });

      const avgDelay = countDelay > 0 ? sumDelay / countDelay : null;
      const avgScore = countScore > 0 ? sumScore / countScore : null;

      transportSummary = {
        count: transportEvents.length,
        avgDelay,
        avgScore,
      };
    }
  }

  // 🔍 Filter events by type and tag
  const filteredEvents = (events || []).filter((ev) => {
    // filter on kind
    if (filterKind) {
      const k = ev.kind ? String(ev.kind).toLowerCase() : "";
      if (!k.includes(filterKind.toLowerCase())) return false;
    }

    // filter on tag
    if (filterTag) {
      const tagNeedle = filterTag.toLowerCase();
      const tagList = Array.isArray(ev.topic_tags) ? ev.topic_tags : [];
      const hasMatch = tagList.some(
        (t) => t && String(t).toLowerCase().includes(tagNeedle)
      );
      if (!hasMatch) return false;
    }

    return true;
  });

  // small helper: returns icon for flag tags
  const getFlagIcon = (topicTags) => {
    const t = Array.isArray(topicTags) ? topicTags : [];
    if (t.includes("flag:fake")) return "🚫";
    if (t.includes("flag:suspicious")) return "⚠️";
    if (t.includes("flag:verified")) return "✅";
    return null;
  };




const handleFindSimilar = async () => {
  if (!lastEventForSimilarity) {
    setSimilarError("⚠️ You must first enter an event...");
    return;
  }

  // ✅ Cancel previous fetch if still in progress
  if (similarControllerRef.current) {
    similarControllerRef.current.abort();
  }
  // ✅ Create a new controller for this click
  const controller = new AbortController();
  similarControllerRef.current = controller;

  setSimilarLoading(true);
  setSimilarError("");

  try {
    const payload = {
      quadrant_id: String(lastEventForSimilarity.quadrant_id),
      kind: lastEventForSimilarity.kind || null,
      topic_tags: lastEventForSimilarity.topic_tags || [],
      top_k: 5,
    };
    const res = await fetch(`${API_BASE}/events/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal, // ✅
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("POST /events/similar error:", text);
      setSimilarError(`⚠️ Server error: ${res.status}`);
      setSimilarEvents([]);
      return;
    }

    const data = await res.json();
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
      ? data.items
      : [];
    setSimilarEvents(items);

  } catch (err) {
    if (err.name === "AbortError") return; // ✅ silent exit on abort
    console.error("events/similar exception:", err);
    setSimilarError("⚠️ Can't get similar events.");
    setSimilarEvents([]);
  } finally {
    setSimilarLoading(false);
  }
};



const handleShowProof = async (eventId) => {
  // ✅ Cancel previous proof fetch if present
  if (proofControllerRef.current) {
    proofControllerRef.current.abort();
  }
  const controller = new AbortController();
  proofControllerRef.current = controller;

  setProofLoading(true);
  setProofError("");
  setProofData(null);

  try {
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/proof`,
      { signal: controller.signal } // ✅
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("GET /events/{id}/proof error:", text);
      setProofError(`⚠️ Error fetching proof: ${res.status}`);
      return;
    }

    const data = await res.json();
    setProofData(data);

  } catch (err) {
    if (err.name === "AbortError") return; // ✅ silent exit on abort
    console.error("GET /events/{id}/proof exception:", err);
    setProofError("⚠️ Can't connect to proof API.");
  } finally {
    setProofLoading(false);
  }
};


  const handleShowTimeline = async (offset = 0) => {
    if (!activeQuadrant?.tokenId) return;

    if (showTimeline && offset === 0) {
      setShowTimeline(false);
      setTimelineData(null);
      setTimelineOffset(0);
      setTimelineTotal(0);
      return;
    }

    setTimelineLoading(true);
    setTimelineError("");

    try {
      const res = await fetch(
        `${API_BASE}/quadrant/${encodeURIComponent(activeQuadrant.tokenId)}/timeline?limit=${TIMELINE_LIMIT}&offset=${offset}`
      );
      if (!res.ok) {
        setTimelineError(`⚠️ Server error: ${res.status}`);
        return;
      }
      const data = await res.json();

      setTimelineData(prev =>
        offset === 0
          ? data
          : { ...data, entries: [...(prev?.entries || []), ...data.entries] }
      );
      setTimelineTotal(data.total);
      setTimelineOffset(offset + data.entries.length);
      setShowTimeline(true);
    } catch (err) {
      console.error("Timeline fetch error:", err);
      setTimelineError("⚠️ Cannot connect to timeline API.");
    } finally {
      setTimelineLoading(false);
    }
  };



  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!hasQuadrant) {
      setStatus("⚠️ Select a quadrant first by clicking on the map.");
      return;
    }

    // event_id must always be present
    const eventId = generateEventId();
    const now = Math.floor(Date.now() / 1000);

    // ✅ topicTags derived from the "tags" input field
    const topicTags = parseTopicTags(tags);

    // Event location priority: GPS (if selected) → click within quadrant → quadrant centre
    let eventLat;
    let eventLon;

    if (
      useDeviceLoc &&
      deviceLoc &&
      typeof deviceLoc.lat === "number" &&
      typeof deviceLoc.lon === "number"
    ) {
      eventLat = deviceLoc.lat;
      eventLon = deviceLoc.lon;
    } else if (
      eventLocation &&
      typeof eventLocation.lat === "number" &&
      typeof eventLocation.lon === "number"
    ) {
      eventLat = eventLocation.lat;
      eventLon = eventLocation.lon;
    } else {
      const baseLat = activeQuadrant.lat;
      const baseLon = activeQuadrant.lon;
      eventLat = baseLat + 5; //lat0 + 5 = center of block
      eventLon = baseLon + 5; //lon0 + 5 = center of block
    }

    // 👉 flags are appended to topicTags
    if (reportFlag === "suspicious") {
      topicTags.push("flag:suspicious");
    } else if (reportFlag === "fake") {
      topicTags.push("flag:fake");
    }

    // transport numeric fields
    const delayVal = delayMinutes !== "" ? parseFloat(delayMinutes) : null;
    const severityVal = severity !== "" ? parseInt(severity, 10) : null;

    const payload = {
      event_id: eventId,
      kind: kind || null,

      quadrant_id: activeQuadrant.tokenId ? String(activeQuadrant.tokenId) : null,

      lat: eventLat,
      lon: eventLon,
      timestamp: now,

      // geo quality (optional)
      location_accuracy_m:
        useDeviceLoc && deviceLoc ? deviceLoc.accuracy_m : null,

      location_source:
        useDeviceLoc && deviceLoc
          ? "gps"
          : eventLocation
          ? "manual"
          : "manual",

      device_timestamp_ms:
        useDeviceLoc && deviceLoc ? deviceLoc.ts_ms : Date.now(),

      description:
        description && description.trim() !== ""
          ? description.trim()
          : null,

      topic_tags: topicTags,

      // Source & reputation
      source_type: "human",
      // reporter_confidence: replaced by source_reputation below
      source_reputation:
        typeof reporterConfidence === "number" ? reporterConfidence : 0.5,
      device_quality: null,

      stake:
        stake !== "" && !Number.isNaN(parseFloat(stake))
          ? parseFloat(stake)
          : 0.0,

      sensor_values: null,

      source_wallet: walletAddress || null,

      // H3 / subcell – null for now (determined by backend)
      subcell_id: null,
      h3_resolution: null,

      // Transport fields
      vehicle_id: isTransport && vehicleId ? vehicleId : null,
      route_id: isTransport && routeId ? routeId : null,

      delay_minutes:
        isTransport && delayVal !== null && !Number.isNaN(delayVal)
          ? delayVal
          : null,

      severity:
        isTransport && severityVal !== null && !Number.isNaN(severityVal)
          ? severityVal
          : null,
    };

    // 🔐 SIGNATURE – only if wallet is connected
    if (walletAddress) {
      try {
        const { message, signature } = await signEventPayload(
          payload,
          walletAddress
        );
        payload.signature = signature;
        payload.signed_payload = message;
      } catch (signErr) {
        console.error("Event signing failed:", signErr);
        setStatus("⚠️ Event signing failed or was rejected.");
        return;
      }
    }

    // snapshot for /events/similar query
    const similaritySnapshot = {
      quadrant_id: payload.quadrant_id,
      kind: payload.kind,
      topic_tags: payload.topic_tags,
      description: payload.description,
    };

    setSending(true);
    setStatus("⏳ Sending event...");

    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // 🛡 Special UX for daily rate limit (429 Too Many Requests)
        if (res.status === 429) {
          let detailMessage = "";
          try {
            const errBody = await res.json();
            if (errBody && errBody.detail) detailMessage = String(errBody.detail);
          } catch (e2) {
            // ignore
          }

          setStatus(
            detailMessage
              ? `⚠️ ${detailMessage}`
              : "⚠️ You have reached the daily event limit for this wallet. Please try again tomorrow."
          );
        } else {
          const text = await res.text();
          console.error("Event API error:", text);
          setStatus(`⚠️ Server error: ${res.status}`);
        }
        return;
      }

      const data = await res.json();

      setStatus(
        `✅ Event recorded. trust_score = ${
          data?.trust_score?.toFixed ? data.trust_score.toFixed(3) : data.trust_score
        }`
      );

      setTrustDebug({
        uiRep: data.ui_rep ?? null,
        onchainRep: data.onchain_rep ?? null,
        combinedRep: data.combined_rep ?? null,
        stake: data.stake ?? null,
        stakeNorm: data.stake_norm ?? null,
        base: data.base ?? null,
        bonusLocal: data.bonus_local ?? null,
        clusterBonus: data.cluster_bonus ?? null,
      });

      setLastEventForSimilarity(similaritySnapshot);
      setSimilarEvents([]);
      setSimilarError("");

      // reset form inputs
      setKind("");
      setDescription("");
      setTags("");
      setIsTransport(false);
      setVehicleId("");
      setRouteId("");
      setDelayMinutes("");
      setSeverity("");

      // refresh event history
      if (activeQuadrant && activeQuadrant.tokenId) {
        try {
          const qid = String(activeQuadrant.tokenId);
          const res2 = await fetch(
            `${API_BASE}/events/by_quadrant?quadrant_id=${encodeURIComponent(qid)}`
          );
          if (res2.ok) {
            const list = await res2.json();
            setEvents(Array.isArray(list) ? list : []);
          }
        } catch (err2) {
          console.error("Refresh events after post failed:", err2);
        }
      }
    } catch (err) {
      console.error("Event API exception:", err);
      setStatus("⚠️ Cannot connect to API.");
    } finally {
      setSending(false);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "";
    try {
      return new Date(ts * 1000).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return "—";
    return `${(num * 100).toFixed(1)}%`;
  };

  const shortenAddress = (addr) => {
    if (!addr || typeof addr !== "string") return "—";
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="ft-event-card">
      <h3 className="ft-event-title">Report an event in the quadrant.</h3>

      {!hasQuadrant && (
        <p className="ft-event-hint">
          👉Click on a square on the map to report an event for that location.
        </p>
      )}

      {hasQuadrant && (
        <p className="ft-event-hint">
          🎯Active quadrant: tokenId <strong>{activeQuadrant.tokenId ?? "?"}</strong>{" "}
          ({activeQuadrant.lat}, {activeQuadrant.lon})
          <br />
          📍Location of an event:{" "}
          {eventLocation
            ? `${eventLocation.lat.toFixed(4)}, ${eventLocation.lon.toFixed(4)}`
            : "quadrant center"}
        </p>
      )}

      {/* Locate me */}
      {hasQuadrant && (
        <div className="ft-event-hint" style={{ marginTop: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="ft-dapp-btn-secondary"
              onClick={locateMe}
              disabled={locating}
            >
              {locating ? "Locate..." : "📍 Locate me"}
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={useDeviceLoc}
                onChange={(e) => setUseDeviceLoc(e.target.checked)}
                disabled={!deviceLoc}
              />
              GPS event location
            </label>
          </div>

          {locError && <div style={{ color: "crimson", marginTop: "0.35rem" }}>{locError}</div>}

          <div style={{ marginTop: "0.35rem" }}>
            <strong>GPS:</strong>{" "}
            {deviceLoc
              ? `${deviceLoc.lat.toFixed(6)}, ${deviceLoc.lon.toFixed(6)}`
              : "—"}
            {deviceLoc?.accuracy_m != null ? ` (accuracy ~ ${deviceLoc.accuracy_m} m)` : ""}
          </div>

          {!canGeo && (
            <div style={{ marginTop: "0.25rem" }}>
              ℹ️ Note: Browser geolocation typically requires HTTPS (except on localhost).
            </div>
          )}
        </div>
      )}

      {/* FORMA */}
      <form className="ft-event-form" onSubmit={handleSubmit}>
        <div className="ft-event-row">
          <label className="ft-event-label">Event type</label>
          <input
            type="text"
            className="ft-dapp-input"
            placeholder="e.g. transport_incident, flood..."
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          />
        </div>

        <div className="ft-event-row">
          <label className="ft-event-label">Description</label>
          <textarea
            className="ft-dapp-input"
            rows={3}
            placeholder="Brief description of the event..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="ft-event-row">
          <label className="ft-event-label">Tags</label>
          <input
            type="text"
            className="ft-dapp-input"
            placeholder="e.g. traffic,delay,road"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <div className="ft-event-row">
          <label className="ft-event-label">Stake (GCD)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className="ft-dapp-input"
            placeholder="e.g. 5.0"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </div>

        <div className="ft-event-row">
          <label className="ft-event-label">Confidence of reporter (0–1)</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={reporterConfidence}
            onChange={(e) => setSourceReputation(parseFloat(e.target.value))}
            className="ft-event-slider"
          />
          <div className="ft-event-slider-labels">
            <span>0.0 (low) --- </span>
            <span>{Number(reporterConfidence).toFixed(1)}</span>
            <span> --- 1.0 (high)</span>
          </div>
        </div>

        <div className="ft-event-row">
          <label className="ft-event-label">Report rating</label>
          <select
            className="ft-dapp-input"
            value={reportFlag}
            onChange={(e) => setReportFlag(e.target.value)}
          >
            <option value="normal">normal</option>
            <option value="suspicious">suspicious</option>
            <option value="fake">fake / intentionally inaccurate</option>
          </select>
        </div>

        <div className="ft-event-row">
          <label className="ft-event-label">
            <input
              type="checkbox"
              checked={isTransport}
              onChange={(e) => setIsTransport(e.target.checked)}
              style={{ marginRight: "0.4rem" }}
            />
            If the event is the transportation event
          </label>
        </div>

        {isTransport && (
          <>
            <div className="ft-event-row">
              <label className="ft-event-label">Vehicle (vehicle_id)</label>
              <input
                type="text"
                className="ft-dapp-input"
                placeholder="e.g. KAM-23, BUS-17..."
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              />
            </div>

            <div className="ft-event-row">
              <label className="ft-event-label">Route (route_id)</label>
              <input
                type="text"
                className="ft-dapp-input"
                placeholder="e.g. R1, Sarajevo–Beograd..."
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
              />
            </div>

            <div className="ft-event-row">
              <label className="ft-event-label">Delay (min)</label>
              <input
                type="number"
                step="0.1"
                className="ft-dapp-input"
                placeholder="e.g. 12.5"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
              />
            </div>

            <div className="ft-event-row">
              <label className="ft-event-label">Severity (1–5)</label>
              <input
                type="number"
                min="1"
                max="5"
                className="ft-dapp-input"
                placeholder="e.g. 3"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              />
            </div>
          </>
        )}

        <button
          type="submit"
          className="ft-dapp-btn-primary"
          disabled={sending || !hasQuadrant}
        >
          {sending ? "Sending..." : "📤Submit event"}
        </button>
      </form>

      {status && <p className="ft-wallet-status">{status}</p>}

      {trustDebug && (
        <div className="ft-trust-breakdown">
          <h4 className="ft-event-history-title">Trust breakdown (demo)</h4>
          <ul className="ft-trust-list">
            <li>UI reputation: <strong>{formatPercent(trustDebug.uiRep)}</strong></li>
            <li>On-chain GCD reputation: <strong>{formatPercent(trustDebug.onchainRep)}</strong></li>
            <li>Combined reputation: <strong>{formatPercent(trustDebug.combinedRep)}</strong></li>
            <li>
              Stake:{" "}
              <strong>
                {trustDebug.stake != null ? `${Number(trustDebug.stake).toFixed(2)} GCD` : "—"}
              </strong>{" "}
              (norm:{" "}
              <strong>
                {trustDebug.stakeNorm != null ? Number(trustDebug.stakeNorm).toFixed(3) : "—"}
              </strong>
              )
            </li>
            <li>
              Base score (rep + stake):{" "}
              <strong>{trustDebug.base != null ? Number(trustDebug.base).toFixed(3) : "—"}</strong>
            </li>
            <li>
              Local correlation bonus:{" "}
              <strong>
                {trustDebug.bonusLocal != null ? Number(trustDebug.bonusLocal).toFixed(3) : "—"}
              </strong>
            </li>
            <li>
              Qdrant cluster bonus:{" "}
              <strong>
                {trustDebug.clusterBonus != null ? Number(trustDebug.clusterBonus).toFixed(3) : "—"}
              </strong>
            </li>
          </ul>
        </div>
      )}

      {walletAddress && (
        <p className="ft-event-hint">
          Source: <span className="ft-event-wallet">{shortenAddress(walletAddress)}</span>
        </p>
      )}

      {/* EVENT'S HISTORY  */}
      <div className="ft-event-history">
        <h4 className="ft-event-history-title">Event  history</h4>
        <p className="ft-event-hint">
          Display of events that are textually and by tags similar to the last reported event.
        </p>

        <div className="ft-event-row">
          <label className="ft-event-label">Filters</label>
          <div className="ft-event-filter-row">
            <input
              type="text"
              className="ft-dapp-input"
              placeholder="Filter by type (kind)..."
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              style={{ marginBottom: "0.4rem" }}
            />
            <input
              type="text"
              className="ft-dapp-input"
              placeholder="Filter by tag..."
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
            />
          </div>
        </div>

        {eventsLoading && <p className="ft-event-hint">⏳ Loading event history...</p>}
        {eventsError && <p className="ft-event-hint">⚠️ {eventsError}</p>}

        {!eventsLoading && !eventsError && filteredEvents.length === 0 && hasQuadrant && (
          <p className="ft-event-hint">
            There are no recorded events yet for this square  (or the filter is not returning results).
          </p>
        )}

        {!eventsLoading && !eventsError && filteredEvents.length > 0 && (
          <ul className="ft-event-history-list">
            {filteredEvents.map((ev) => {
              const flagIcon = getFlagIcon(ev.topic_tags);
              return (
                <li
                  key={ev.event_id}
                  className="ft-event-history-item"
                  onMouseEnter={() => {
                    if (onEventHover && typeof ev.lat === "number" && typeof ev.lon === "number") {
                      onEventHover({ lat: ev.lat, lon: ev.lon });
                    }
                  }}
                  onMouseLeave={() => {
                    if (onEventLeave) onEventLeave();
                  }}
                  onClick={() => handleOpenDetails(ev)}
                >
                  <div className="ft-event-history-main">
                    <span className="ft-event-kind">
                      {flagIcon && <span style={{ marginRight: "0.25rem" }}>{flagIcon}</span>}
                      {ev.kind || "event"}
                    </span>
                    <span className="ft-event-score">
                      score: {ev.trust_score?.toFixed ? ev.trust_score.toFixed(3) : ev.trust_score}
                    </span>

                    {typeof ev.stake === "number" && ev.stake > 0 && (
                      <span className="ft-event-tags">stake: {ev.stake}</span>
                    )}
                  </div>

                  {(ev.subcell_id ||
                    (ev.h3_resolution !== null && ev.h3_resolution !== undefined)) && (
                    <div className="ft-event-history-meta">
                      <span>
                        🧭 Subcell:{" "}
                        <strong>{ev.subcell_id || "—"}</strong>

                        {onSubcellClick &&
                          typeof ev.lat === "number" &&
                          typeof ev.lon === "number" && (
                            <>
                              {" "}
                              <button
                                type="button"
                                className="ft-proof-link"
                                title="Show subcell polygon on the map"
                                onClick={(evt) => {
                                  evt.stopPropagation();
                                  onSubcellClick({
                                    lat: ev.lat,
                                    lon: ev.lon,
                                    event_id: ev.event_id,
                                    subcell_id: ev.subcell_id || null,
                                  });
                                }}
                              >
                                (show)
                              </button>
                            </>
                          )}

                        {onClearPinnedSubcell && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="ft-proof-link"
                              title="Ukloni pinned subcell"
                              onClick={(evt) => {
                                evt.stopPropagation();
                                onClearPinnedSubcell();
                              }}
                            >
                              (clear)
                            </button>
                          </>
                        )}

                        {" · H3 res: "}
                        <strong>
                          {ev.h3_resolution !== null && ev.h3_resolution !== undefined
                            ? ev.h3_resolution
                            : "—"}
                        </strong>
                      </span>
                    </div>
                  )}

                  <div className="ft-event-history-meta">
                    <span>{formatTimestamp(ev.timestamp)}</span>
                    {Array.isArray(ev.topic_tags) && ev.topic_tags.length > 0 && (
                      <span className="ft-event-tags">{ev.topic_tags.join(", ")}</span>
                    )}
                  </div>

                  {(ev.vehicle_id ||
                    ev.route_id ||
                    ev.delay_minutes != null ||
                    (typeof ev.stake === "number" && ev.stake > 0) ||
                    typeof ev.severity === "number") && (
                    <div className="ft-event-history-meta">
                      {ev.vehicle_id && <span>veh: {ev.vehicle_id}</span>}
                      {ev.route_id && <span>ruta: {ev.route_id}</span>}
                      {typeof ev.delay_minutes === "number" && (
                        <span>delay: {ev.delay_minutes.toFixed(1)} min</span>
                      )}
                      {typeof ev.severity === "number" && <span>sev: {ev.severity}</span>}
                    </div>
                  )}

                  <div className="ft-event-history-meta">
                    <button
                      type="button"
                      className="ft-proof-link"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handleShowProof(ev.event_id);
                      }}
                    >
                      🔒 Proof
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* SLIČNI DOGAĐAJI (Qdrant demo) */}
        <div className="ft-event-similar">
          <div className="ft-event-similar-header">
            <h4 className="ft-event-history-title ft-event-ai-title">🤖Similar events (AI matching)</h4>

            <button
              type="button"
              className="ft-dapp-btn-secondary"
              onClick={handleFindSimilar}
              disabled={similarLoading || !lastEventForSimilarity}
            >
              {similarLoading ? "Searching..." : "🔍Show similar (last event)"}
            </button>
          </div>

          {!lastEventForSimilarity && (
            <p className="ft-event-hint">ℹ️ Record at least one event in this quadrant.</p>
          )}

          {similarError && <p className="ft-event-hint">⚠️ {similarError}</p>}

          {!similarLoading && !similarError && similarEvents.length === 0 && lastEventForSimilarity && (
            <p className="ft-event-hint">No similar events found (or the index is still empty).</p>
          )}

          {!similarLoading && !similarError && similarEvents.length > 0 && (
            <ul className="ft-event-history-list">
              {similarEvents.map((ev) => {
                const flagIcon = getFlagIcon(ev.topic_tags);
                return (
                  <li
                    key={`${ev.event_id || "noid"}-${ev.timestamp || 0}`}
                    className="ft-event-history-item"
                  >
                    <div className="ft-event-history-main">
                      <span className="ft-event-kind">
                        {flagIcon && <span style={{ marginRight: "0.25rem" }}>{flagIcon}</span>}
                        {ev.kind || "event"}
                      </span>

                      <span className="ft-event-badge-ai">🤖 AI sličnost: {Number(ev.score).toFixed(2)}</span>
                      <span className="ft-event-score">sim: {Number(ev.score).toFixed(3)}</span>
                    </div>

                    <div className="ft-event-history-meta">
                      <span>
                        {ev.timestamp ? new Date(ev.timestamp * 1000).toLocaleString() : "—"}
                      </span>
                      {Array.isArray(ev.topic_tags) && ev.topic_tags.length > 0 && (
                        <span className="ft-event-tags">{ev.topic_tags.join(", ")}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* SAŽETAK TRANSPORTA */}
        {transportSummary && (
          <div className="ft-event-summary">
            <span>
              🚚 Transport events: <strong>{transportSummary.count}</strong>
            </span>
            {transportSummary.avgDelay != null && (
              <span>
                ⏱️ average delay: <strong>{transportSummary.avgDelay.toFixed(1)} min</strong>
              </span>
            )}
            {transportSummary.avgScore != null && (
              <span>
                ⭐ prosječan trust: <strong>{transportSummary.avgScore.toFixed(3)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 🔒 Proof-of-event panel */}
      {(proofLoading || proofError || proofData) && (
        <div className="ft-proof-panel">
          <h4 className="ft-event-history-title">🔒 Proof of event</h4>

          {proofLoading && <p className="ft-event-hint">⏳ Učitavam proof...</p>}
          {proofError && !proofLoading && <p className="ft-event-hint">{proofError}</p>}

          {proofData && !proofLoading && !proofError && (
            <div className="ft-event-proof-body">
              <p><strong>Event ID:</strong> {proofData.event_id}</p>
              <p><strong>Wallet:</strong> {shortenAddress(proofData.source_wallet)}</p>
              <p>
                <strong>Hash:</strong>{" "}
                <code>{proofData.event_hash || "— (legacy event or hash not computed)"}</code>
              </p>
              <p><strong>Quadrant:</strong> {proofData.quadrant_id || "—"}</p>
              <p>
                <strong>Timestamp:</strong>{" "}
                {proofData.timestamp ? new Date(proofData.timestamp * 1000).toLocaleString() : "—"}
              </p>

              <button
                type="button"
                className="ft-dapp-btn-secondary"
                onClick={() => {
                  setProofData(null);
                  setProofError("");
                  setProofLoading(false);
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}




{/* 📜 FLOW OF TIME — Timeline panel */}
{hasQuadrant && (
  <div className="ft-proof-panel">
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <h4 className="ft-event-history-title">📜 Flow of Time</h4>
      <button
        type="button"
        className="ft-dapp-btn-secondary"
        onClick={() => handleShowTimeline(0)}
        disabled={timelineLoading}
      >
        {timelineLoading
          ? "⏳ Loading..."
          : showTimeline
          ? "Hide timeline"
          : "🔗 Show on-chain timeline"}
      </button>
    </div>

    <p className="ft-event-hint">
      Auditabilan vremenski niz — svaki unos je ekonomski zaštićen timestamp na Polygon chainu.
    </p>

    {timelineError && <p className="ft-event-hint">{timelineError}</p>}

    {showTimeline && timelineData && (
      <div>
        {timelineData.entries.length === 0 ? (
          <p className="ft-event-hint">No anchor entries for this quadrant.</p>
        ) : (
          <ul className="ft-event-history-list">
            {timelineData.entries.map((entry, idx) => (
              <li key={idx} className="ft-event-history-item">

                <div className="ft-event-history-main">
                  <span className="ft-event-kind">
                    {entry.event_type === "pin_json" && "📌"}
                    {entry.event_type === "review" && "📝"}
                    {entry.event_type === "oracle_confirm" && "🔮"}
                    {entry.event_type === "mint" && "🪙"}
                    {" "}{entry.event_type}
                  </span>
                  <span className="ft-event-score">
                    blok {entry.block_number}
                  </span>
                </div>

                <div className="ft-event-history-meta">
                  <span>{new Date(entry.timestamp * 1000).toLocaleString()}</span>
                  <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {entry.ipfs_cid.length > 20
                      ? `${entry.ipfs_cid.slice(0, 10)}...${entry.ipfs_cid.slice(-6)}`
                      : entry.ipfs_cid}
                  </span>
                </div>

                <div className="ft-event-history-meta">
                 <a 
                    href={`https://amoy.polygonscan.com/block/${entry.block_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ft-proof-link"
                    title="Pogledaj blok na Polygonscan"
                  >
                    🔗 Polygonscan (blok {entry.block_number})
                  </a>

                  {entry.event_type === "pin_json" && entry.ipfs_cid.startsWith("baf") && (
                   <a 
                      href={entry.ipfs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ft-proof-link"
                    >
                      📦 IPFS sadržaj
                    </a>
                  )}
                </div>

              </li>
            ))}
          </ul>
        )}

              {showTimeline && timelineData && timelineOffset < timelineTotal && (
                <button
                  type="button"
                  className="ft-dapp-btn-secondary"
                  onClick={() => handleShowTimeline(timelineOffset)}
                  disabled={timelineLoading}
                  style={{ marginTop: "0.5rem" }}
                >
                  {timelineLoading
                    ? "⏳ Loading..."
                    : `Load more (${timelineOffset}/${timelineTotal})`}
                </button>
              )}

              <p className="ft-event-hint" style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>


          Powered by GeoquadrantAnchor · Polygon Amoy ·{" "}
          <a
            href="https://amoy.polygonscan.com/address/0x8f94E75597AB449Bd0C3fc580F707994ed9f365E"
            target="_blank"
            rel="noopener noreferrer"
            className="ft-proof-link"
          >
            Contract
          </a>
        </p>
      </div>
    )}
  </div>
)}





      {/* EVENT DETAILS MODAL */}
      {showDetailsModal && selectedEvent && (
        <div className="ft-modal-backdrop" onClick={handleCloseDetails}>
          <div className="ft-modal" onClick={(e) => e.stopPropagation()}>
            <h4 className="ft-modal-title">Event details</h4>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Event ID:</span>
              <span className="ft-modal-value">{selectedEvent.event_id || "—"}</span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Tip (kind):</span>
              <span className="ft-modal-value">{selectedEvent.kind || "—"}</span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Description:</span>
              <span className="ft-modal-value">{selectedEvent.description || "—"}</span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Location:</span>
              <span className="ft-modal-value">{formatLatLon(selectedEvent.lat, selectedEvent.lon)}</span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Quadrant:</span>
              <span className="ft-modal-value">
                {selectedEvent.quadrant_id || activeQuadrant?.tokenId || "—"}
              </span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Subcell / H3:</span>
              <span className="ft-modal-value">
                {selectedEvent.subcell_id || "—"}{" "}
                {selectedEvent.h3_resolution !== null && selectedEvent.h3_resolution !== undefined
                  ? `(H3 res: ${selectedEvent.h3_resolution})`
                  : ""}
              </span>
            </div>

            {onSubcellClick &&
              typeof selectedEvent.lat === "number" &&
              typeof selectedEvent.lon === "number" && (
                <div className="ft-modal-row">
                  <span className="ft-modal-label">Mapa:</span>
                  <span className="ft-modal-value">
                    <button
                      type="button"
                      className="ft-dapp-btn-secondary"
                      onClick={() =>
                        onSubcellClick({
                          lat: selectedEvent.lat,
                          lon: selectedEvent.lon,
                          event_id: selectedEvent.event_id,
                          subcell_id: selectedEvent.subcell_id || null,
                        })
                      }
                    >
                      🧭 Show subcell on map
                    </button>
                  </span>
                </div>
              )}

            <div className="ft-modal-row">
              <span className="ft-modal-label">Vrijeme:</span>
              <span className="ft-modal-value">{formatTimestamp(selectedEvent.timestamp)}</span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Trust score:</span>
              <span className="ft-modal-value">
                {selectedEvent.trust_score != null ? Number(selectedEvent.trust_score).toFixed(3) : "—"}
              </span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Stake (GCD):</span>
              <span className="ft-modal-value">
                {typeof selectedEvent.stake === "number" ? selectedEvent.stake : "—"}
              </span>
            </div>

            {(selectedEvent.vehicle_id ||
              selectedEvent.route_id ||
              selectedEvent.delay_minutes != null ||
              typeof selectedEvent.severity === "number") && (
              <>
                <hr className="ft-modal-separator" />
                <div className="ft-modal-row">
                  <span className="ft-modal-label">Vehicle:</span>
                  <span className="ft-modal-value">{selectedEvent.vehicle_id || "—"}</span>
                </div>
                <div className="ft-modal-row">
                  <span className="ft-modal-label">Route:</span>
                  <span className="ft-modal-value">{selectedEvent.route_id || "—"}</span>
                </div>
                <div className="ft-modal-row">
                  <span className="ft-modal-label">Delay:</span>
                  <span className="ft-modal-value">
                    {typeof selectedEvent.delay_minutes === "number"
                      ? `${selectedEvent.delay_minutes.toFixed(1)} min`
                      : "—"}
                  </span>
                </div>
                <div className="ft-modal-row">
                  <span className="ft-modal-label">Severity:</span>
                  <span className="ft-modal-value">
                    {typeof selectedEvent.severity === "number" ? selectedEvent.severity : "—"}
                  </span>
                </div>
              </>
            )}

            <hr className="ft-modal-separator" />

            <div className="ft-modal-row">
              <span className="ft-modal-label">Tags:</span>
              <span className="ft-modal-value">
                {Array.isArray(selectedEvent.topic_tags) && selectedEvent.topic_tags.length > 0
                  ? selectedEvent.topic_tags.join(", ")
                  : "—"}
              </span>
            </div>

            <div className="ft-modal-row">
              <span className="ft-modal-label">Source wallet:</span>
              <span className="ft-modal-value">{selectedEvent.source_wallet || "—"}</span>
            </div>

            {selectedEvent.event_hash && (
              <div className="ft-modal-row">
                <span className="ft-modal-label">Event hash:</span>
                <span className="ft-modal-value">{selectedEvent.event_hash}</span>
              </div>
            )}

            <div className="ft-modal-actions">
              <button type="button" className="ft-dapp-btn-secondary" onClick={handleCloseDetails}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventForm;

