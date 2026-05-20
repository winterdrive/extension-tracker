import { describe, expect, it } from "vitest";
import { renderPlatformChart } from "../src/charts.js";
import type { Snapshot } from "../src/types.js";

const fetchedAt = "2026-05-20T00:00:00.000Z";

function snapshot(
  platform: Snapshot["platform"],
  extensionId: string,
  date: string,
  installCount: number | null,
  downloadCount: number | null,
): Snapshot {
  return {
    snapshot_date: date,
    fetched_at: fetchedAt,
    platform,
    extension_id: extensionId,
    version: "1.0.0",
    install_count: installCount,
    download_count: downloadCount,
    avg_rating: null,
    rating_count: null,
  };
}

describe("chart legend layout", () => {
  it("centers a single-series legend in the SVG", () => {
    const svg = renderPlatformChart("winterdrive.quick-prompt", "openvsx", [
      snapshot("openvsx", "winterdrive.quick-prompt", "2026-05-20", null, 100),
    ]);

    expect(svg).toContain('<text x="480" y="38"');
    expect(svg).toContain('<g transform="translate(387.5,76)">');
    expect(svg).toContain("M94.8,111.7");
  });

  it("centers a dual-series legend group in the SVG", () => {
    const svg = renderPlatformChart("winterdrive.quick-prompt", "marketplace", [
      snapshot("marketplace", "winterdrive.quick-prompt", "2026-05-20", 100, 500),
    ]);

    expect(svg).toContain('<text x="480" y="38"');
    expect(svg).toContain('<g transform="translate(287.5,76)">');
    expect(svg).toContain('<g transform="translate(487.5,76)">');
    expect(svg).toContain("M94.8,111.7");
  });
});
