import { useMemo, useRef, useState, useEffect } from "react";

function catmullRomToBezier(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function BalanceHistoryChart({ balanceHistory = [] }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const w = el.clientWidth || 400;
      setWidth(w);
      setHeight(Math.min(220, Math.max(140, w * 0.36)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const data = balanceHistory.length ? balanceHistory : [{ ts: new Date().toISOString(), balance: 1000 }];
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
    const padding = Math.max(40, (maxB - minB) * 0.12);
    const yMin = Math.max(0, minB - padding);
    const yMax = maxB + padding;
    const rangeB = yMax - yMin || 1;

    const pad = { left: 52, right: 16, top: 14, bottom: 28 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const x = (t) => pad.left + ((t - minT) / rangeT) * chartW;
    const y = (b) => pad.top + chartH - ((b - yMin) / rangeB) * chartH;

    const pixelPoints = points.map((p) => ({ x: x(p.t), y: y(p.balance) }));
    const linePath = catmullRomToBezier(pixelPoints);
    const areaPath = linePath
      ? `${linePath} L ${pixelPoints[pixelPoints.length - 1].x} ${pad.top + chartH} L ${pixelPoints[0].x} ${pad.top + chartH} Z`
      : "";

    const yTicks = [yMin, yMin + rangeB * 0.25, yMin + rangeB * 0.5, yMin + rangeB * 0.75, yMax];
    const xTicks =
      points.length >= 2
        ? [points[0], points[Math.floor(points.length * 0.5)], points[points.length - 1]]
        : points;

    return { linePath, areaPath, pad, chartH, chartW, x, y, points, yTicks, xTicks, yMin, yMax, minT, maxT, pixelPoints };
  }, [balanceHistory, width, height]);

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const formatBalance = (b) => `$${Math.round(b).toLocaleString()}`;

  const lastPoint = chart.points[chart.points.length - 1];

  return (
    <div ref={containerRef} className="balance-chart-host">
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <linearGradient id="chartFillTeal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00c9a7" stopOpacity="0.18" />
            <stop offset="45%" stopColor="#00c9a7" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#00c9a7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="chartStrokeTeal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#009b82" />
            <stop offset="50%" stopColor="#00c9a7" />
            <stop offset="100%" stopColor="#5eead4" />
          </linearGradient>
          <filter id="chartLineGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={width} height={height} fill="var(--chart-surface)" rx={8} ry={8} />
        {chart.yTicks.map((v, i) => {
          const yPos = chart.pad.top + chart.chartH - ((v - chart.yMin) / (chart.yMax - chart.yMin)) * chart.chartH;
          return (
            <line
              key={`g-${i}`}
              x1={chart.pad.left}
              y1={yPos}
              x2={width - chart.pad.right}
              y2={yPos}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
            />
          );
        })}
        {chart.yTicks.map((v, i) => {
          const yPos = chart.pad.top + chart.chartH - ((v - chart.yMin) / (chart.yMax - chart.yMin)) * chart.chartH;
          return (
            <text
              key={`yl-${i}`}
              x={chart.pad.left - 8}
              y={yPos + 4}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize={11}
              style={{ fontFamily: "var(--font-mono)", fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
            >
              {formatBalance(v)}
            </text>
          );
        })}
        {chart.xTicks.map((p, i) => (
          <text
            key={`xl-${i}`}
            x={chart.x(p.t)}
            y={height - 8}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize={11}
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {formatTime(p.t)}
          </text>
        ))}
        {chart.areaPath && <path d={chart.areaPath} fill="url(#chartFillTeal)" />}
        {chart.linePath && (
          <>
            <path
              d={chart.linePath}
              fill="none"
              stroke="url(#chartStrokeTeal)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#chartLineGlow)"
            />
            <path
              d={chart.linePath}
              fill="none"
              stroke="url(#chartStrokeTeal)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {lastPoint && (
          <>
            <circle cx={chart.x(lastPoint.t)} cy={chart.y(lastPoint.balance)} r={4.5} fill="var(--accent)" stroke="var(--chart-surface)" strokeWidth={2} />
            <circle cx={chart.x(lastPoint.t)} cy={chart.y(lastPoint.balance)} r={10} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.18}>
              <animate attributeName="r" values="5;14;5" dur="2.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.25;0;0.25" dur="2.8s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </svg>
    </div>
  );
}
