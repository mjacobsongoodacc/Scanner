/**
 * ArbCard for player props — passes through to ArbCard which renders
 * player, line, and lines-to-take when marketType is player_*.
 */

import ArbCard, { arbToKey } from "./ArbCard.jsx";

export { arbToKey };

export default function PropArbCard(props) {
  return <ArbCard {...props} />;
}
