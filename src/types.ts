export type Platform =
  | "marketplace"
  | "openvsx"
  | "firefox"
  | "jetbrains"
  | "npm"
  | "docker"
  | "github";

export interface ExtensionConfig {
  key: string;
  displayName?: string;
  repository?: string;
  urls: string[];
}

export interface SourceConfig {
  key: string;
  displayName?: string;
  platform: Platform;
  url: string;
  marketplaceId?: string;
  publisher?: string;
  name?: string;
}

export interface Snapshot {
  snapshot_date: string;
  fetched_at: string;
  platform: Platform;
  extension_id: string;
  version: string;
  install_count: number | null;
  download_count: number | null;
  avg_rating: number | null;
  rating_count: number | null;
}

export interface CollectorError {
  fetched_at: string;
  platform: Platform;
  extension_id: string;
  error: string;
}
