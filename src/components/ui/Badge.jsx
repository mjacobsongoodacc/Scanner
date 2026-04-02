const VARIANT = {
  actionable: "ui-badge--actionable",
  monitor: "ui-badge--monitor",
  reject: "ui-badge--rejected",
  rejected: "ui-badge--rejected",
  neutral: "ui-badge--neutral",
};

export default function Badge({ variant = "neutral", children, className = "" }) {
  const v = VARIANT[variant] ?? VARIANT.neutral;
  return <span className={`ui-badge ${v} ${className}`.trim()}>{children}</span>;
}
