export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const MONO = "'SF Mono', 'Fira Code', 'Consolas', monospace";

export const badge = (color) => ({
  fontSize: 10,
  padding: "2px 7px",
  background: `${color}14`,
  border: `1px solid ${color}40`,
  borderRadius: 3,
  color,
  fontWeight: 500,
});
