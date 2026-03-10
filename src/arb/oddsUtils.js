export function americanToDecimal(am) {
  if (!am) return null;
  return am > 0 ? am / 100 + 1 : 100 / Math.abs(am) + 1;
}

export function decimalToAmerican(dec) {
  if (!dec || dec <= 1) return null;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

export function formatAmerican(am) {
  if (am == null) return "—";
  return am > 0 ? `+${am}` : `${am}`;
}
