import fs from "node:fs/promises";
import path from "node:path";
import { CHARTS_DIR } from "./paths.js";
import type { Platform, Snapshot } from "./types.js";

interface Series {
  label: string;
  color: string;
  values: Array<{ date: string; value: number }>;
}

interface SeriesScale {
  minValue: number;
  maxValue: number;
  yFor: (value: number) => number;
}

const WIDTH = 960;
const HEIGHT = 560;
const TITLE_Y = 38;
const LEGEND_Y = 76;
// Narrowed right margin (from 886 to 856) to make room for dual right-axis labels
const PLOT = { x: 96, y: 112, width: 760, height: 344 };

export function chartFileName(extensionId: string, platform: Platform): string {
  return `${sanitizeFileName(extensionId)}-${platform}.svg`;
}

export async function writePlatformChart(
  extensionId: string,
  platform: Platform,
  snapshots: Snapshot[],
  displayName?: string,
): Promise<string> {
  await fs.mkdir(CHARTS_DIR, { recursive: true });
  const fileName = chartFileName(extensionId, platform);
  const filePath = path.join(CHARTS_DIR, fileName);
  const svg = renderPlatformChart(extensionId, platform, snapshots, displayName);
  await fs.writeFile(filePath, svg, "utf8");
  return `output/charts/${fileName}`;
}

const PLATFORM_META: Record<string, { title: string; yLabel: string }> = {
  marketplace: { title: "VS Code Marketplace", yLabel: "Installs / Downloads" },
  openvsx:     { title: "Open VSX Registry",    yLabel: "Downloads" },
  firefox:     { title: "Mozilla Add-ons",       yLabel: "Avg Daily Users" },
  jetbrains:   { title: "JetBrains Marketplace", yLabel: "Downloads" },
  npm:         { title: "npm Registry",           yLabel: "Weekly Downloads" },
  docker:      { title: "Docker Hub",             yLabel: "Pulls" },
  github:      { title: "GitHub Releases",        yLabel: "Release Downloads" },
};

// ── Deterministic pseudo-random jitter ─────────────────────────────────────
// Seeded so each SVG re-render produces exactly the same result (no churn).
function seededRand(seed: number): number {
  const x = Math.sin(seed * 9_301 + 49_297) * 233_280;
  return x - Math.floor(x); // [0, 1)
}

function jitter(seed: number, amplitude: number): number {
  return (seededRand(seed) - 0.5) * 2 * amplitude;
}

// ── Scale helpers ───────────────────────────────────────────────────────────
function buildScaleFromValues(allValues: number[]): SeriesScale {
  if (allValues.length === 0) {
    const yFor = () => PLOT.y + PLOT.height / 2;
    return { minValue: 0, maxValue: 10, yFor };
  }
  const maxActual = Math.max(1, ...allValues);
  const minActual = Math.min(maxActual, ...allValues);
  const rangeActual = maxActual - minActual;
  const minValue = minActual > 0 ? Math.floor(Math.max(0, minActual - rangeActual * 0.2)) : 0;
  const maxValue = niceMax(maxActual);
  const yRange = Math.max(1, maxValue - minValue);
  const yFor = (value: number): number =>
    PLOT.y + PLOT.height - ((value - minValue) / yRange) * PLOT.height;
  return { minValue, maxValue, yFor };
}

function buildScale(s: Series): SeriesScale {
  return buildScaleFromValues(s.values.map((p) => p.value));
}

// ── Main render ─────────────────────────────────────────────────────────────
export function renderPlatformChart(
  extensionId: string,
  platform: Platform,
  snapshots: Snapshot[],
  displayName?: string,
): string {
  const points = snapshots
    .filter((s) => s.extension_id === extensionId && s.platform === platform)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  const series = buildSeries(platform, points);
  const meta = PLATFORM_META[platform] ?? { title: platform, yLabel: "Count" };

  // Title: "VirtualTabs · VS Code Marketplace"
  const extName = displayName ?? extensionId.split(".").slice(-1)[0] ?? extensionId;
  const title = `${extName} · ${meta.title}`;

  const dates =
    points.length > 0
      ? generateDateRange(points[0].snapshot_date, points.at(-1)!.snapshot_date)
      : [];

  // O(1) index map so xFor lookups stay O(1) as history grows to 1000 days.
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const xFor = (date: string): number => {
    if (dates.length <= 1) return PLOT.x + PLOT.width / 2;
    const index = dateIndex.get(date) ?? 0;
    return PLOT.x + (index / (dates.length - 1)) * PLOT.width;
  };

  // ── Dual-axis decision ────────────────────────────────────────────────────
  // Use dual Y-axis when there are exactly 2 series whose max values differ
  // by more than 3×. This prevents one series from being visually crushed.
  const scales = series.map(buildScale);
  const isDualAxis =
    series.length === 2 &&
    scales[0].maxValue > 0 &&
    scales[1].maxValue > 0 &&
    Math.max(scales[0].maxValue, scales[1].maxValue) /
      Math.min(scales[0].maxValue, scales[1].maxValue) >
      3;

  // ── Grid + axes ───────────────────────────────────────────────────────────
  let gridSvg: string;
  let leftAxisLabel: string;
  let rightAxisLabel: string;
  let pathsSvg: string;

  if (isDualAxis) {
    gridSvg = renderGridDual(scales[0], scales[1], series[0].color, series[1].color);
    leftAxisLabel = `<text transform="translate(22 ${PLOT.y + PLOT.height / 2}) rotate(-90)" text-anchor="middle" font-family="'Caveat', cursive, sans-serif" font-size="17" font-weight="700" fill="${series[0].color}">${escapeXml(series[0].label)}</text>`;
    rightAxisLabel = `<text transform="translate(${WIDTH - 14} ${PLOT.y + PLOT.height / 2}) rotate(90)" text-anchor="middle" font-family="'Caveat', cursive, sans-serif" font-size="17" font-weight="700" fill="${series[1].color}">${escapeXml(series[1].label)}</text>`;
    pathsSvg = series
      .map((s, i) => renderSeries(s, xFor, scales[i].yFor, i * 1_000))
      .join("\n  ");
  } else {
    // Shared scale: combine all values for a single axis.
    const allValues = series.flatMap((s) => s.values.map((p) => p.value));
    const shared = buildScaleFromValues(allValues);
    gridSvg = renderGrid(shared.maxValue, shared.minValue, shared.yFor);
    leftAxisLabel = `<text transform="translate(22 ${PLOT.y + PLOT.height / 2}) rotate(-90)" text-anchor="middle" font-family="'Caveat', cursive, sans-serif" font-size="17" font-weight="600" fill="#5c5a59">${escapeXml(meta.yLabel)}</text>`;
    rightAxisLabel = "";
    pathsSvg = series
      .map((s, i) => renderSeries(s, xFor, shared.yFor, i * 1_000))
      .join("\n  ");
  }

  const xLabels = renderDateLabels(dates, xFor);
  const allValues = series.flatMap((s) => s.values.map((p) => p.value));
  const empty =
    allValues.length === 0
      ? `<text x="${PLOT.x + PLOT.width / 2}" y="${PLOT.y + PLOT.height / 2}" text-anchor="middle" font-family="'Caveat', cursive, sans-serif" font-size="22" fill="#5c5a59">No data yet</text>`
      : "";

  // Axes: L-shaped path with slight jitter on each endpoint to look hand-drawn
  const axisPath = [
    `M${(PLOT.x + jitter(1, 1.5)).toFixed(1)},${(PLOT.y + jitter(2, 1)).toFixed(1)}`,
    `L${(PLOT.x + jitter(3, 1.5)).toFixed(1)},${(PLOT.y + PLOT.height + jitter(4, 1)).toFixed(1)}`,
    `L${(PLOT.x + PLOT.width + jitter(5, 1.5)).toFixed(1)},${(PLOT.y + PLOT.height + jitter(6, 1)).toFixed(1)}`,
  ].join(" ");

  // When dual-axis, also draw a right vertical line for the second axis.
  const rightAxisLine = isDualAxis
    ? `<path d="M${(PLOT.x + PLOT.width + jitter(7, 1.5)).toFixed(1)},${(PLOT.y + jitter(8, 1)).toFixed(1)} L${(PLOT.x + PLOT.width + jitter(9, 1.5)).toFixed(1)},${(PLOT.y + PLOT.height + jitter(10, 1)).toFixed(1)}" fill="none" stroke="#2c2a29" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 3" opacity="0.5"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(title)} line chart">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&amp;display=swap');
      text { font-family: 'Caveat', cursive, sans-serif; }
    </style>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#fdfaf6"/>
  <text x="${WIDTH / 2}" y="${TITLE_Y}" text-anchor="middle" font-size="26" font-weight="700" fill="#2c2a29">${escapeXml(title)}</text>
  ${renderLegend(series, isDualAxis)}
  ${gridSvg}
  <path d="${axisPath}" fill="none" stroke="#2c2a29" stroke-width="2.5" stroke-linecap="round"/>
  ${rightAxisLine}
  ${pathsSvg}
  ${xLabels}
  <text x="${PLOT.x + PLOT.width / 2}" y="${HEIGHT - 14}" text-anchor="middle" font-family="'Caveat', cursive, sans-serif" font-size="17" font-weight="600" fill="#5c5a59">Date</text>
  ${leftAxisLabel}
  ${rightAxisLabel}
  ${empty}
</svg>
`;
}

// ── Grid rendering ──────────────────────────────────────────────────────────
function renderGrid(
  maxValue: number,
  minValue: number,
  yFor: (value: number) => number,
): string {
  const ticks = buildTicks(maxValue, minValue);
  return ticks
    .map((value, i) => {
      const y = yFor(value);
      // Slight end-to-end slope jitter gives each grid line a hand-drawn wobble
      const y1 = y + jitter(i * 11 + 1, 1.2);
      const y2 = y + jitter(i * 11 + 2, 1.2);
      return (
        `<line x1="${PLOT.x}" y1="${y1.toFixed(1)}" x2="${PLOT.x + PLOT.width}" y2="${y2.toFixed(1)}" stroke="#2c2a29" stroke-width="1" stroke-dasharray="6 4" opacity="0.2"/>` +
        `<text x="${PLOT.x - 10}" y="${(y + 5).toFixed(1)}" text-anchor="end" font-family="'Caveat', cursive, sans-serif" font-size="16" font-weight="600" fill="#2c2a29">${formatCompact(value)}</text>`
      );
    })
    .join("\n  ");
}

function renderGridDual(
  scale0: SeriesScale,
  scale1: SeriesScale,
  color0: string,
  color1: string,
): string {
  const ticks0 = buildTicks(scale0.maxValue, scale0.minValue);
  const ticks1 = buildTicks(scale1.maxValue, scale1.minValue);
  const rightX = PLOT.x + PLOT.width;

  // Shared faint grid lines based on the first series ticks
  const gridLines = ticks0
    .map((value, i) => {
      const y = scale0.yFor(value);
      const y1 = y + jitter(i * 11 + 1, 1.2);
      const y2 = y + jitter(i * 11 + 2, 1.2);
      return `<line x1="${PLOT.x}" y1="${y1.toFixed(1)}" x2="${rightX}" y2="${y2.toFixed(1)}" stroke="#2c2a29" stroke-width="1" stroke-dasharray="6 4" opacity="0.15"/>`;
    })
    .join("\n  ");

  // Left-axis tick labels (series 0 color)
  const leftTicks = ticks0
    .map((value) => {
      const y = scale0.yFor(value);
      return (
        `<line x1="${PLOT.x - 6}" y1="${y.toFixed(1)}" x2="${PLOT.x}" y2="${y.toFixed(1)}" stroke="${color0}" stroke-width="2"/>` +
        `<text x="${PLOT.x - 10}" y="${(y + 5).toFixed(1)}" text-anchor="end" font-family="'Caveat', cursive, sans-serif" font-size="15" font-weight="700" fill="${color0}">${formatCompact(value)}</text>`
      );
    })
    .join("\n  ");

  // Right-axis tick labels (series 1 color)
  const rightTicks = ticks1
    .map((value) => {
      const y = scale1.yFor(value);
      return (
        `<line x1="${rightX}" y1="${y.toFixed(1)}" x2="${rightX + 6}" y2="${y.toFixed(1)}" stroke="${color1}" stroke-width="2"/>` +
        `<text x="${rightX + 10}" y="${(y + 5).toFixed(1)}" text-anchor="start" font-family="'Caveat', cursive, sans-serif" font-size="15" font-weight="700" fill="${color1}">${formatCompact(value)}</text>`
      );
    })
    .join("\n  ");

  return `${gridLines}\n  ${leftTicks}\n  ${rightTicks}`;
}

// ── Series path rendering ───────────────────────────────────────────────────
function renderSeries(
  series: Series,
  xFor: (date: string) => number,
  yFor: (value: number) => number,
  seriesSeed: number,
): string {
  if (series.values.length === 0) return "";

  if (series.values.length === 1) {
    const point = series.values[0];
    const x = xFor(point.date);
    const y = yFor(point.value);
    return (
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${series.color}"/>` +
      `<text x="${(x + 12).toFixed(1)}" y="${(y - 10).toFixed(1)}" font-family="'Caveat', cursive, sans-serif" font-size="16" font-weight="700" fill="${series.color}">${formatNumber(point.value)}</text>`
    );
  }

  const pointsToRender =
    series.values.length > 180 ? lttb(series.values, 180, xFor) : series.values;

  // Apply small deterministic jitter to each coordinate for hand-drawn feel.
  // Amplitude 2.5px is enough to be visible at 960px width without distorting data.
  const d = pointsToRender
    .map((point, index) => {
      const bx = xFor(point.date);
      const by = yFor(point.value);
      const x = bx + jitter(seriesSeed + index * 3, 2.5);
      const y = by + jitter(seriesSeed + index * 3 + 1, 2.5);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = series.values.at(-1);

  const markers =
    series.values.length <= 15
      ? series.values
          .map(
            (point) =>
              `<circle cx="${xFor(point.date).toFixed(1)}" cy="${yFor(point.value).toFixed(1)}" r="3.5" fill="${series.color}"/>`,
          )
          .join("\n  ")
      : last
        ? `<circle cx="${xFor(last.date).toFixed(1)}" cy="${yFor(last.value).toFixed(1)}" r="5" fill="${series.color}"/>`
        : "";

  const lastLabel = last
    ? `<text x="${Math.min(xFor(last.date) + 10, PLOT.x + PLOT.width - 80).toFixed(1)}" y="${(yFor(last.value) - 10).toFixed(1)}" font-family="'Caveat', cursive, sans-serif" font-size="16" font-weight="700" fill="${series.color}">${formatNumber(last.value)}</text>`
    : "";

  return `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>\n  ${markers}\n  ${lastLabel}`;
}

// ── Legend ──────────────────────────────────────────────────────────────────
function renderLegend(series: Series[], isDualAxis: boolean): string {
  const itemWidth = 185;
  const itemGap = 15;
  const legendWidth = series.length * itemWidth + Math.max(0, series.length - 1) * itemGap;
  const startX = (WIDTH - legendWidth) / 2;

  return series
    .map((item, index) => {
      const x = startX + index * (itemWidth + itemGap);
      const axisNote = isDualAxis ? (index === 0 ? " (left)" : " (right)") : "";
      return (
        `<g transform="translate(${x},${LEGEND_Y})">` +
        `<rect x="0" y="-15" width="${itemWidth}" height="30" rx="3" fill="#fdfaf6" stroke="#2c2a29" stroke-width="1.5"/>` +
        `<line x1="10" y1="0" x2="32" y2="0" stroke="${item.color}" stroke-width="3.5" stroke-linecap="round"/>` +
        `<text x="40" y="6" font-family="'Caveat', cursive, sans-serif" font-size="15" font-weight="700" fill="#2c2a29">${escapeXml(item.label + axisNote)}</text>` +
        `</g>`
      );
    })
    .join("\n  ");
}

// ── Date labels ─────────────────────────────────────────────────────────────
function renderDateLabels(dates: string[], xFor: (date: string) => number): string {
  if (dates.length === 0) return "";
  return chooseDateLabels(dates)
    .map(
      (date) =>
        `<text x="${xFor(date).toFixed(1)}" y="${PLOT.y + PLOT.height + 26}" text-anchor="middle" font-family="'Caveat', cursive, sans-serif" font-size="15" font-weight="600" fill="#2c2a29">${escapeXml(formatDateLabel(date))}</text>`,
    )
    .join("\n  ");
}

// ── Series definitions per platform ─────────────────────────────────────────
const PLATFORM_SERIES: Record<
  string,
  Array<{ label: string; color: string; field: "install_count" | "download_count" }>
> = {
  marketplace: [
    { label: "installs",  color: "#2563eb", field: "install_count" },
    { label: "downloads", color: "#ef3b20", field: "download_count" },
  ],
  openvsx:   [{ label: "downloads",        color: "#ef3b20", field: "download_count" }],
  firefox:   [{ label: "daily users",       color: "#ef3b20", field: "download_count" }],
  jetbrains: [{ label: "downloads",         color: "#ef3b20", field: "download_count" }],
  npm:       [{ label: "weekly downloads",  color: "#ef3b20", field: "download_count" }],
  docker:    [{ label: "pulls",             color: "#ef3b20", field: "download_count" }],
  github:    [{ label: "release downloads", color: "#ef3b20", field: "download_count" }],
};

function buildSeries(platform: Platform, snapshots: Snapshot[]): Series[] {
  const defs = PLATFORM_SERIES[platform] ?? [
    { label: "count", color: "#ef3b20", field: "download_count" as const },
  ];
  return defs.map((def) => ({
    label: def.label,
    color: def.color,
    values: snapshots.flatMap((snapshot) => {
      const v = snapshot[def.field];
      return v === null ? [] : [{ date: snapshot.snapshot_date, value: v }];
    }),
  }));
}

// ── Tick / scale helpers ────────────────────────────────────────────────────
function buildTicks(maxValue: number, minValue: number): number[] {
  const tickCount = 4;
  const values: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    values.push(Math.round(minValue + ((maxValue - minValue) * i) / tickCount));
  }
  return Array.from(new Set(values));
}

function chooseDateLabels(dates: string[]): string[] {
  if (dates.length <= 5) return dates;
  const indexes = new Set([0, dates.length - 1]);
  for (let i = 1; i < 4; i += 1) {
    indexes.add(Math.round((i / 4) * (dates.length - 1)));
  }
  return Array.from(indexes)
    .sort((a, b) => a - b)
    .map((i) => dates[i]);
}

function niceMax(value: number): number {
  if (value <= 10) return 10;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  return Math.ceil(value / base) * base;
}

// ── Formatters ──────────────────────────────────────────────────────────────
function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return formatNumber(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ── LTTB downsampling ───────────────────────────────────────────────────────
// Largest-Triangle-Three-Buckets: reduces dense time series to ≤threshold
// points while preserving the visual shape. Prevents O(n) SVG path bloat as
// history grows toward 1000 days.
function lttb(
  data: Array<{ date: string; value: number }>,
  threshold: number,
  xFor: (date: string) => number,
): Array<{ date: string; value: number }> {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold === 0) return data;

  const sampled: Array<{ date: string; value: number }> = [];
  let sampledIndex = 0;
  const every = (dataLength - 2) / (threshold - 2);
  let a = 0;
  let maxAreaPoint: { date: string; value: number } | undefined;
  let maxArea: number;
  let area: number;
  let nextA: number | undefined;

  sampled[sampledIndex++] = data[a];

  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * every) + 1;
    let avgRangeEnd = Math.floor((i + 2) * every) + 1;
    avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;
    const avgRangeLength = avgRangeEnd - avgRangeStart;

    for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
      avgX += xFor(data[avgRangeStart].date);
      avgY += data[avgRangeStart].value;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    let rangeOffs = Math.floor((i + 0) * every) + 1;
    const rangeTo = Math.floor((i + 1) * every) + 1;
    const pointAx = xFor(data[a].date);
    const pointAy = data[a].value;

    maxArea = -1;
    area = -1;

    for (; rangeOffs < rangeTo; rangeOffs++) {
      area =
        Math.abs(
          (pointAx - avgX) * (data[rangeOffs].value - pointAy) -
            (pointAx - xFor(data[rangeOffs].date)) * (avgY - pointAy),
        ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[rangeOffs];
        nextA = rangeOffs;
      }
    }

    if (maxAreaPoint) sampled[sampledIndex++] = maxAreaPoint;
    if (nextA !== undefined) a = nextA;
  }

  sampled[sampledIndex++] = data[dataLength - 1];
  return sampled;
}

// ── Date range generator ────────────────────────────────────────────────────
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}
