import { useState } from "react";
import ArbCard from "./ArbCard.jsx";
import { ChevronDown, ChevronRight, XCircle } from "lucide-react";

export default function CollapsibleRejectedSection({ arbs, CardComponent = ArbCard }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="collapsible-wrap">
      <button type="button" className="collapsible-trigger" onClick={() => setOpen((o) => !o)}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <XCircle size={13} />
          Rejected ({arbs.length}) — stale / thin / non-executable
        </span>
        <span className="paper-panel-chevron">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      <div className={`collapsible-grid${open ? " is-open" : ""}`}>
        <div className="collapsible-grid-inner">
          <div className="collapsible-body">
            {arbs.map((a, i) => (
              <CardComponent key={`reject-${i}`} a={a} onPaperTrade={null} canPaperTrade={null} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
