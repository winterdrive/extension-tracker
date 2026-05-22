# extension-tracker

[English](README.md) | [繁體中文](docs/README.zh-TW.md) | [简体中文](docs/README.zh-CN.md) | [日本語](docs/README.ja.md) | [한국어](docs/README.ko.md) | [Español](docs/README.es.md)

Daily public marketplace analytics for extensions.

`extension-tracker` collects public extension marketplace stats, stores one JSONL series per product/platform, and generates one SVG trend chart per product/platform. The repo is designed to be forked: change `config/extensions.json`, enable GitHub Actions, and let scheduled collectors build your own public analytics history.

## Quick Start

1. Fork this repository. Then update the repository description and website URL to point to your own GitHub Pages:

   ![Update repository website URL after forking](docs/assets/02_url_rename.png)

2. Edit [config/extensions.json](config/extensions.json) with your products and marketplace URLs.

   ![Edit config/extensions.json on GitHub](docs/assets/03_edit_config_list.png)

3. Run a local check:

   ```bash
   npm install
   npm run build
   npm test
   npm run collect
   npm run query -- latest
   ```

4. Commit your config plus the generated `output/` baseline.

5. Enable GitHub Actions in your fork.

   ![Enable GitHub Actions in your fork](docs/assets/04_enbale_workflow.png)

6. Run the provider workflows manually once from the Actions tab, then let the schedules continue daily.

   ![Run workflow manually from the Actions tab](docs/assets/05_run_workflow.png)

   > **Note:** Data collection starts from this first run. There is no backfill for dates before your initial collection.

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

| Provider | URL format | Data source |
| --- | --- | --- |
| VS Code Marketplace | `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>` | Official REST API |
| Open VSX Registry | `https://open-vsx.org/extension/<namespace>/<name>` | Official REST API |
| Mozilla Add-ons (Firefox) | `https://addons.mozilla.org/en-US/firefox/addon/<slug>/` | Official REST API |
| JetBrains Marketplace | `https://plugins.jetbrains.com/plugin/<id>-<name>` | Official REST API |
| npm Registry | `https://www.npmjs.com/package/<name>` | Official downloads API |
| Docker Hub | `https://hub.docker.com/r/<namespace>/<name>` or `https://hub.docker.com/_/<name>` | Official REST API |
| GitHub Releases | `https://github.com/<owner>/<repo>` | Official REST API |

### Not Yet Supported

The following platforms do not have a public stats API and their store pages are JavaScript-rendered SPAs. HTML scraping is unreliable in CI without a headless browser, which is not practical on GitHub Actions free runners.

| Platform | Reason |
| --- | --- |
| **Chrome Web Store** | No public API; page data loaded client-side via JS |
| **Microsoft Edge Add-ons** | No public API; page data loaded client-side via JS |
| **Raycast Store** | No public API; macOS-only SPA with no server-rendered stats |

These platforms will be reconsidered if they expose a public stats API in the future.

## Tracked Products

> The entries below are **demonstration examples** — one product per supported provider. Fork this repository and replace them with your own products to start tracking.

| Product key | Repository |
|---|---|
| `Pain-Labs.edo-tensei` | <https://github.com/Pain-Labs/Edo-Tensei> |
| `ublock-origin-firefox` | <https://github.com/gorhill/uBlock> |
| `ideavim-jetbrains` | <https://github.com/JetBrains/ideavim> |
| `typescript-npm` | <https://github.com/microsoft/TypeScript> |
| `ubuntu-docker` | <https://hub.docker.com/_/ubuntu> |
| `ripgrep-github` | <https://github.com/BurntSushi/ripgrep> |

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

### How to Embed Charts (GitHub Pages)

To prevent Git repository bloat, SVG charts are **not** committed to the `main` branch. Instead, GitHub Actions automatically deploys the generated charts to a dedicated `gh-pages` branch.

To display your charts:

1. Ensure your repository is **Public**.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose the **`gh-pages`** branch and `/ (root)`, then click **Save**.

   ![GitHub Pages branch configuration](docs/assets/01_github_page.png)

Once enabled, you can embed your auto-updating charts in any markdown file using standard image syntax:

```markdown
![Marketplace Trend](https://<your-username>.github.io/<your-repo>/<product-key>-marketplace.svg)
```

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
