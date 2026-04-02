export default function MetricCard({ label, value, valueColor, progress, progressTone = "accent" }) {
  const tone =
    progressTone === "amber" ? " is-amber" : progressTone === "muted" ? " is-muted" : "";
  return (
    <div className="metric-ribbon-item">
      <div className="metric-ribbon-label">{label}</div>
      <div className="metric-ribbon-value font-data" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      {progress != null && Number.isFinite(progress) && (
        <div className="metric-ribbon-bar">
          <div className={`metric-ribbon-bar-fill${tone}`} style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
        </div>
      )}
    </div>
  );
}
