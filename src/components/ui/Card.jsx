export default function Card({ children, className = "", glass = true, as: Tag = "div", ...props }) {
  const g = glass ? "ui-card ui-card--glass" : "ui-card";
  return (
    <Tag className={`${g} ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
}
