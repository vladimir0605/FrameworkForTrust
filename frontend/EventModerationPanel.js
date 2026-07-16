// frontend/EventModerationPanel.js
import React, { useState } from "react";
import { useWallet } from "./WalletContext";


function EventModerationPanel({ apiBase }) {
  const { walletAddress: wallet, authToken } = useWallet(); // ✅ from context

  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("approved");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setMessage("");

    if (!eventId) {
      setMessage("⚠️ Enter the event_id to moderate.");
      return;
    }

    // ✅ wallet comes from context — no localStorage
    if (!wallet) {
      setMessage("⚠️ Wallet not connected. Use the GCD Wallet panel to connect first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/events/${encodeURIComponent(eventId)}/moderation`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`, // ✅
            "X-Wallet-Address": wallet, // same header name as on backend
          },
          body: JSON.stringify({
            moderation_status: status,
            moderation_reason: reason || null,
            moderator_wallet: wallet,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("Moderation error:", res.status, text);

        if (res.status === 401) {
          setMessage("❌ 401: Wallet not recognised (check X-Wallet-Address).");
        } else if (res.status === 403) {
          setMessage("❌ 403: You do not have permission to moderate this event.");
        } else if (res.status === 404) {
          setMessage("❌ 404: Event not found.");
        } else {
          setMessage(`❌ Server error: ${res.status}`);
        }
        return;
      }

      const data = await res.json();
      setMessage(
        `✅ Saved — status: ${data.moderation_status}, moderator: ${data.moderated_by_wallet}`
      );
    } catch (err) {
      console.error("Moderation exception:", err);
      setMessage("❌ Could not send request. Check your connection or backend status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ft-moderation-panel">
      <h3>Event moderation (beta)</h3>

      <p className="ft-moderation-hint">
        Here you can manually mark an event as <b>approved</b>, <b>flagged</b>,{" "}
        <b>rejected</b> or <b>spam</b>.
      </p>

      {/*
        Admin hint: this panel is only meaningful for accounts with the roles
        system_admin or quadrant_moderator.
        Other users will receive 403 Forbidden from the backend.
      */}

      <div className="ft-field-row">
        <label>event_id</label>
        <input
          type="text"
          value={eventId}
          onChange={(e) => setEventId(e.target.value.trim())}
          placeholder="e.g. evt_1764940282_1"
        />
      </div>

      <div className="ft-field-row">
        <label>Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {/* status names aligned with backend contract */}
          <option value="approved">approved</option>
          <option value="under_review">under_review</option>
          <option value="flagged_spam">flagged_spam</option>
          <option value="flagged_suspicious">flagged_suspicious</option>
          <option value="rejected_false">rejected_false</option>
          <option value="hidden_private">hidden_private</option>
        </select>
      </div>

      <div className="ft-field-row">
        <label>Reason (optional)</label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Brief explanation why this event is being moderated..."
        />
      </div>

      <button
        type="button"
        className="ft-dapp-btn"
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? "Saving..." : "Save"}
      </button>

      {message && <p className="ft-moderation-msg">{message}</p>}
    </div>
  );
}

export default EventModerationPanel;
