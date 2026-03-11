import { useState } from "react";
import ArbCard from "./ArbCard.jsx";
import { FONT } from "../styles.js";

export default function CollapsibleRejectedSection({ arbs, CardComponent = ArbCard }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          padding: "8px 12px",
          background: "#0d0d0d",
          border: "1px solid #2a1a1a",
          borderRadius: 4,
          color: "#c04040",
          fontSize: 11,
          fontFamily: FONT,
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Rejected ({arbs.length}) — stale / thin / non-executable</span>
        <span>{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          {arbs.map((a, i) => (
            <CardComponent key={`reject-${i}`} a={a} onPaperTrade={null} canPaperTrade={null} />
          ))}
        </div>
      )}
    </div>
  );
}
