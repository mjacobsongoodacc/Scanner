/**
 * BalanceHistoryChart — SVG line chart for historic balance
 * Pure SVG, no dependencies. Dark theme (#0a0a0a, #1a1a1a, #5a9e6f)
 */

import { useMemo, useRef, useState, useEffect } from "react";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'Consolas', monospace";

export default function BalanceHistoryChart({ balanceHistory = [] }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(180);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const w = el.clientWidth || 400;
      setWidth(w);
      setHeight(Math.min(180, Math.max(120, w * 0.4)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const data = balanceHistory.length
      ? balanceHistory
      : [{ ts: new Date().toISOString(), balance: 1000 }];
    const points = data.map((d) => ({
      t: new Date(d.ts).getTime(),
      balance: Number(d.balance) || 1000,
    }));
    points.sort((a, b) => a.t - b.t);
    const minT = points[0]?.t ?? Date.now();
    const maxT = points[points.length - 1]?.t ?? Date.now();
    const rangeT = maxT - minT || 1;
    const balances = points.map((p) => p.balance);
    const minB = Math.min(...balances, 1000);
    const maxB = Math.max(...balances, 1000);
    const padding = Math.max(50, (maxB - minB) * 0.1);
    const yMin = Math.max(0, minB - padding);
    const yMax = maxB + padding;
    const rangeB = yMax - yMin || 1;

    const pad = { left: 48, right: 16, top: 12, bottom: 28 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const x = (t) => pad.left + ((t - minT) / rangeT) * chartW;
    const y = (b) => pad.top + chartH - ((b - yMin) / rangeB) * chartH;

    const pathD =
      points.length > 0
        ? points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.balance)}`)
            .join(" ")
        : "";

    const yTicks = [yMin, yMin + rangeB * 0.25, yMin + rangeB * 0.5, yMin + rangeB * 0.75, yMax];
    const xTicks =
      points.length >= 2
        ? [
            points[0],
            points[Math.floor(points.length * 0.5)],
            points[points.length - 1],
          ]
        : points;

    return {
      pathD,
      pad,
      chartH,
      x,
      y,
      points,
      yTicks,
      xTicks,
      yMin,
      yMax,
      minT,
      maxT,
    };
  }, [balanceHistory, width, height]);

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const formatBalance = (b) => `$${Math.round(b)}`;

  return (
    <div ref={containerRef} style={{ width: "100%", minHeight: 140 }}>
      <div style={{ fontSize: 11, color: "#555", fontWeight: 500, marginBottom: 8 }}>Historic Balance</div>
      <svg width={width} height={height} style={{ display: "block" }}>
        <rect width={width} height={height} fill="#0a0a0a" rx={4} />
        {/* Grid */}
        {chart.yTicks.map((v, i) => {
          const yPos = chart.pad.top + chart.chartH - ((v - chart.yMin) / (chart.yMax - chart.yMin)) * chart.chartH;
          return (
            <line
              key={i}
              x1={chart.pad.left}
              y1={yPos}
              x2={width - chart.pad.right}
              y2={yPos}
              stroke="#1a1a1a"
              strokeWidth={1}
            />
          );
        })}
        {[0.25, 0.5, 0.75].map((frac, i) => (
          <line
            key={`x-${i}`}
            x1={chart.pad.left + frac * (width - chart.pad.left - chart.pad.right)}
            y1={chart.pad.top}
            x2={chart.pad.left + frac * (width - chart.pad.left - chart.pad.right)}
            y2={height - chart.pad.bottom}
            stroke="#1a1a1a"
            strokeWidth={1}
          />
        ))}
        {/* Y-axis labels */}
        {chart.yTicks.map((v, i) => {
          const yPos = chart.pad.top + chart.chartH - ((v - chart.yMin) / (chart.yMax - chart.yMin)) * chart.chartH;
          return (
            <text
              key={i}
              x={chart.pad.left - 6}
              y={yPos + 4}
              textAnchor="end"
              fill="#555"
              fontSize={10}
              fontFamily={MONO}
            >
              {formatBalance(v)}
            </text>
          );
        })}
        {/* X-axis labels */}
        {chart.xTicks.map((p, i) => (
          <text
            key={i}
            x={chart.x(p.t)}
            y={height - 8}
            textAnchor="middle"
            fill="#555"
            fontSize={9}
            fontFamily={FONT}
          >
            {formatTime(p.t)}
          </text>
        ))}
        {/* Line */}
        {chart.pathD && (
          <path d={chart.pathD} fill="none" stroke="#5a9e6f" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
}
