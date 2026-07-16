// frontend/Legend.js
// color display - design
import React from "react";

const EventLegend = () => {
  const boxStyle = {
    position: "absolute",
    bottom: "12px",
    right: "12px",
    zIndex: 1000,
    padding: "8px 12px",
    borderRadius: "10px",
    backgroundColor: "rgba(15, 23, 42, 0.9)", // dark , like other UI
    color: "#e5e7eb",
    fontSize: "12px",
    border: "1px solid rgba(148, 163, 184, 0.6)",
    boxShadow: "0 8px 18px rgba(0,0,0,0.5)",
    pointerEvents: "none" // no block zoom/drag mape
  };

  const titleStyle = {
    fontWeight: 600,
    marginBottom: "4px",
  };

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "2px",
  };

  const colorBox = (bg) => ({
    width: "12px",
    height: "12px",
    borderRadius: "3px",
    backgroundColor: bg,
    border: "1px solid rgba(15,15,15,0.8)",
    flexShrink: 0,
  });

  return (
    <div style={boxStyle}>
      <div style={titleStyle}>Event / trust legend</div>

      <div style={rowStyle}>
        <span style={colorBox("#22c55e")} />
        <span>High trust (avg ≥ 0.75)</span>
      </div>

      <div style={rowStyle}>
        <span style={colorBox("#eab308")} />
        <span>Medium trust (0.5 – 0.75)</span>
      </div>

      <div style={rowStyle}>
        <span style={colorBox("#f97316")} />
        <span>Low-medium trust (0.25 – 0.50)</span>
      </div>


      <div style={rowStyle}>
        <span style={colorBox("#ef4444")} />
        <span>Low trust (avg &lt; 0.25)</span>
      </div>

      <div style={rowStyle}>
        <span style={colorBox("#111827")} />
        <span>No events</span>
      </div>
    </div>
  );
};

export default EventLegend;

