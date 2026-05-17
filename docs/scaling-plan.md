# Extension Tracker — 擴容與長期運行架構規劃

> 版本：v2（經 doc review 修正）
> 目標情境：**1,000 個套件 × 1,000 天**的可靠運行
> 審閱基準程式碼：`src/http.ts`、`src/main.ts`、`src/charts.ts`、`src/storage/jsonl.ts`、`.github/workflows/*.yml`

---

## 核心挑戰分析

### 1. API 速率限制與封鎖風險（Rate Limiting & IP Bans）

**現狀**

- `http.ts`：最多重試 3 次，指數退避 1s / 2s / 4s（`attempts` 預設值）
- 已有讀取 `Retry-After` header 的邏輯，取 `Math.max(backoff, retryAfter × 1000)`
- `main.ts`：`--concurrency` 預設 5

**已知問題**

- 每日 1000 套件 × 2 平台 = **2,000 個 API 請求**，高併發時極易觸發 429
- Retry-After 無上限保護：若 API 回傳 `Retry-After: 3600`，程式將等待 1 小時，但此後可能只剩 1 次重試機會就放棄
- 指數退避未加 Jitter，多個 worker 同時觸發 429 後會在同一時間點集體重試（Thundering Herd）

**解法**

- 修改 `http.ts`：
  - 最大重試次數提升至 **5–7 次**
  - 加入 **Jitter**（隨機 ±20% 浮動退避時間）
  - 加入 **max backoff cap**（如 60 秒），避免單次等待失控
- 在 `main.ts` 或獨立 `throttle.ts` 加入**全域 Rate Limiter**（Token Bucket 或固定間隔佇列），對同一 host 限制 RPS（建議 Marketplace ≤ 2 RPS，Open VSX ≤ 2 RPS）

---

### 2. GitHub Actions 執行時間與 Sharding（含 Push 競態問題）

**現狀**

- 兩個 workflow 各自循序執行，已有 `--shard` 參數（`main.ts:41-46` 的 `applyShard`）
- 加入 Rate Limiting 後，2000 個請求預估需要 15–40 分鐘

**已知問題（規劃 v1 遺漏）**

> [!CAUTION]
> 若直接用 `matrix: shard` 讓多個 Job 同時執行，每個 Job 結尾都會 `git pull --rebase → git push`。多個 Job 並行時極易發生 push 衝突，rebase 反覆失敗後整批資料遺失。這是 Sharding 方案的核心執行難點，**必須在設計階段解決**。

**Sharding 可行方案比較**

| 方案 | 說明 | 優點 | 缺點 |
|------|------|------|------|
| **A. Artifact 聚合** | 各 shard 用 `actions/upload-artifact` 上傳輸出，最後一個 merge job 統一 commit | 無競態，最穩健 | 需要額外的 merge job，流程較複雜 |
| **B. 循序 shard（needs 鏈）** | Shard 0 → Shard 1 → ... 各自 push，後一個 shard checkout 最新 commit | 實作簡單，零競態 | 無法真正平行，省時有限 |
| **C. 分目錄隔離 + 同時 push** | 每個 shard 只寫互不重疊的目錄，搭配重試 push（rebase loop） | 可平行，競態機率低 | 實作需審慎，重疊仍有風險 |

**建議採用方案 A（Artifact 聚合）**：

```yaml
# 概念結構
jobs:
  collect:
    strategy:
      matrix:
        shard: [0, 1, 2, 3, 4]
    steps:
      - run: npm run collect -- --shard=${{ matrix.shard }}/5
      - uses: actions/upload-artifact@v4
        with:
          name: data-shard-${{ matrix.shard }}
          path: output/

  commit:
    needs: collect
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: output/
          merge-multiple: true
      - run: git add output/ && git commit && git push
```

---

### 3. Git 儲存庫膨脹與效能退化（Repository Bloat）

**現狀**

- 所有 JSONL 與 SVG 皆 commit 至 `main` 分支
- SVG 透過 `peaceiris/actions-gh-pages@v4` 部署至 `gh-pages`，但 JSONL 資料留在 `main`

**規模估算（1000 套件 × 1000 天）**

- 每日 commit 包含約 **2,000 個檔案異動**（1000 JSONL 各增一行 + 1000 SVG 重新生成）
- 1,000 天後，Git pack 物件數量約 **2,000,000 個 blob**，pack 檔案體積預估達 **500 MB–2 GB**（視 SVG 壓縮率）
- GitHub 單一 repo 軟限制約 5 GB，`git clone` 與 `git pull` 速度將顯著退化

**解法**

1. **資料分支抽離（Orphan Branch）**
   - 將 `output/data/` 的 JSONL commit 改至獨立的 `data` orphan 分支
   - `main` 分支保持乾淨，僅存放程式碼與設定
   - SVG 繼續走現有 `gh-pages` 部署機制（已隔離，維持不變）

2. **調整 `fetch-depth`**
   - 現行 workflow 使用 `fetch-depth: 0`（完整克隆），在 repo 膨脹後每日 CI 時間代價顯著
   - 遷移至 Orphan Branch 後，checkout `data` 分支時應改為 `fetch-depth: 1`（淺克隆）
   - 注意：`git pull --rebase` 在淺克隆下需要 `--allow-unrelated-histories`，需要驗證

3. **定期 squash / gc（長期維護）**
   - 每月執行一次自動化腳本對 `data` 分支壓縮歷史 commit
   - 或設定資料保留策略（如僅保留近 180 天的逐日資料，更早的資料以月快照保存）

4. **外部資料庫（長期選項，需另行決策）**
   - SQLite 發布至 GitHub Releases（零伺服器成本，查詢需下載整個 DB）
   - Turso / Supabase 免費方案（需外部帳號依賴）
   - **建議：先以 Orphan Branch 方案維持 1–2 年，超出 GitHub 限制後再遷移**

---

### 4. 圖表渲染效能（charts.ts 潛在問題）

**現狀正確認知（規劃 v1 的誤解需更正）**

> [!NOTE]
> 規劃 v1 提出「動態隱藏 `<circle>` markers」，但 `charts.ts:102-104` 中，超過 **30 個資料點時 markers 已自動清空**（空字串）。此 TODO 對現行邏輯幾乎是 no-op，**不需要實作**。

**真正需要處理的問題**

#### 4-A. `xFor` 的 O(n²) 效能問題（規劃 v1 完全遺漏）

`charts.ts:51`：

```typescript
const index = Math.max(0, dates.indexOf(date)); // dates 是完整日期陣列，O(n) 搜尋
```

`generateDateRange` 在 1000 天後產生長度 1000 的字串陣列，`lttb` 在採樣過程中對每個點多次呼叫 `xFor`，形成 **O(n²) 熱路徑**。1000 天後每張圖表的渲染時間將線性惡化。

**修正**：在 `renderPlatformChart` 中預先建立 `Map<string, number>`：

```typescript
const dateIndex = new Map(dates.map((d, i) => [d, i]));
const xFor = (date: string): number => {
  if (dates.length <= 1) return PLOT.x + PLOT.width / 2;
  const index = dateIndex.get(date) ?? 0;
  return PLOT.x + (index / (dates.length - 1)) * PLOT.width;
};
```

#### 4-B. JSONL 全量讀取（規劃 v1 描述正確）

`storage/jsonl.ts:10`：

```typescript
const raw = await fs.readFile(filePath, "utf8"); // 全量讀取
```

1000 天後每個 JSONL 檔案約 **50–100 KB**（每行約 100 bytes）。雖然單檔不大，但 `collectTask` 在每次執行時讀取整個檔案再 append，是重複 I/O。  
未來可改為 `node:readline` stream 讀取；若只需「最後 N 筆做圖表」也可考慮只讀尾端。

---

### 5. 記憶體與 OOM 風險

**現狀**

- `runWithConcurrency` 限制同時執行的 task 數量，記憶體在 task 結束後 GC
- 最壞情況：`concurrency = 5` 時，同時有 5 個 task 各持有一份 JSONL 解析結果 + SVG 字串

**評估**

- 1000 天後單個 task 的記憶體峰值估算：JSONL 解析約 200 KB + SVG 字串約 50 KB = 約 250 KB
- 5 個並發 task ≈ 1.25 MB，**在 GitHub Actions (7 GB RAM) 環境下完全安全**
- **此問題短期內不需處理**，但若未來 concurrency 提高或每筆 snapshot 資料量增加（加入更多欄位），應再評估

---

## 🛠️ 修正後的 TODO 清單

### 階段一：API 請求穩定性（高優先）

- `[ ]` **`http.ts` 退避機制強化**
  - 最大重試次數提升至 5–7 次（由 caller 傳入 `attempts`）
  - 加入 Jitter（`waitMs *= 0.8 + Math.random() * 0.4`）
  - 加入 max backoff cap（上限 60,000 ms）
- `[ ]` **實作全域 Rate Limiter**
  - 建立 `src/throttle.ts`，提供 Token Bucket 或固定間隔 await
  - 在 `collectors/marketplace.ts` 與 `collectors/openVsx.ts` 的 fetch 前插入 throttle
  - 設定：Marketplace ≤ 2 RPS，Open VSX ≤ 2 RPS（可由 config 讀取）

### 階段二：GitHub Actions Sharding（高優先，需先確認方案）

- `[ ]` **決策 Sharding 方案**（建議方案 A：Artifact 聚合）
- `[ ]` **修改 `collect-vscode-marketplace.yml`**
  - 新增 `matrix: shard: [0,1,2,3,4]`（5 shard）
  - 各 shard job 以 `upload-artifact` 上傳 `output/data/` 與 `output/charts/`
  - 新增 `commit` job（`needs: collect`），`download-artifact + merge-multiple: true`，統一 commit & push
- `[ ]` **同步修改 `collect-open-vsx-registry.yml`**（同上結構）

### 階段三：Git 儲存架構（中優先）

- `[ ]` **建立 `data` orphan 分支**，遷移 `output/data/` 的 commit 目標
- `[ ]` **workflow 中調整 checkout 方式**：`data` 分支用 `fetch-depth: 1`，驗證 rebase 相容性
- `[ ]` **編寫月度維護腳本**（`scripts/gc-data-branch.sh`）：定期 squash `data` 分支歷史，搭配 cron trigger

### 階段四：圖表渲染與 I/O 效能（中優先）

- `[ ]` **修正 `charts.ts` `xFor` 的 O(n²) 問題**
  - 將 `dates.indexOf(date)` 改為 `Map<string, number>` 預建索引
  - 預估改動：`renderPlatformChart` 函式約 5 行修改
- `[ ]` **`storage/jsonl.ts` 讀取優化**（可延後至實際觀測到效能問題時）
  - 改用 `node:readline` stream 逐行解析，避免大字串 split

---

## 開放決策項目

> [!IMPORTANT]
> **決策 1：Sharding push 方案**
> 需在開始實作前確認採用方案 A（Artifact 聚合）、方案 B（循序 shard）或方案 C（分目錄隔離）。建議方案 A，但流程最複雜。

> [!IMPORTANT]
> **決策 2：資料長期儲存策略**
> Orphan Branch 是免伺服器的首選，但超出 GitHub 限制後需要外部 DB（Turso / SQLite in Releases）。目前建議先採 Orphan Branch，不在本次重構中引入外部依賴。

> [!NOTE]
> **決策 3：SVG 圖表簡化**
> 規劃 v1 提出移除 markers 換取效能，但 markers 在 >30 點時已自動移除。實際上可進一步評估是否移除最後一點的 `<text>` 標籤，影響輕微，可按需求決定。

---

## 驗證計畫

| 驗證項目 | 方法 |
|---------|------|
| Rate Limiter 正確性 | 本地跑 `npm run collect` 並觀察 request 間隔（可搭配 `--dry-run` flag） |
| Sharding 無資料遺漏 | 在 fork 或測試 repo 以 3 個 shard 跑一輪，驗證所有套件資料均正確 commit |
| `xFor` 效能改善 | 測量 1000 點資料下 `renderPlatformChart` 執行時間（`console.time`） |
| Git Bloat 控制 | 遷移至 `data` 分支後，`git count-objects -v` 確認 pack 物件數量下降 |
| `fetch-depth: 1` 相容性 | 在 CI 環境驗證淺克隆下 `git pull --rebase` 是否正常運作 |
