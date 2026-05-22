# extension-tracker

[English](../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md)

擴充套件的每日公開市場分析數據追蹤器。

`extension-tracker` 會收集公開的擴充套件市場數據，為每個產品/平台儲存一份 JSONL 歷史紀錄，並產生對應的 SVG 趨勢圖表。此儲存庫設計為可供 Fork 使用：只需修改 `config/extensions.json`、啟用 GitHub Actions，即可讓排程任務自動建立您專屬的公開分析歷史數據。

## 快速開始

1. Fork 本儲存庫。接著將儲存庫描述與網站 URL 更新為指向您自己的 GitHub Pages：

   ![Fork 後更新儲存庫網站 URL](assets/02_url_rename.png)

2. 編輯 [config/extensions.json](../config/extensions.json) 填入您的產品名稱與市場 URL。

   ![在 GitHub 上編輯 config/extensions.json](assets/03_edit_config_list.png)

3. 在本地端執行檢查：

   ```bash
   npm install
   npm run build
   npm test
   npm run collect
   npm run query -- latest
   ```

4. 提交您的設定檔與產生的 `output/` 基準數據。

5. 在您的 Fork 中啟用 GitHub Actions。

   ![在 Fork 中啟用 GitHub Actions](assets/04_enbale_workflow.png)

6. 從 Actions 頁籤手動執行一次供應商的工作流 (Workflows)，之後排程便會自動每日執行。

   ![從 Actions 頁籤手動執行工作流](assets/05_run_workflow.png)

   > **注意：** 資料收集從首次執行起算，不會回補執行前的歷史數據。

> **與上游同步：** 日後拉取上游更新時，`config/extensions.json` 已受 `.gitattributes` 保護——Git 會自動保留您 fork 的版本，不會被上游的示範設定覆蓋。

## 設定

[config/extensions.json](../config/extensions.json) 中的每個條目描述了一個產品。您只需提供一組穩定的 `key` 及要追蹤的公開市場 URL 即可。

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

欄位說明：

| 欄位 | 說明 |
|---|---|
| `key` | 穩定的產品鍵值，用於輸出檔名與圖表標籤。 |
| `displayName` | （選填）供維護者閱讀的人類可讀名稱。 |
| `repository` | （選填）原始碼儲存庫的 URL。 |
| `urls` | 要收集的市場頁面。收集器會從這些 URL 中自動推斷供應商專屬的 ID。 |

目前支援的 URL 格式：

| 供應商 | URL 格式 |
|---|---|
| VS Code Marketplace | `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>` |
| Open VSX Registry | `https://open-vsx.org/extension/<namespace>/<name>` |

### 預計支援：Chrome 線上應用程式商店 (Chrome Web Store)

為在未來支援 Chrome Web Store，我們將在不更動既有 `config/extensions.json` 格式的前提下，新增兩個架構模組：

1. **URL 解析器**：識別 `https://chromewebstore.google.com/detail/<name>/<extension_id>` 格式以提取擴充功能 ID。
2. **資料收集器**：由於 Chrome Web Store 沒有提供直接的公開 JSON API，收集器將會抓取 HTML 頁面，並從 DOM 結構或內嵌的腳本 metadata 中解析使用者人數、評分與版本。

### 其他潛在的 Marketplace

基於 URL 的設定方式，讓我們能非常輕易地將追蹤範圍擴展到其他生態系。未來可能的市場包含：

- **Chrome Web Store**（瀏覽器擴充功能）
- **Mozilla Add-ons (AMO)**（Firefox 擴充套件）
- **Microsoft Edge Add-ons**（Edge 擴充功能）
- **JetBrains Marketplace**（IntelliJ、WebStorm、PyCharm 外掛）
- **Raycast Store**（Raycast 擴充）
- **npm Registry**（CLI 工具或函式庫下載統計）
- **Docker Hub**（容器映像檔拉取次數）
- **GitHub Releases**（預先編譯的執行檔下載次數）

## 追蹤的產品 (Tracked Products)

> 以下項目為**示範用途**——每個支援的平台各舉一例。Fork 本儲存庫後，請替換為您自己的產品以開始追蹤。

| 產品鍵值 (Product key) | 儲存庫 (Repository) |
|---|---|
| `Pain-Labs.edo-tensei` | <https://github.com/Pain-Labs/Edo-Tensei> |
| `ublock-origin-firefox` | <https://github.com/gorhill/uBlock> |
| `ideavim-jetbrains` | <https://github.com/JetBrains/ideavim> |
| `typescript-npm` | <https://github.com/microsoft/TypeScript> |
| `ubuntu-docker` | <https://hub.docker.com/_/ubuntu> |
| `ripgrep-github` | <https://github.com/BurntSushi/ripgrep> |

## 指令 (Commands)

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

`npm run collect` 會收集設定檔中每一個支援的供應商 URL。供應商專屬的工作流會使用平台參數 (platform argument) 讓每個資料來源都能獨立失敗、重試或進行擴容。

## 擴容與架構 (Scaling & Architecture)

針對大規模設定（例如：1000 個擴充套件 × 1000 天的歷史紀錄），本儲存庫實作了多項強健的擴容機制：

1. **API 速率限制 (Rate Limiting)**：實作嚴格的 Token Bucket 演算法（預設每主機 2 RPS），並搭配指數退避 (Exponential backoff) 與隨機抖動 (Jitter)，以防止觸發 `429 Too Many Requests` 封鎖。
2. **矩陣分片 (Matrix Sharding)**：GitHub Actions 工作流會將收集任務分散到多個並行的矩陣 Job 中（例如 5 個 Shard），以加速執行時間。
3. **產物聚合 (Artifact Aggregation)**：各並行 Job 會將其獨立的 `output/` 目錄上傳為 Artifact。最後由一個專屬的 `commit` Job 下載所有 Artifacts 並進行單一 Commit 推送，徹底消除 Git push 的競態條件。
4. **孤兒資料分支 (Data Orphan Branch)**：為了避免 Git 儲存庫隨時間無限膨脹，歷史 JSONL 數據將會提交到獨立的 `data` orphan 分支，而非 `main` 分支。
5. **歷史數據回收 (History GC)**：提供月度維護腳本 (`gc-data-branch.yml`)，自動將 `data` 分支中超過 180 天的舊 Commit 壓縮 (Squash)，使儲存庫永遠保持極致輕量。

您也可以在本地端執行分片：

```bash
npm run collect -- marketplace --shard 0/10
npm run collect -- marketplace --shard 1/10
```

收集器會透過 `--concurrency` 限制 API 的並發數量（預設為 `5`），因此大型設定檔也不會一次發出所有的請求。

## 輸出檔案

所有產生的檔案皆位於 `output/` 目錄：

```text
output/
  data/
    winterdrive.virtual-tabs-marketplace.jsonl
    winterdrive.virtual-tabs-openvsx.jsonl
  charts/
    winterdrive.virtual-tabs-marketplace.svg
    winterdrive.virtual-tabs-openvsx.svg
```

這裡不會產生匯總的 `snapshots.jsonl`。如果您追蹤 1000 個產品，每個產品/平台的數據皆保持獨立隔離，您可以獨立檢查、重新生成或修復任何一個項目。

### 如何引用圖表 (GitHub Pages)

為避免 Git 儲存庫隨時間膨脹，產生的 SVG 圖表**不會**提交到 `main` 分支。相反地，GitHub Actions 會自動將這些圖表部署到專屬的 `gh-pages` 分支。

如要公開展示您的圖表：

1. 確保您的儲存庫設為 **Public (公開)**。
2. 前往儲存庫的 **Settings > Pages**。
3. 在 **Build and deployment** 下，將 Source 設為 **Deploy from a branch**。
4. Branch 選擇 **`gh-pages`** 與 `/ (root)`，然後點擊 **Save**。

   ![GitHub Pages 分支設定](assets/01_github_page.png)

啟用完成後，您就可以在任何 Markdown 檔案中，使用以下語法嵌入會每日自動更新的趨勢圖：

```markdown
![Marketplace 趨勢圖](https://<您的帳號>.github.io/<專案名稱>/<產品key>-marketplace.svg)
```

## 工作流 (Workflows)

供應商工作流是以資料來源來命名的。它們共用同一個 concurrency group，因此無論手動或排程觸發，皆會以佇列形式執行，避免同時寫入：

- `collect-vscode-marketplace.yml`: VS Code Marketplace, UTC 01:00 / 台北時間 09:00
- `collect-open-vsx-registry.yml`: Open VSX Registry, UTC 01:10 / 台北時間 09:10
