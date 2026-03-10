export function kalshiTakerFee(cents, contracts = 1) {
  if (!cents || cents <= 0 || cents >= 100 || !contracts || contracts <= 0) return 0;
  const p = cents / 100;
  return Math.ceil(0.07 * contracts * p * (1 - p) * 100) / 100;
}

export function kalshiFeePerContract(cents) {
  return kalshiTakerFee(cents, 1);
}

export function kalshiCostForContracts(cents, contracts) {
  if (!contracts || contracts <= 0) return 0;
  return contracts * (cents / 100) + kalshiTakerFee(cents, contracts);
}

export function kalshiCentsToDecimal(cents) {
  if (!cents || cents <= 0 || cents >= 100) return null;
  const totalCost = kalshiCostForContracts(cents, 1);
  if (totalCost >= 1) return null;
  return 1 / totalCost;
}

export function kalshiCentsToDecimalRaw(cents) {
  if (!cents || cents <= 0 || cents >= 100) return null;
  return 100 / cents;
}

export function parseKalshiSpreadTitle(title) {
  const m = title.match(/^(.+?)\s+wins?\s+by\s+over\s+([\d.]+)\s+points?\??$/i);
  if (!m) return null;
  return { team: m[1].trim(), spread: parseFloat(m[2]) };
}

export function parseKalshiMoneylineTitle(title) {
  if (/\b(?:by\s+over|spread|points?|total|over\/under)\b/i.test(title)) return null;
  let m;
  m = title.match(/^(?:will\s+(?:the\s+)?)?(.+?)\s+(?:wins?|beat|defeat)(?:\s*\??\s*$)/i);
  if (m) return m[1].replace(/^the\s+/i, "").trim();
  m = title.match(/^(.+?)\s+to\s+win\s*\??\s*$/i);
  if (m) return m[1].replace(/^the\s+/i, "").trim();
  m = title.match(/^(.+?)\s+(?:vs?\.?)\s+(.+?)\s*\??\s*$/i);
  if (m) return m[1].replace(/^the\s+/i, "").trim();
  return null;
}

export function teamMatch(kalshiTeam, oddsApiTeam) {
  const k = kalshiTeam.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const o = oddsApiTeam.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (o.includes(k) || k.includes(o)) return true;
  const kWords = k.split(/\s+/);
  const oWords = o.split(/\s+/);
  if (kWords[0] === oWords[0] && kWords[0].length > 3) return true;
  const CITY_MAP = {
    "los angeles l": "lakers",
    "los angeles c": "clippers",
    "new york": "knicks",
    "brooklyn": "nets",
    "oklahoma city": "thunder",
    "golden state": "warriors",
    "san antonio": "spurs",
  };
  const mapped = CITY_MAP[k];
  if (mapped) return o.includes(mapped);
  if (kWords.some(w => w.length > 4 && oWords.includes(w))) return true;
  return false;
}

export function isWholeNumber(value) {
  return Math.abs(value - Math.round(value)) < 1e-9;
}
