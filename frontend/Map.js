// src/Map.js
// View map with NFT squares
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Rectangle,
  Polygon,
  Popup,
  Tooltip,
  CircleMarker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { ethers } from "ethers";
import GeoQuadrantsAbi from "./abi/GeoQuadrants.json";

import { getQuadrantData, getRpcProvider } from "./web3Config";
import { useWallet } from "./WalletContext";
import UpdateMetadata from "./UpdateMetadata";
import Sidebar from "./Sidebar";
import "./theme.css";
import LoadingSpinner from "./LoadingSpinner";
import Legend from "./Legend";
import EventForm from "./EventForm";

import { polygonToCells, cellToBoundary } from "h3-js";

// const API_BASE = process.env.REACT_APP_API_BASE || "http://10.198.3.166:8000";
// const API_BASE = process.env.REACT_APP_API_BASE;

// ✅ Helper component — must be INSIDE the MapContainer tree
// so that useMap() works
const MapController = ({ mapRef }) => {
  const map = useMap();

  useEffect(() => {
    if (map) {
      mapRef.current = map;
    }
  }, [map, mapRef]);

  return null; // renders nothing visible
};


const ZoomTracker = ({ onZoomChange }) => {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoomChange(map.getZoom());
    map.on("zoomend", handler);
    return () => map.off("zoomend", handler);
  }, [map, onZoomChange]);
  return null;
};

const API_BASE =
  (process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim())
    ? process.env.REACT_APP_API_BASE.trim()
    : (process.env.NODE_ENV === "development" ? "http://localhost:8010" : "/api");

if (!API_BASE) {
  console.error("API_BASE is empty. Set REACT_APP_API_BASE and restart.");
}


// GeoQuadrants (Amoy for now)
// const QUADRANTS_ADDRESS =  process.env.REACT_APP_QUADRANTS_ADDRESS ||  "0x4542FBcD0b384F843d989732448295bCDa116422";
const QUADRANTS_ADDRESS =  process.env.REACT_APP_QUADRANTS_ADDRESS ||  "0x1421C0dd6D962fb5c5A29340C74bEE66AdA60BFb"; // ✅ new


// Set to an approximate deploy/mint start block
// const DEPLOY_FROM_BLOCK = 32570000;
const DEPLOY_FROM_BLOCK = Number(process.env.REACT_APP_DEPLOY_FROM_BLOCK || "32570000");

// ✅ DEBUG_TOKEN_IDS and LOG_SCAN_STEP removed — eth_getLogs browser scanning
// is no longer used; quadrants are read from GET /quadrants (backend MySQL index).


const GRID_LAT_CELLS = 5;
const GRID_LON_CELLS = 5;

// GeoQuadrants.sol constants (poles)
const SPECIAL_RESOLUTION = 255n;
const NORTH_POLE_ID = 1n;
const SOUTH_POLE_ID = 2n;

const NORTH_POLE_TOKEN_ID = ((SPECIAL_RESOLUTION << 64n) | NORTH_POLE_ID).toString();
const SOUTH_POLE_TOKEN_ID = ((SPECIAL_RESOLUTION << 64n) | SOUTH_POLE_ID).toString();


function decodeTokenId(tokenIdLike) {
  const tid = ethers.toBigInt(tokenIdLike);
  const resolution = tid >> 64n;
  const mask64 = (1n << 64n) - 1n;
  const cellId = tid & mask64;
  return { resolution, cellId, tokenId: tid };
}

function decodeL0CellIdToLatLon10(cellIdBig) {
  const cid = ethers.toBigInt(cellIdBig);
  const latIdx = cid / 1000n;
  const lonIdx = cid % 1000n;
  const lat = Number(latIdx) * 10 - 80;
  const lon = Number(lonIdx) * 10 - 180;
  return { lat, lon };
}

function isPole(decoded) {
  return (
    decoded.resolution === SPECIAL_RESOLUTION &&
    (decoded.cellId === NORTH_POLE_ID || decoded.cellId === SOUTH_POLE_ID)
  );
}

function poleLatLon(decoded) {
  if (!isPole(decoded)) return null;
  return decoded.cellId === NORTH_POLE_ID
    ? { lat: 90, lon: 0 }
    : { lat: -90, lon: 0 };
}

// ✅ Web Mercator (EPSG:3857, Leaflet default CRS) cannot mathematically
// render lat = ±90 — the projection goes to infinity and the marker disappears
// silently. This function is used ONLY for rendering (marker center, setView),
// never for actual data/metadata — q.lat stays -90/90 everywhere else.
const MAX_SAFE_LAT = 85.05112878; // standardni Web Mercator limit
function toDisplayLat(lat) {
  return Math.max(-MAX_SAFE_LAT, Math.min(MAX_SAFE_LAT, lat));
}

const MapComponent = () => {
  const { walletAddress } = useWallet();  //read from global context
  const [quadrants, setQuadrants] = useState([]); // L0 quadrants
  const [specials, setSpecials] = useState([]); // poles and special tokens
  const [activeQuadrant, setActiveQuadrant] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState(null); // string token ID
  // const [walletAddress, setWalletAddress] = useState(null);
  const [highlightedQuadrant, setHighlightedQuadrant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState("All");
  const [searchedQuadrant, setSearchedQuadrant] = useState(null);
  // const [hoveredQuadrant, setHoveredQuadrant] = useState(null);
  const [quadrantStats, setQuadrantStats] = useState({});

  const [eventLocation, setEventLocation] = useState(null);
  const [hoveredEventLocation, setHoveredEventLocation] = useState(null);

  // ✅ Subcell overlay state (one layer at a time)
  const [hoverSubcellPoly, setHoverSubcellPoly] = useState(null); // { polygon: [[lat,lon],...], subcell_id, quadrant_id }
  const [pinnedSubcellPoly, setPinnedSubcellPoly] = useState(null); // pinned subcell

  const [selectedSubcell, setSelectedSubcell] = useState(null);
  const [isLoadingSubcell, setIsLoadingSubcell] = useState(false);

  // Info text for selected quadrant
  const [selectionInfo, setSelectionInfo] = useState(null);

  const mapRef = useRef(null);

  const handleQuadrantClick = (q) => {
    setActiveQuadrant(q);
    // setSearchedQuadrant(q);
    setSelectedTokenId(String(q.tokenId));
  };

  // Read-only provider (does NOT require MetaMask)
  const readProvider = useMemo(() => getRpcProvider(), []);

  const loadMintedQuadrants = async () => {
    setLoading(true);

    try {
      // ✅ Umjesto eth_getLogs skena (neupotrebljivo na Alchemy Free tier —
      // 10-block limit per call for Polygon), reading directly from the backend
      // MySQL index (quadrants_minted), populated via mint scripts /
      // indexer/run endpoint.
      const res = await fetch(`${API_BASE}/quadrants?limit=20000`);
      if (!res.ok) {
        throw new Error(`GET /quadrants -> ${res.status}`);
      }
      const data = await res.json();
      const rows = data?.items || [];

      console.log(`[Map] /quadrants returned ${rows.length} quadrants (total=${data?.total})`);

      if (rows.length === 0) {
        setQuadrants([]);
        setSpecials([]);
        return;
      }

      // Fetch IPFS metadata (name/description/attributes) in small
      // batches — avoids firing hundreds of parallel
      // requests to the IPFS gateway/backend proxy at once.
      const CONCURRENCY = 20;
      const results = [];
      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const batch = rows.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (row) => {
            try {
              const tokenId = String(row.token_id);
              const resolution = Number(row.resolution);
              const cellId = String(row.cell_id);
              const lat = Number(row.lat);
              const lon = Number(row.lon);

              // quadrants_minted (fast DB index) does not store metadata_hash —
              // for that we fetch the full object from chain (ownerOf + quadrants()
              // + IPFS metadata), with DB values as fallback if this
              // fails (e.g. temporary RPC hiccup).
              let q = null;
              try {
                q = await getQuadrantData(tokenId);
              } catch (e) {
                console.warn("[Map] getQuadrantData failed for", tokenId, e);
              }

              return {
                ...q,
                tokenId,
                lat: q?.lat ?? lat,
                lon: q?.lon ?? lon,
                resolution: String(resolution),
                cellId,
                owner: q?.owner || row.owner_wallet,
                _isPole: resolution === 255,
              };
            } catch (err) {
              console.warn("[Map] failed to process minted row:", row, err);
              return null;
            }
          })
        );
        results.push(...batchResults);
      }

      // Split: L0 (10°) + specials (poles)
      const all = results.filter(Boolean);
      const sp = all.filter((q) => String(q.resolution) !== "0");

      setQuadrants(all);
      setSpecials(sp);
    } catch (err) {
      console.error("[Map] loadMintedQuadrants error:", err);
      setQuadrants([]);
      setSpecials([]);
    } finally {
      setLoading(false);
    }
  };

const [mapZoom, setMapZoom] = useState(2);

useEffect(() => {
  loadMintedQuadrants();
}, []);
/*
  // ✅ Ne pozivamo connectWallet() automatski —
  // silently read already active accounts from MetaMask
  // without any popup (eth_accounts does not require permission)
  if (window.ethereum) {
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts && accounts.length > 0) {
          // ✅ MetaMask already has an active account —
          // set it without a popup
          setWalletAddress(accounts[0]);
        }
        // ako nema aktivnih accounta — walletAddress ostaje null
        // user decides when to connect
      })
      .catch((err) => {
        console.warn("[Map] eth_accounts check failed:", err);
      });
  }
}, []);
*/


  // Event summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch(`${API_BASE}/events/summary`);
        if (!res.ok) {
          console.error("GET /events/summary error:", await res.text());
          return;
        }
        const data = await res.json();
        const byQid = {};
        data.forEach((row) => {
          byQid[String(row.quadrant_id)] = {
            event_count: row.event_count,
            avg_trust: row.avg_trust,
          };
        });
        setQuadrantStats(byQid);
      } catch (err) {
        console.error("GET /events/summary exception:", err);
      }
    };

    fetchSummary();
  }, []);

  // --- helper: coerce backend response to a polygon ---
  const coerceSubcellPolygon = (data) => {
    // expected: data.polygon = [[lat, lon], ...]
    const poly = Array.isArray(data?.polygon) ? data.polygon : null;
    if (poly && poly.length >= 3) return poly;

    // fallback: bbox -> polygon (if backend still returns lat_min/lat_max/lon_min/lon_max)
    const latMin = data?.lat_min,
      latMax = data?.lat_max;
    const lonMin = data?.lon_min,
      lonMax = data?.lon_max;
    if (
      typeof latMin === "number" &&
      typeof latMax === "number" &&
      typeof lonMin === "number" &&
      typeof lonMax === "number"
    ) {
      return [
        [latMin, lonMin],
        [latMin, lonMax],
        [latMax, lonMax],
        [latMax, lonMin],
      ];
    }
    return null;
  };

  // --- fetch subcell geometry for a point (lat/lon) ---
  const fetchSubcellGeometry = async (lat, lon) => {
    if (!API_BASE) return null;
    try {
      const url = `${API_BASE}/geo/subcell_for_point?lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lon)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const polygon = coerceSubcellPolygon(data);
      if (!polygon) return null;
      return {
        polygon,
        subcell_id: data?.subcell_id || null,
        quadrant_id: data?.quadrant_id || null,
      };
    } catch (e) {
      return null;
    }
  };

  // --- loading subcell for click
  const loadSubcellForClick = async (lat, lon) => {
    setIsLoadingSubcell(true);
    try {
      const g = await fetchSubcellGeometry(lat, lon);
      if (g) {
        setSelectedSubcell({
          ...g,
          lat,
          lon,
        });

     setSelectionInfo({
       source: "click",
       lat,
       lon,
       quadrantLabel: g.quadrant_id || null, // backend geo quadrant (exmpl. Q_40_10)
     });
 
      } else {
        setSelectedSubcell(null);
        setSelectionInfo({
          source: "click",
          lat,
          lon,
          quadrantLabel: null,
        });
      }
    } catch (err) {
      console.error("[Map] loadSubcellForClick error:", err);
      setSelectedSubcell(null);
    } finally {
      setIsLoadingSubcell(false);
    }
  };



// --- hover: draw a temporary subcell polygon (with debounce + cancel) ---
useEffect(() => {
  let cancelled = false;

  // ✅ no valid location — clear immediately and exit
  if (
    !hoveredEventLocation ||
    typeof hoveredEventLocation.lat !== "number" ||
    typeof hoveredEventLocation.lon !== "number"
  ) {
    setHoverSubcellPoly(null);
    return;
  }

  // ✅ debounce: wait 250ms before API call
  // if user scrolls the list quickly, the timer resets
  // and the API call is NOT sent until the user pauses
  const timer = setTimeout(async () => {
    const g = await fetchSubcellGeometry(
      hoveredEventLocation.lat,
      hoveredEventLocation.lon
    );
    // ✅ if user already left that event — do not update state
    if (!cancelled) setHoverSubcellPoly(g);
  }, 250);

  // ✅ cleanup: poziva se kad se hoveredEventLocation promijeni
  // ili kad se komponenta unmountuje
  // — clears the timer (debounce reset) and sets cancelled=true
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [hoveredEventLocation]);


  // ✅ functions passed down to EventForm (subcell click handlers)
  const pinSubcellForPoint = async (lat, lon) => {
    const g = await fetchSubcellGeometry(lat, lon);
    setPinnedSubcellPoly(g);
  };
  const clearPinnedSubcell = () => setPinnedSubcellPoly(null);

  const openModal = () => {
    if (!selectedTokenId) return;
    setModalOpen(true);
  };

  // Coordinate search — L0 grid only
  const searchByCoordinates = async (lat, lon) => {
    const gridLat = Math.floor(lat / 10) * 10;
    const gridLon = Math.floor(lon / 10) * 10;

    const found = quadrants.find((q) => q && q.lat === gridLat && q.lon === gridLon);

    // 1) Poles: accept both 90/-90 and 80/-80 (your contract uses 80/-80)
    if (lat >= 80) {
      const foundPole = quadrants.find((q) => String(q.tokenId) === NORTH_POLE_TOKEN_ID);
      if (foundPole) {
        setEventLocation(null);
        setSelectedSubcell(null);
 
        setHighlightedQuadrant(foundPole);
        setSearchedQuadrant(foundPole);
        setActiveQuadrant(foundPole);
        setSelectedTokenId(String(foundPole.tokenId));
        mapRef.current?.setView([toDisplayLat(90), 0], 2);
        return;
      }
    }

    if (lat <= -80) {
      const foundPole = quadrants.find((q) => String(q.tokenId) === SOUTH_POLE_TOKEN_ID);
      if (foundPole) {
        setEventLocation(null);
        setSelectedSubcell(null);

        setHighlightedQuadrant(foundPole);
        setSearchedQuadrant(foundPole);
        setActiveQuadrant(foundPole);
        setSelectedTokenId(String(foundPole.tokenId));
        mapRef.current?.setView([toDisplayLat(-90), 0], 2);
        return;
      }
    }

    if (found) {
      setHighlightedQuadrant(found);
      setSearchedQuadrant(found);
      setActiveQuadrant(found);
      setSelectedTokenId(String(found.tokenId));

      // ✅ store the exact searched coordinate (not the quadrant centre)
      setEventLocation({ lat, lon });

      // ✅ load H3 subcell for the exact searched coordinate
      await loadSubcellForClick(lat, lon);
      
       setSelectionInfo((prev) => ({
         ...(prev || {}),
         source: "search",
         lat,
         lon,
       }));
       // if (mapRef.current) {
       //  mapRef.current.setView([found.lat + 5, found.lon + 5], 5);
       // }

      // ✅ pan map to the exact point (higher zoom to show marker/polygon)
      if (mapRef.current) {
        mapRef.current.setView([lat, lon], 8);
      }
    } else {
      console.warn("No quadrant found for coordinates:", lat, lon);
      setHighlightedQuadrant(null);
      setSearchedQuadrant(null);
    }
  };


const getHeatStyle = (eventCount, avgTrust) => {
  if (!eventCount || eventCount <= 0 || avgTrust == null) {
    return {
      fillColor: "#111827",
      fillOpacity: 0.15,
      weight: 0.6,
      opacity: 0.45,
      color: "#4b5563",  // ✅ corrected
    };
  }

  let baseColor = "#22c55e";
  if (avgTrust < 0.25) baseColor = "#ef4444";
  else if (avgTrust < 0.5) baseColor = "#f97316";
  else if (avgTrust < 0.75) baseColor = "#eab308";

  const clampedCount = Math.min(eventCount, 10);
  const opacity = 0.25 + (clampedCount / 10) * 0.45;

  return {
    fillColor: baseColor,
    fillOpacity: opacity,
    weight: 1,
    color: "#0f172a",  // ✅ corrected
  };
};


  // DEBUG (add here if needed)
  // console.log("[MAP DEBUG] eventLocation=", eventLocation);
  // console.log("[MAP DEBUG] selectedSubcell=", selectedSubcell);


  return (
    <div className="ft-map-layout">
      <Sidebar
        onCoordinateSearch={searchByCoordinates}
        // walletAddress={walletAddress}
        onRefresh={() => window.location.reload()}
        selectionInfo={selectionInfo}
      />

      <div className="ft-map-main">
        <div className="ft-map-filter">
          <label htmlFor="regionFilter">📂 Region filter:</label>
          <select
            id="regionFilter"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="All">All</option>
            <option value="Urban">Urban</option>
            <option value="Rural">Rural</option>
            <option value="Coastal">Coastal</option>
            <option value="Mountainous">Mountainous</option>
            <option value="Polar">Polar</option>
            <option value="Ocean">Ocean</option>
            <option value="Unknown">Unknown</option>
          </select>

          <button
            type="button"
            className="ft-dapp-btn-secondary"
            style={{ marginLeft: "0.8rem" }}
            onClick={loadMintedQuadrants}
          >
            🔄 Reload quadrants
          </button>
        </div>

        <div className="ft-map-frame">
          {loading ? (
            <LoadingSpinner />
          ) : (
            
            
          <MapContainer
            center={[5, 5]}
            zoom={2}
            style={{ height: "100%", width: "100%" }}
           // ✅ whenCreate is erased
           >
            <MapController mapRef={mapRef} />  {/* ✅ added as first child */}
            <ZoomTracker onZoomChange={setMapZoom} />

              <Legend />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href=https://www.openstreetmap.org/copyright>OSM</a> contributors'
              />

              {/* ✅ POLES / SPECIAL TOKENS */}
              {specials
                .filter((q) => {
                  const regionType =
                    q.metadata?.attributes?.regionType ??
                    q.metadata?.attributes?.["Tip regiona"] ??
                    (q._isPole ? "Polar" : "Unknown");
                  return regionFilter === "All" || regionType === regionFilter;
                })
                .map((q) => {
                  const desc =
                    q.metadata?.description ?? q.metadata?.Opis ?? "No description";
                  const region =
                    q.metadata?.attributes?.regionType ??
                    q.metadata?.attributes?.["Tip regiona"] ??
                    (q._isPole ? "Polar" : "Unknown");

                  // ✅ Polar cap rendered as a band across the full map width —
                  // Web Mercator cannot show meridian convergence toward the pole,
                  // so the cap is displayed as a strip from ±80° to the map edge
                  // (same convention used by standard web maps for Antarctica).
                  const isSouth = q.lat < 0;
                  const capBounds = isSouth
                    ? [
                        [toDisplayLat(-90), -180], // clamped southern edge
                        [-80, 180],                 // northern edge of cap (grid boundary)
                      ]
                    : [
                        [80, -180],                  // southern edge of cap (grid boundary)
                        [toDisplayLat(90), 180],    // clamped northern edge
                      ];

                  return (
                    <React.Fragment key={`special-${q.tokenId}`}>
                      <Rectangle
                        bounds={capBounds}
                        pathOptions={{
                          color: "#06b6d4",
                          weight: 1,
                          fillColor: "#06b6d4",
                          fillOpacity: 0.15,
                        }}
                        eventHandlers={{
                          click: () => {
                            handleQuadrantClick(q);
                            setEventLocation(null);
                            if (mapRef.current) {
                              mapRef.current.setView([toDisplayLat(q.lat), q.lon], 3);
                            }
                          },
                        }}
                      >
                        <Tooltip sticky>
                          {isSouth ? "South Pole" : "North Pole"} — token #{q.tokenId}
                        </Tooltip>
                      </Rectangle>
                    <CircleMarker
                      center={[toDisplayLat(q.lat), q.lon]}
                      radius={8}
                      pathOptions={{
                        color: "#ffffff",
                        weight: 2,
                        fillColor: "#06b6d4",
                        fillOpacity: 0.85,
                      }}
                      eventHandlers={{
                        // mouseover: () => setHoveredQuadrant(q),
                        // mouseout: () => setHoveredQuadrant(null),
                        click: () => {
                          // setSearchedQuadrant(null); // reset search highlight
                          handleQuadrantClick(q);
                          setEventLocation(null); // no "subcells" for poles
                          if (mapRef.current) {
                            mapRef.current.setView([toDisplayLat(q.lat), q.lon], 3);
                          }
                        },
                      }}
                    >
                      <Popup>
                        <strong>🧊 Pole / Special</strong>
                        <br />
                        <strong>📍 Location:</strong> ({q.lat}, {q.lon})
                        <br />
                        <strong>🧬 Token ID:</strong> {String(q.tokenId)}
                        <br />
                        <strong>🧩 Resolution:</strong> {String(q.resolution)}
                        <br />
                        <strong>🆔 Cell ID:</strong> {String(q.cellId)}
                        <br />
                        <strong>📜 Description:</strong> {desc}
                        <br />
                        <strong>🧭 Region type:</strong> {region}
                      </Popup>
                        {/*
                        {activeQuadrant?.tokenId === q.tokenId && (
                         <Tooltip sticky>
                             <div>
                             <strong>🧊 Pole / Special</strong>
                             <br />
                              <strong>📍 Location:</strong> ({q.lat}, {q.lon})
                              <br />
                             <strong>🧬 Token:</strong> {String(q.tokenId)}
                             <br />
                             <strong>📜 Description:</strong> {desc}
                           </div>
                         </Tooltip>
                       )}
                       */}
                    </CircleMarker>
                    </React.Fragment>
                  );
                })}



              {/* ✅ L0 QUADRANTS */}
              {(quadrants || [])
                .filter((q) => String(q.resolution) === "0")
                .filter((q) => {
                  const regionType =
                    q.metadata?.attributes?.regionType ??
                    q.metadata?.attributes?.["Tip regiona"] ??
                    "Unknown";
                  return regionFilter === "All" || regionType === regionFilter;
                })
                .map((q, index) => {
                  const stats = quadrantStats[String(q.tokenId)] || {
                    event_count: 0,
                    avg_trust: null,
                  };

                  const heatStyle = getHeatStyle(stats.event_count, stats.avg_trust);

                  const latStep = 10 / GRID_LAT_CELLS;
                  const lonStep = 10 / GRID_LON_CELLS;
                  const subCells = [];

                  for (let i = 0; i < GRID_LAT_CELLS; i++) {
                    for (let j = 0; j < GRID_LON_CELLS; j++) {
                      const south = q.lat + i * latStep;
                      const north = q.lat + (i + 1) * latStep;
                      const west = q.lon + j * lonStep;
                      const east = q.lon + (j + 1) * lonStep;

                      const isHighlighted =
                        activeQuadrant?.tokenId === q.tokenId &&
                        hoveredEventLocation &&
                        hoveredEventLocation.lat >= south &&
                        hoveredEventLocation.lat <= north &&
                        hoveredEventLocation.lon >= west &&
                        hoveredEventLocation.lon <= east;

                      subCells.push(
                        <Rectangle
                          key={`sub-${q.tokenId}-${i}-${j}`}
                          bounds={[
                            [south, west],
                            [north, east],
                          ]}
                          pathOptions={{
                            weight: isHighlighted ? 2 : 0.3,
                            color: isHighlighted ? "#f97316" : "#4b5563",
                            fillOpacity: isHighlighted ? 0.3 : 0.01,
                            fillColor: isHighlighted ? "#fb923c" : "#0f172a",
                          }}
                          interactive={false}
                        />
                      );
                    }
                  }

                  const desc = q.metadata?.description ?? q.metadata?.Opis ?? "No description";
                  const region =
                    q.metadata?.attributes?.regionType ??
                    q.metadata?.attributes?.["Tip regiona"] ??
                    "Unknown";

                  return (
                    <React.Fragment key={q.tokenId || index}>
                      <Rectangle
                        bounds={[
                          [q.lat, q.lon],
                          [q.lat + 10, q.lon + 10],
                        ]}
                        pathOptions={{
                          fillColor: heatStyle.fillColor,
                          fillOpacity: heatStyle.fillOpacity,
                          weight: heatStyle.weight,
                          color:
                            searchedQuadrant?.tokenId === q.tokenId
                              ? "#ef4444"
                              : activeQuadrant?.tokenId === q.tokenId
                              ? "#3b82f6"
                              : heatStyle.strokeColor,
                        }}
                        eventHandlers={{



                        click: async (e) => {
                          // ✅ map click: clear the search highlight
                          setSearchedQuadrant(null);
                          setHighlightedQuadrant(null);

                          handleQuadrantClick(q);

                          // reset old subcell before loading the new one
                          setSelectedSubcell(null);

                          if (e && e.latlng) {
                            const lat = e.latlng.lat;
                            const lon = e.latlng.lng;

                            setEventLocation({ lat, lon });

                           // ✅ load H3 subcell for the clicked point
                           await loadSubcellForClick(lat, lon);
                           } else {
                             setEventLocation(null);
                             setSelectedSubcell(null);
                               }
                             },

                           }}
                      >
                        <Popup>
                          <strong>🌍 Location:</strong> ({q.lat}, {q.lon})
                          <br />
                          <strong>🧬 Token ID:</strong> {String(q.tokenId)}
                          <br />
                          <strong>🧩 Resolution:</strong> {String(q.resolution)}
                          <br />
                          <strong>🆔 Cell ID:</strong> {String(q.cellId)}
                          <br />
                          <strong>📊 Events:</strong> {stats.event_count || 0}{" "}
                          {stats.avg_trust != null && (
                            <>
                              {" "}
                              | avg trust:{" "}
                              {stats.avg_trust.toFixed
                                ? stats.avg_trust.toFixed(3)
                                : stats.avg_trust}
                            </>
                          )}
                          <br />
                          <strong>📜 Description:</strong> {desc}
                          <br />
                          <strong>🧭 Region type:</strong> {region}
                        </Popup>
       
                      </Rectangle>

                      {activeQuadrant?.tokenId === q.tokenId && subCells}

                      {activeQuadrant?.tokenId === q.tokenId && mapZoom >= 5 && (() => {
                         // Generate H3 hexagons for this quadrant
                          const h3Res = mapZoom >= 7 ? 4 : 3; // higher zoom = finer resolution
                          const bbox = [
                           [q.lat, q.lon],
                           [q.lat, q.lon + 10],
                           [q.lat + 10, q.lon + 10],
                           [q.lat + 10, q.lon],
                           [q.lat, q.lon],
                          ];
                          const cells = polygonToCells(
                            bbox.map(([lat, lon]) => [lat, lon]),
                            h3Res
                          );

                       return cells.map((cell) => {
                       const boundary = cellToBoundary(cell);
                       return (
                        <Polygon
                         key={cell}
                         positions={boundary}
                         pathOptions={{
                          color: "#06b6d4",
                          weight: 1,
                          fillColor: "#06b6d4",
                          fillOpacity: 0.08,
                         }}
                        eventHandlers={{
                         click: async (e) => {
                         const lat = e.latlng.lat;
                         const lon = e.latlng.lng;
                         setEventLocation({ lat, lon });
                         await loadSubcellForClick(lat, lon);
                        }
                      }}
                    />
                  );
                });
                })()}

                   {activeQuadrant?.tokenId === q.tokenId && mapZoom >= 5 && (() => {
                    // Generate H3 hexagons for this quadrant
                      const h3Res = mapZoom >= 7 ? 4 : 3; // higher zoom = finer resolution
                      const bbox = [
                       [q.lat, q.lon],
                       [q.lat, q.lon + 10],
                       [q.lat + 10, q.lon + 10],
                       [q.lat + 10, q.lon],
                       [q.lat, q.lon],
                      ];
                      const cells = polygonToCells(
                        bbox.map(([lat, lon]) => [lat, lon]),
                        h3Res
                      );

                     return cells.map((cell) => {
                       const boundary = cellToBoundary(cell);
                        return (
                         <Polygon
                         key={cell}
                         positions={boundary}
                         pathOptions={{
                           color: "#06b6d4",
                           weight: 1,
                           fillColor: "#06b6d4",
                           fillOpacity: 0.08,
                         }}
                         eventHandlers={{
                          click: async (e) => {
                           const lat = e.latlng.lat;
                           const lon = e.latlng.lng;
                           setEventLocation({ lat, lon });
                           await loadSubcellForClick(lat, lon);
                          }
                        }}
                      />
                    );
                  });
                })()}

                    </React.Fragment>
                  );
                })}


                {highlightedQuadrant && (
                  <Rectangle
                    bounds={[
                      [highlightedQuadrant.lat, highlightedQuadrant.lon],
                      [highlightedQuadrant.lat + 10, highlightedQuadrant.lon + 10],
                    ]}
                     pathOptions={{ color: "red", weight: 2 }}
                    interactive={false}   // ✅ does not block clicks
                  >
                    {/* if necessary return  Tooltip;  UX is at this moment without Tooltip */}
                    {/*
                     <Tooltip sticky>
                       <div>
                         <strong>📍 Location:</strong> ({highlightedQuadrant.lat},{" "}
                         {highlightedQuadrant.lon})
                         <br />
                         <strong>Token:</strong> {String(highlightedQuadrant.tokenId)}
                         <br />
                          <strong>Description:</strong>{" "}
                          {highlightedQuadrant.metadata?.description ??
                              highlightedQuadrant.metadata?.Opis ??
                           "N/A"}
                        </div>
                      </Tooltip>
                     */}
                   </Rectangle>
                  )}




              {/* F) Marker/point of mouse click */}
              {eventLocation &&
                typeof eventLocation.lat === "number" &&
                typeof eventLocation.lon === "number" && (
                  <CircleMarker
                    center={[eventLocation.lat, eventLocation.lon]}
                    radius={5}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 2,
                      fillColor: "#ef4444",
                      fillOpacity: 1,
                     }}
                    >
                   <Popup>
                     <div>
                     <strong>📌Click point</strong>
                     <br />
                         Lat: {eventLocation.lat.toFixed(6)}
                     <br />
                      Lon: {eventLocation.lon.toFixed(6)}
                     </div>
                    </Popup>
                    </CircleMarker>
                   )}




              {/* ✅ Selected H3 subcell polygon (on click) */}
              {selectedSubcell?.polygon && (
                <Polygon
                  positions={selectedSubcell.polygon}
                  pathOptions={{
                    color: "#22c55e",
                    weight: 3,
                      fillColor: "#22c55e",
                      fillOpacity: 0.12,
                   }}
                  >
                   <Popup>
                     <div>
                       <strong>🧩 H3 subcell</strong>
                       <br />
                       <strong>ID:</strong> {selectedSubcell.subcell_id || "N/A"}
                       <br />
                       <strong>Quadrant:</strong> {selectedSubcell.quadrant_id || "N/A"}
                       <br />
                       <strong>Click point:</strong>{" "}
                       {typeof selectedSubcell.lat === "number" && typeof selectedSubcell.lon === "number"
                         ? `(${selectedSubcell.lat.toFixed(6)}, ${selectedSubcell.lon.toFixed(6)})`
                         : "N/A"}
                       </div>
                 </Popup>
                </Polygon>
              )}


              {/* ✅ Hover subcell polygon — appears when user hovers over an event in the list */}
                {hoverSubcellPoly?.polygon && (
                <Polygon
                   positions={hoverSubcellPoly.polygon}
                   pathOptions={{
                   color: "#f97316",       // orange — visually distinct from click polygon (green)
                   weight: 2,
                   fillColor: "#f97316",
                   fillOpacity: 0.08,      // very transparent — just a hint
                   dashArray: "4 4",       // dashed line = "hover, not selected"
                   }}
                  />
                )}


              <UpdateMetadata
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                tokenId={selectedTokenId}
              />
            </MapContainer>
          )}

      
        </div>


        {activeQuadrant && (
          <div
            style={{
              marginTop: "0.8rem",
              marginBottom: "0.8rem",
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <button type="button" className="ft-dapp-btn-primary" onClick={openModal}>
              ✏️ Update quadrant metadata
            </button>
          </div>
        )}

        <EventForm
          activeQuadrant={activeQuadrant}
          eventLocation={eventLocation}
          onEventHover={(loc) => setHoveredEventLocation(loc)}
          onEventLeave={() => setHoveredEventLocation(null)}
        />
      </div>
    </div>
  );
};

export default MapComponent;

