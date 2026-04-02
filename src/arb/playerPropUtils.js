/**
 * Player prop matching utilities: name normalization, line alignment.
 */

/**
 * Normalize player name for comparison: lowercase, collapse spaces, strip suffixes.
 * @param {string} str - Raw player name
 * @returns {string}
 */
export function normalizePlayerName(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/\s+(?:Jr\.?|Sr\.?|III?|IV)\s*$/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Check if two player names refer to the same player.
 * Handles: exact match, last-name match, "D'Angelo", "OG Anunoby".
 * @param {string} a - First name
 * @param {string} b - Second name
 * @returns {boolean}
 */
export function playerNamesMatch(a, b) {
  const na = normalizePlayerName(a);
  const nb = normalizePlayerName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aWords = na.split(/\s+/);
  const bWords = nb.split(/\s+/);
  const aLast = aWords[aWords.length - 1];
  const bLast = bWords[bWords.length - 1];
  if (aLast === bLast && aLast.length > 2) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/**
 * Check if Kalshi threshold aligns with Odds API O/U line.
 * Kalshi "25+ points" = Over 24.5 exactly.
 * Whole-number sportsbook lines are not equivalent because they introduce push outcomes.
 * @param {number} kalshiThreshold - Kalshi threshold (e.g. 25 for "25+")
 * @param {number} oddsApiLine - Odds API line (e.g. 24.5)
 * @returns {boolean}
 */
export function lineAligns(kalshiThreshold, oddsApiLine) {
  if (kalshiThreshold == null || oddsApiLine == null) return false;
  return Math.abs(oddsApiLine - (kalshiThreshold - 0.5)) < 0.01;
}

/**
 * Get line diff for audit display.
 * @param {number} kalshiThreshold
 * @param {number} oddsApiLine
 * @returns {number}
 */
export function getLineDiff(kalshiThreshold, oddsApiLine) {
  if (kalshiThreshold == null || oddsApiLine == null) return null;
  return Math.abs(kalshiThreshold - (oddsApiLine + 0.5));
}
