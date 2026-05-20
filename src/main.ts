import fs from "node:fs/promises";
import { fetchMarketplaceSnapshot } from "./collectors/marketplace.js";
import { fetchOpenVsxSnapshot } from "./collectors/openVsx.js";
import { fetchMultiEcosystemSnapshot } from "./collectors/multiEcosystem.js";
import { loadExtensions, platformsForSources, resolveSources } from "./config.js";
import { dataFilePath } from "./paths.js";
import { writePlatformChart } from "./charts.js";
import { appendJsonl, readJsonl } from "./storage/jsonl.js";
import type { Platform, Snapshot, SourceConfig } from "./types.js";

interface CollectResult {
  snapshot?: Snapshot;
  written: boolean;
  skipped: boolean;
  error?: string;
  extensionId: string;
  platform: Platform;
}

interface Options {
  platform: Platform | null;
  shardIndex: number;
  shardTotal: number;
  concurrency: number;
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  const extensions = await loadExtensions();
  const fetchedAt = new Date().toISOString();
  const snapshotDate = fetchedAt.slice(0, 10);
  const tasks = applyShard(platformsForSources(resolveSources(extensions), options.platform), options.shardIndex, options.shardTotal);
  const results = await runWithConcurrency(tasks, options.concurrency, (task) => collectTask(task, snapshotDate, fetchedAt));

  await writeStepSummary(results, options);

  if (results.length > 0 && results.every((result) => result.error)) {
    process.exitCode = 1;
  }
}

function applyShard(tasks: SourceConfig[], shardIndex: number, shardTotal: number): SourceConfig[] {
  if (shardTotal <= 1) {
    return tasks;
  }
  return tasks.filter((_, index) => index % shardTotal === shardIndex);
}

async function collectTask(task: SourceConfig, snapshotDate: string, fetchedAt: string): Promise<CollectResult> {
  console.log(`[collectTask] Starting task: ${task.key} on platform ${task.platform}`);
  const filePath = dataFilePath(task.key, task.platform);
  const existingSnapshots = await readJsonl<Snapshot>(filePath);

  try {
    const snapshot = task.platform === "marketplace"
      ? await fetchMarketplaceSnapshot(task, snapshotDate, fetchedAt)
      : task.platform === "openvsx"
        ? await fetchOpenVsxSnapshot(task, snapshotDate, fetchedAt)
        : await fetchMultiEcosystemSnapshot(task, snapshotDate, fetchedAt);

    const alreadyExists = existingSnapshots.some((candidate) => candidate.snapshot_date === snapshot.snapshot_date);
    const snapshots = alreadyExists ? existingSnapshots : [...existingSnapshots, snapshot];

    if (!alreadyExists) {
      await appendJsonl(filePath, [snapshot]);
    }

    await writePlatformChart(task.key, task.platform, snapshots, task.displayName);

    console.log(`[collectTask] Completed task: ${task.key} on platform ${task.platform} (written: ${!alreadyExists}, skipped: ${alreadyExists})`);

    return {
      snapshot,
      written: !alreadyExists,
      skipped: alreadyExists,
      extensionId: task.key,
      platform: task.platform,
    };
  } catch (error) {
    console.error(`[collectTask] Failed task: ${task.key} on platform ${task.platform}. Error:`, error);
    if (existingSnapshots.length > 0) {
      await writePlatformChart(task.key, task.platform, existingSnapshots, task.displayName);
    }

    return {
      written: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
      extensionId: task.key,
      platform: task.platform,
    };
  }
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) {
      return;
    }
    results[index] = await worker(items[index]);
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}

function readOptions(args: string[]): Options {
  const platform = readPlatformFilter(args);
  const [shardIndex, shardTotal] = readShard(args);
  return {
    platform,
    shardIndex,
    shardTotal,
    concurrency: readPositiveInt(args, "--concurrency", 5),
  };
}

function readPlatformFilter(args: string[]): Platform | null {
  const direct = args.find((arg) => arg.startsWith("--platform="));
  const flagIndex = args.indexOf("--platform");
  const value = direct
    ? direct.slice("--platform=".length)
    : flagIndex >= 0
      ? args[flagIndex + 1]
      : args.find((arg) => !arg.startsWith("--") && !arg.includes("/"));

  if (!value || value === "all") {
    return null;
  }

  const validPlatforms: Platform[] = [
    "marketplace",
    "openvsx",
    "firefox",
    "jetbrains",
    "npm",
    "docker",
    "github",
  ];

  if (validPlatforms.includes(value as Platform)) {
    return value as Platform;
  }

  throw new Error(`Unsupported platform: ${value}`);
}

function readShard(args: string[]): [number, number] {
  const direct = args.find((arg) => arg.startsWith("--shard="));
  const flagIndex = args.indexOf("--shard");
  const positional = args.find((arg) => /^\d+\/\d+$/.test(arg));
  const value = direct ? direct.slice("--shard=".length) : flagIndex >= 0 ? args[flagIndex + 1] : positional ?? "0/1";
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid shard format: ${value}. Expected index/total, for example 0/10.`);
  }

  const shardIndex = Number(match[1]);
  const shardTotal = Number(match[2]);
  if (!Number.isInteger(shardIndex) || !Number.isInteger(shardTotal) || shardTotal < 1 || shardIndex < 0 || shardIndex >= shardTotal) {
    throw new Error(`Invalid shard value: ${value}`);
  }

  return [shardIndex, shardTotal];
}

function readPositiveInt(args: string[], flag: string, fallback: number): number {
  const direct = args.find((arg) => arg.startsWith(`${flag}=`));
  const flagIndex = args.indexOf(flag);
  const positional = args.find((arg) => /^\d+$/.test(arg));
  const raw = direct ? direct.slice(flag.length + 1) : flagIndex >= 0 ? args[flagIndex + 1] : positional;
  const parsed = raw ? Number(raw) : fallback;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function writeStepSummary(results: CollectResult[], options: Options): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const lines = [
    "## Extension Tracker",
    "",
    `Platform: ${options.platform ?? "all"}`,
    `Shard: ${options.shardIndex}/${options.shardTotal}`,
    `Concurrency: ${options.concurrency}`,
    `Series processed: ${results.length}`,
    `Snapshots written: ${results.filter((result) => result.written).length}`,
    `Skipped existing snapshots: ${results.filter((result) => result.skipped).length}`,
    `Errors: ${results.filter((result) => result.error).length}`,
    "",
  ];

  for (const result of results) {
    const status = result.error ? `ERROR ${result.error}` : result.written ? "written" : "skipped";
    lines.push(`- ${result.extensionId} ${result.platform}: ${status}`);
  }

  const output = `${lines.join("\n")}\n`;
  if (summaryPath) {
    await fs.appendFile(summaryPath, output, "utf8");
  } else {
    console.log(output);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
