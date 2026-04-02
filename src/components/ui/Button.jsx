const VARIANT_CLASS = {
  primary: "ui-btn ui-btn--primary",
  secondary: "ui-btn ui-btn--secondary",
  tealGhost: "ui-btn ui-btn--teal-ghost",
  amberGhost: "ui-btn ui-btn--amber-ghost",
};

export default function Button({
  variant = "primary",
  size,
  shimmer = false,
  className = "",
  children,
  ...props
}) {
  const base = VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary;
  const sz = size === "sm" ? " ui-btn--sm" : size === "xs" ? " ui-btn--xs" : "";
  const sh = shimmer ? " ui-btn--shimmer" : "";
  return (
    <button type="button" className={`${base}${sz}${sh} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
