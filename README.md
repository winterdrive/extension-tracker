# extension-tracker

Daily public marketplace analytics for extensions.

`extension-tracker` collects public extension marketplace stats, stores one JSONL series per product/platform, and generates one SVG trend chart per product/platform. The repo is designed to be forked: change `config/extensions.json`, enable GitHub Actions, and let scheduled collectors build your own public analytics history.

## Quick Start

1. Fork this repository.
2. Edit [config/extensions.json](config/extensions.json) with your products and marketplace URLs.
3. Run a local check:

```bash
npm install
npm run build
npm test
npm run collect
npm run query -- latest
```

1. Commit your config plus the generated `output/` baseline.
2. Enable GitHub Actions in your fork.
3. Run the provider workflows manually once from the Actions tab, then let the schedules continue daily.

## Configuration

Each entry in [config/extensions.json](config/extensions.json) describes one product. You only provide a stable `key` and the public marketplace URLs to track.

```json
{
  "key": "publisher.product-name",
  "displayName": "Readable Name",
  "repository": "https://github.com/owner/repo",
  "urls": [
    "https://marketplace.visualstudio.com/items?itemName=publisher.extension-name",
    "https://open-vsx.org/extension/publisher/extension-name"
  ]
}
```

Fields:

| Field | Purpose |
|---|---|
| `key` | Stable product key used for output filenames and chart labels. |
| `displayName` | Optional human-readable name for maintainers. |
| `repository` | Optional source repository URL. |
| `urls` | Marketplace pages to collect. The collector infers provider-specific IDs from these URLs. |

Currently supported URL formats:

| Provider | URL format |
|---|---|
| VS Code Marketplace | `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>` |
| Open VSX Registry | `https://open-vsx.org/extension/<namespace>/<name>` |

### Planned: Chrome Web Store Support

To support Chrome Web Store in the future, the architecture requires two new additions while keeping the user-facing `config/extensions.json` identical:

1. **URL Parser**: Recognize `https://chromewebstore.google.com/detail/<name>/<extension_id>` to extract the extension ID.
2. **Collector**: Since Chrome Web Store doesn't provide a straightforward public JSON API for stats, the collector will likely need to fetch the HTML page and parse the user count, rating, and version from the DOM structure or embedded script metadata.

### Other Potential Marketplaces

The URL-based configuration makes it trivial to expand tracking to other ecosystems. Potential future marketplaces include:

- **Chrome Web Store** (Browser extensions)
- **Mozilla Add-ons (AMO)** (Firefox extensions)
- **Microsoft Edge Add-ons** (Edge extensions)
- **JetBrains Marketplace** (IntelliJ, WebStorm, PyCharm plugins)
- **Raycast Store** (Raycast extensions)
- **npm Registry** (CLI tools or library download stats)
- **Docker Hub** (Container image pulls)
- **GitHub Releases** (Download counts for pre-compiled binaries)

## Tracked Products

| Product key | Repository |
|---|---|
| `winterdrive.virtual-tabs` | <https://github.com/winterdrive/vscode-virtual-tabs> |
| `winterdrive.quick-prompt` | <https://github.com/winterdrive/vscode-quick-prompt> |
| `Pain-Labs.edo-tensei` | <https://github.com/Pain-Labs/Edo-Tensei> |

## Commands

```bash
npm install
npm run build
npm test
npm run collect
npm run collect -- marketplace
npm run collect -- openvsx
npm run collect -- marketplace --shard 0/10 --concurrency 5
npm run query -- latest
npm run query -- trend winterdrive.virtual-tabs --days 30
npm run query -- releases winterdrive.virtual-tabs
npm run query -- export snapshots.csv
```

`npm run collect` collects every supported provider URL in the config. Provider-specific workflows use the platform argument so each data source can fail, retry, or scale independently.

## Outputs

All generated files live under `output/`:

```text
output/
  data/
    winterdrive.virtual-tabs-marketplace.jsonl
    winterdrive.virtual-tabs-openvsx.jsonl
  charts/
    winterdrive.virtual-tabs-marketplace.svg
    winterdrive.virtual-tabs-openvsx.svg
```

There is no `latest.md` and no aggregate `snapshots.jsonl`. If you track 1000 products, each product/platform series remains isolated and can be inspected, regenerated, or repaired independently.

## Workflows

Provider workflows are named by data source so future sources remain distinguishable. They share a concurrency group so manual or scheduled runs queue instead of writing charts/data at the same time:

- `collect-vscode-marketplace.yml`: VS Code Marketplace, UTC 01:00 / Asia-Taipei 09:00
- `collect-open-vsx-registry.yml`: Open VSX Registry, UTC 01:10 / Asia-Taipei 09:10

If a future tracker adds Chrome Web Store, it should use a separate provider-specific workflow such as `collect-chrome-web-store.yml`.

## Scaling & Architecture

For larger configs (e.g., 1000 extensions tracked over 1000 days), this repository implements several robust scaling mechanisms:

1. **API Rate Limiting**: Enforces a strict per-host Token Bucket rate limit (default 2 RPS) with exponential backoff and jitter to prevent `429 Too Many Requests` bans.
2. **Matrix Sharding**: The GitHub Actions workflows distribute data collection across parallel matrix jobs (e.g., 5 shards) for faster execution.
3. **Artifact Aggregation**: Parallel matrix jobs upload their isolated `output/` directories as artifacts. A dedicated `commit` job then downloads all artifacts and pushes them in a single commit, eliminating Git push race conditions.
4. **Data Orphan Branch**: To prevent the Git repository from ballooning over time, the JSONL historical data is committed to a completely separate `data` orphan branch rather than `main`.
5. **History GC**: A monthly maintenance workflow (`gc-data-branch.yml`) automatically squashes `data` branch commits older than 180 days to keep the repository extremely lightweight.

You can also run sharding locally:

```bash
npm run collect -- marketplace --shard 0/10
npm run collect -- marketplace --shard 1/10
```

The collector limits API concurrency with `--concurrency`, defaulting to `5`, so a large config does not fire every request at once.
