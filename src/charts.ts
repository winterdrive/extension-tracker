import fs from "node:fs/promises";
import path from "node:path";
import { CHARTS_DIR } from "./paths.js";
import type { Platform, Snapshot } from "./types.js";

interface Series {
  label: string;
  color: string;
  values: Array<{ date: string; value: number }>;
}

const WIDTH = 960;
const HEIGHT = 560;
const PLOT = { x: 96, y: 86, width: 790, height: 370 };

export function chartFileName(extensionId: string, platform: Platform): string {
  return `${sanitizeFileName(extensionId)}-${platform}.svg`;
}

export async function writePlatformChart(extensionId: string, platform: Platform, snapshots: Snapshot[]): Promise<string> {
  await fs.mkdir(CHARTS_DIR, { recursive: true });
  const fileName = chartFileName(extensionId, platform);
  const filePath = path.join(CHARTS_DIR, fileName);
  const svg = renderPlatformChart(extensionId, platform, snapshots);
  await fs.writeFile(filePath, svg, "utf8");
  return `output/charts/${fileName}`;
}

function renderPlatformChart(extensionId: string, platform: Platform, snapshots: Snapshot[]): string {
  const points = snapshots
    .filter((snapshot) => snapshot.extension_id === extensionId && snapshot.platform === platform)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  const series = buildSeries(platform, points);
  const title = platform === "marketplace" ? "VS Code Marketplace History" : "Open VSX History";
  const yLabel = platform === "marketplace" ? "Marketplace count" : "Open VSX downloads";
  
  const dates = points.length > 0 
    ? generateDateRange(points[0].snapshot_date, points.at(-1)!.snapshot_date)
    : [];

  const allValues = series.flatMap((item) => item.values.map((point) => point.value));
  const maxValue = niceMax(Math.max(1, ...allValues));
  const minValue = Math.min(0, ...allValues);
  const yRange = Math.max(1, maxValue - minValue);

  // Pre-build an O(1) index map so xFor lookups are O(1) rather than O(n).
  // Without this, lttb + renderSeries both call xFor per data point, making
  // chart rendering O(n²) as the time-series grows toward 1000 days.
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const xFor = (date: string): number => {
    if (dates.length <= 1) {
      return PLOT.x + PLOT.width / 2;
    }
    const index = dateIndex.get(date) ?? 0;
    return PLOT.x + (index / (dates.length - 1)) * PLOT.width;
  };

  const yFor = (value: number): number => PLOT.y + PLOT.height - ((value - minValue) / yRange) * PLOT.height;
  const grid = renderGrid(maxValue, minValue, yFor);
  const paths = series.map((item) => renderSeries(item, xFor, yFor)).join("\n  ");
  const xLabels = renderDateLabels(dates, xFor);
  const empty = allValues.length === 0
    ? `<text x="${PLOT.x + PLOT.width / 2}" y="${PLOT.y + PLOT.height / 2}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="#64748b">No data yet</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(extensionId)} ${escapeXml(title)} line chart">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
  <text x="${WIDTH / 2}" y="42" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">${escapeXml(title)}</text>
  ${renderLegend(series)}
  ${grid}
  <path d="M${PLOT.x},${PLOT.y} L${PLOT.x},${PLOT.y + PLOT.height} L${PLOT.x + PLOT.width},${PLOT.y + PLOT.height}" fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round"/>
  ${paths}
  ${xLabels}
  <text x="${PLOT.x + PLOT.width / 2}" y="${HEIGHT - 28}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="#111827">Date</text>
  <text transform="translate(28 ${PLOT.y + PLOT.height / 2}) rotate(-90)" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(yLabel)}</text>
  ${empty}
</svg>
`;
}

function renderGrid(maxValue: number, minValue: number, yFor: (value: number) => number): string {
  const ticks = buildTicks(maxValue, minValue);
  return ticks.map((value) => {
    const y = yFor(value);
    return `<line x1="${PLOT.x}" y1="${y.toFixed(1)}" x2="${PLOT.x + PLOT.width}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>` +
      `<text x="${PLOT.x - 14}" y="${(y + 5).toFixed(1)}" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600" fill="#111827">${formatCompact(value)}</text>`;
  }).join("\n  ");
}

function renderSeries(series: Series, xFor: (date: string) => number, yFor: (value: number) => number): string {
  if (series.values.length === 0) {
    return "";
  }

  if (series.values.length === 1) {
    const point = series.values[0];
    const x = xFor(point.date);
    const y = yFor(point.value);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${series.color}"/>` +
      `<text x="${(x + 12).toFixed(1)}" y="${(y - 10).toFixed(1)}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700" fill="${series.color}">${formatNumber(point.value)}</text>`;
  }

  const pointsToRender = series.values.length > 180 ? lttb(series.values, 180, xFor) : series.values;
  const d = pointsToRender.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(point.date).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(" ");
  const markers = series.values.length <= 30
    ? series.values.map((point) => `<circle cx="${xFor(point.date).toFixed(1)}" cy="${yFor(point.value).toFixed(1)}" r="3.2" fill="${series.color}"/>`).join("\n  ")
    : "";
  const last = series.values.at(-1);
  const lastLabel = last
    ? `<text x="${Math.min(xFor(last.date) + 10, PLOT.x + PLOT.width - 80).toFixed(1)}" y="${(yFor(last.value) - 10).toFixed(1)}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700" fill="${series.color}">${formatNumber(last.value)}</text>`
    : "";

  return `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>\n  ${markers}\n  ${lastLabel}`;
}

function renderLegend(series: Series[]): string {
  const startX = PLOT.x + 8;
  return series.map((item, index) => {
    const x = startX + index * 190;
    return `<g transform="translate(${x},64)"><rect x="0" y="-13" width="150" height="28" rx="4" fill="#ffffff" stroke="#111827" stroke-width="2"/>` +
      `<line x1="12" y1="1" x2="34" y2="1" stroke="${item.color}" stroke-width="4" stroke-linecap="round"/>` +
      `<text x="44" y="6" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600" fill="#111827">${escapeXml(item.label)}</text></g>`;
  }).join("\n  ");
}

function renderDateLabels(dates: string[], xFor: (date: string) => number): string {
  if (dates.length === 0) {
    return "";
  }

  return chooseDateLabels(dates).map((date) => {
    const x = xFor(date);
    return `<text x="${x.toFixed(1)}" y="${PLOT.y + PLOT.height + 28}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600" fill="#111827">${escapeXml(formatDateLabel(date))}</text>`;
  }).join("\n  ");
}

function buildSeries(platform: Platform, snapshots: Snapshot[]): Series[] {
  const downloadSeries: Series = {
    label: "downloads",
    color: "#ef3b20",
    values: snapshots.flatMap((snapshot) => snapshot.download_count === null ? [] : [{ date: snapshot.snapshot_date, value: snapshot.download_count }]),
  };

  if (platform === "openvsx") {
    return [downloadSeries];
  }

  return [
    {
      label: "installs",
      color: "#2563eb",
      values: snapshots.flatMap((snapshot) => snapshot.install_count === null ? [] : [{ date: snapshot.snapshot_date, value: snapshot.install_count }]),
    },
    downloadSeries,
  ];
}

function buildTicks(maxValue: number, minValue: number): number[] {
  const ticks = 4;
  const values: number[] = [];
  for (let i = 0; i <= ticks; i += 1) {
    values.push(Math.round(minValue + ((maxValue - minValue) * i) / ticks));
  }
  return Array.from(new Set(values));
}

function chooseDateLabels(dates: string[]): string[] {
  if (dates.length <= 5) {
    return dates;
  }

  const indexes = new Set([0, dates.length - 1]);
  for (let i = 1; i < 4; i += 1) {
    indexes.add(Math.round((i / 4) * (dates.length - 1)));
  }
  return Array.from(indexes).sort((a, b) => a - b).map((index) => dates[index]);
}

function niceMax(value: number): number {
  if (value <= 10) {
    return 10;
  }
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  return Math.ceil(value / base) * base;
}

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
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

function lttb(data: Array<{ date: string; value: number }>, threshold: number, xFor: (date: string) => number): Array<{ date: string; value: number }> {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold === 0) {
    return data;
  }

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
      area = Math.abs(
        (pointAx - avgX) * (data[rangeOffs].value - pointAy) -
        (pointAx - xFor(data[rangeOffs].date)) * (avgY - pointAy)
      ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[rangeOffs];
        nextA = rangeOffs;
      }
    }

    if (maxAreaPoint) {
      sampled[sampledIndex++] = maxAreaPoint;
    }
    if (nextA !== undefined) {
      a = nextA;
    }
  }

  sampled[sampledIndex++] = data[dataLength - 1];

  return sampled;
}

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
