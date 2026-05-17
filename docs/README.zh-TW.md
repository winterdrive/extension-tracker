# extension-tracker

[English](../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

擴充套件的每日公開市場分析數據追蹤器。

`extension-tracker` 會收集公開的擴充套件市場數據，為每個產品/平台儲存一份 JSONL 歷史紀錄，並產生對應的 SVG 趨勢圖表。此儲存庫設計為可供 Fork 使用：只需修改 `config/extensions.json`、啟用 GitHub Actions，即可讓排程任務自動建立您專屬的公開分析歷史數據。

## 快速開始

1. Fork 本儲存庫。
2. 編輯 [config/extensions.json](../config/extensions.json) 填入您的產品名稱與市場 URL。
3. 在本地端執行檢查：

```bash
npm install
npm run build
npm test
npm run collect
npm run query -- latest
```

1. 提交您的設定檔與產生的 `output/` 基準數據。
2. 在您的 Fork 中啟用 GitHub Actions。
3. 從 Actions 頁籤手動執行一次供應商的工作流 (Workflows)，之後排程便會自動每日執行。

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

## 擴容與架構 (Scaling & Architecture)

針對大規模設定（例如：1000 個擴充套件 × 1000 天的歷史紀錄），本儲存庫實作了多項強健的擴容機制：

1. **API 速率限制 (Rate Limiting)**：實作嚴格的 Token Bucket 演算法（預設每主機 2 RPS），並搭配指數退避 (Exponential backoff) 與隨機抖動 (Jitter)，以防止觸發 `429 Too Many Requests` 封鎖。
2. **矩陣分片 (Matrix Sharding)**：GitHub Actions 工作流會將收集任務分散到多個並行的矩陣 Job 中（例如 5 個 Shard），以加速執行時間。
3. **產物聚合 (Artifact Aggregation)**：各並行 Job 會將其獨立的 `output/` 目錄上傳為 Artifact。最後由一個專屬的 `commit` Job 下載所有 Artifacts 並進行單一 Commit 推送，徹底消除 Git push 的競態條件。
4. **孤兒資料分支 (Data Orphan Branch)**：為了避免 Git 儲存庫隨時間無限膨脹，歷史 JSONL 數據將會提交到獨立的 `data` orphan 分支，而非 `main` 分支。
5. **歷史數據回收 (History GC)**：提供月度維護腳本 (`gc-data-branch.yml`)，自動將 `data` 分支中超過 180 天的舊 Commit 壓縮 (Squash)，使儲存庫永遠保持極致輕量。

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

## 工作流 (Workflows)

供應商工作流是以資料來源來命名的。它們共用同一個 concurrency group，因此無論手動或排程觸發，皆會以佇列形式執行，避免同時寫入：

- `collect-vscode-marketplace.yml`: VS Code Marketplace, UTC 01:00 / 台北時間 09:00
- `collect-open-vsx-registry.yml`: Open VSX Registry, UTC 01:10 / 台北時間 09:10
