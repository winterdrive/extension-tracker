import fs from "node:fs/promises";
import { CONFIG_PATH } from "./paths.js";
import type { ExtensionConfig, Platform, SourceConfig } from "./types.js";

export async function loadExtensions(): Promise<ExtensionConfig[]> {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("config/extensions.json must contain an array");
  }

  return parsed.map((item, index) => {
    if (!isExtensionConfig(item)) {
      throw new Error(`Invalid extension config at index ${index}`);
    }
    return item;
  });
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isExtensionConfig(value: unknown): value is ExtensionConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.key === "string" &&
    optionalString(item.displayName) &&
    optionalString(item.repository) &&
    Array.isArray(item.urls) &&
    item.urls.every((url) => typeof url === "string")
  );
}

export function resolveSources(extensions: ExtensionConfig[]): SourceConfig[] {
  return extensions.flatMap((extension) =>
    extension.urls.map((url) => ({ ...parseSourceUrl(extension.key, url), displayName: extension.displayName }))
  );
}

function parseSourceUrl(key: string, rawUrl: string): SourceConfig {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();

  if (host === "marketplace.visualstudio.com") {
    const marketplaceId = url.searchParams.get("itemName");
    if (!marketplaceId) {
      throw new Error(`VS Code Marketplace URL missing itemName: ${rawUrl}`);
    }
    return { key, platform: "marketplace", url: rawUrl, marketplaceId };
  }

  if (host === "open-vsx.org") {
    const parts = url.pathname.split("/").filter(Boolean);
    const extensionIndex = parts[0] === "extension" ? 1 : parts[0] === "api" ? 1 : -1;
    const publisher = extensionIndex >= 0 ? parts[extensionIndex] : undefined;
    const name = extensionIndex >= 0 ? parts[extensionIndex + 1] : undefined;
    if (!publisher || !name) {
      throw new Error(`Open VSX URL must look like https://open-vsx.org/extension/<namespace>/<name>: ${rawUrl}`);
    }
    return { key, platform: "openvsx", url: rawUrl, publisher, name };
  }

  if (host === "addons.mozilla.org") {
    const parts = url.pathname.split("/").filter(Boolean);
    const addonIndex = parts.indexOf("addon");
    const name = addonIndex >= 0 ? parts[addonIndex + 1] : undefined;
    if (!name) {
      throw new Error(`Mozilla Add-ons URL must contain /addon/<name>: ${rawUrl}`);
    }
    return { key, platform: "firefox", url: rawUrl, name };
  }

  if (host === "plugins.jetbrains.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const pluginIndex = parts.indexOf("plugin");
    const segment = pluginIndex >= 0 ? parts[pluginIndex + 1] : undefined;
    if (!segment) {
      throw new Error(`JetBrains Marketplace URL must contain /plugin/<id>: ${rawUrl}`);
    }
    const id = segment.split("-")[0];
    if (!id) {
      throw new Error(`JetBrains Marketplace URL missing plugin ID: ${rawUrl}`);
    }
    return { key, platform: "jetbrains", url: rawUrl, marketplaceId: id };
  }

  if (host === "www.npmjs.com" || host === "npmjs.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const packageIndex = parts.indexOf("package");
    if (packageIndex < 0) {
      throw new Error(`npm URL must look like https://npmjs.com/package/<name>: ${rawUrl}`);
    }
    const name = parts.slice(packageIndex + 1).join("/");
    if (!name) {
      throw new Error(`npm URL missing package name: ${rawUrl}`);
    }
    return { key, platform: "npm", url: rawUrl, name };
  }

  if (host === "hub.docker.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "_") {
      const name = parts[1];
      if (!name) throw new Error(`Docker Hub official repo URL missing name: ${rawUrl}`);
      return { key, platform: "docker", url: rawUrl, publisher: "library", name };
    } else {
      const rIndex = parts.indexOf("r");
      const publisher = rIndex >= 0 ? parts[rIndex + 1] : parts[0];
      const name = rIndex >= 0 ? parts[rIndex + 2] : parts[1];
      if (!publisher || !name) {
        throw new Error(`Docker Hub repo URL must look like https://hub.docker.com/r/<namespace>/<name>: ${rawUrl}`);
      }
      return { key, platform: "docker", url: rawUrl, publisher, name };
    }
  }

  if (host === "github.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`GitHub URL must look like https://github.com/<owner>/<repo>: ${rawUrl}`);
    }
    return { key, platform: "github", url: rawUrl, publisher: parts[0], name: parts[1] };
  }

  throw new Error(`Unsupported marketplace URL host: ${url.hostname}`);
}

export function platformsForSources(sources: SourceConfig[], platformFilter: Platform | null): SourceConfig[] {
  return platformFilter ? sources.filter((source) => source.platform === platformFilter) : sources;
}
