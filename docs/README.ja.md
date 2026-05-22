# extension-tracker

[English](../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md)

拡張機能向けの毎日の公開マーケットプレイス分析トラッカー。

`extension-tracker` は、公開されている拡張機能マーケットプレイスの統計を収集し、製品/プラットフォームごとに 1 つの JSONL 履歴を保存し、製品/プラットフォームごとに 1 つの SVG トレンドチャートを生成します。このリポジトリはフォークされるように設計されています。`config/extensions.json` を変更し、GitHub Actions を有効にすると、スケジュールされたコレクターが独自の公開分析履歴を自動的に構築します。

## クイックスタート

1. このリポジトリをフォークします。その後、リポジトリの説明とウェブサイト URL を自分の GitHub Pages へ更新します：

   ![フォーク後にリポジトリのウェブサイト URL を更新](assets/02_url_rename.png)

2. [config/extensions.json](../config/extensions.json) を編集して、製品とマーケットプレイスの URL を指定します。

   ![GitHub 上で config/extensions.json を編集](assets/03_edit_config_list.png)

3. ローカルでチェックを実行します:

   ```bash
   npm install
   npm run build
   npm test
   npm run collect
   npm run query -- latest
   ```

4. 設定と生成された `output/` ベースラインをコミットします。

5. フォークしたリポジトリで GitHub Actions を有効にします。

   ![フォークで GitHub Actions を有効化](assets/04_enbale_workflow.png)

6. Actions タブからプロバイダーのワークフローを手動で 1 回実行すると、その後はスケジュールに従って毎日実行されます。

   ![Actions タブからワークフローを手動実行](assets/05_run_workflow.png)

   > **注意：** データ収集はこの初回実行から開始されます。それ以前の日付への遡及取得は行われません。

> **上流との同期：** 将来、上流の更新を取り込む際、`config/extensions.json` は `.gitattributes` によって保護されています——Git は自動的にあなたのフォーク版を保持し、上流のデモ設定で上書きされることはありません。

## 設定

[config/extensions.json](../config/extensions.json) の各エントリは 1 つの製品を表します。安定した `key` と、追跡対象の公開マーケットプレイス URL のみを提供します。

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

フィールド:

| フィールド | 目的 |
|---|---|
| `key` | 出力ファイル名とチャートラベルに使用される安定した製品キー。 |
| `displayName` | （オプション）メンテナンス用の人間が読める名前。 |
| `repository` | （オプション）ソースリポジトリの URL。 |
| `urls` | 収集するマーケットプレイスのページ。コレクターはこれらの URL からプロバイダー固有の ID を推論します。 |

現在サポートされている URL 形式:

| プロバイダー | URL 形式 |
|---|---|
| VS Code Marketplace | `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>` |
| Open VSX Registry | `https://open-vsx.org/extension/<namespace>/<name>` |

### 今後の予定：Chrome ウェブストア (Chrome Web Store) のサポート

将来的に Chrome ウェブストアをサポートするため、ユーザー向けの設定ファイル `config/extensions.json` の形式を維持したまま、以下の 2 つの機能を追加する予定です：

1. **URL パーサー**：`https://chromewebstore.google.com/detail/<name>/<extension_id>` 形式を認識し、拡張機能 ID を抽出します。
2. **コレクター**：Chrome ウェブストアには統計情報用の直接的な公開 JSON API がないため、コレクターは HTML ページを取得し、DOM 構造や埋め込まれたスクリプトのメタデータからユーザー数、評価、バージョンを解析する必要があります。

### その他の潜在的なマーケットプレイス

URL ベースの設定方式により、他のエコシステムへの追跡の拡張が非常に容易になります。将来サポートされる可能性のある市場には以下が含まれます：

- **Chrome Web Store**（ブラウザ拡張機能）
- **Mozilla Add-ons (AMO)**（Firefox 拡張機能）
- **Microsoft Edge Add-ons**（Edge 拡張機能）
- **JetBrains Marketplace**（IntelliJ、WebStorm、PyCharm プラグイン）
- **Raycast Store**（Raycast 拡張機能）
- **npm Registry**（CLI ツールやライブラリのダウンロード統計）
- **Docker Hub**（コンテナイメージのプル回数）
- **GitHub Releases**（コンパイル済みバイナリのダウンロード回数）

## 追跡対象の製品 (Tracked Products)

> 以下のエントリは**デモ用のサンプル**です——サポートされている各プロバイダーにつき 1 製品を例示しています。このリポジトリをフォークして、追跡を始めるにはご自身の製品に置き換えてください。

| 製品キー (Product key) | リポジトリ (Repository) |
|---|---|
| `Pain-Labs.edo-tensei` | <https://github.com/Pain-Labs/Edo-Tensei> |
| `ublock-origin-firefox` | <https://github.com/gorhill/uBlock> |
| `ideavim-jetbrains` | <https://github.com/JetBrains/ideavim> |
| `typescript-npm` | <https://github.com/microsoft/TypeScript> |
| `ubuntu-docker` | <https://hub.docker.com/_/ubuntu> |
| `ripgrep-github` | <https://github.com/BurntSushi/ripgrep> |

## コマンド (Commands)

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

`npm run collect` は設定ファイル内のサポートされているすべてのプロバイダー URL を収集します。プロバイダー固有のワークフローはプラットフォーム引数を使用するため、各データソースは独立して失敗、再試行、またはスケーリングできます。

## スケーリングとアーキテクチャ (Scaling & Architecture)

大規模な設定（例：1000 拡張機能 × 1000 日間の履歴追跡）に対応するため、このリポジトリにはいくつかの堅牢なスケーリングメカニズムが実装されています。

1. **API レート制限 (Rate Limiting)**: `429 Too Many Requests` によるブロックを防ぐため、ホストごとの厳格な Token Bucket レート制限（デフォルト 2 RPS）と Exponential Backoff および Jitter を適用します。
2. **マトリックスシャーディング (Matrix Sharding)**: GitHub Actions のワークフローは、データ収集を並列マトリックスジョブ（例：5 つのシャード）に分散し、実行を高速化します。
3. **アーティファクト集約 (Artifact Aggregation)**: 並列ジョブはそれぞれ独立した `output/` ディレクトリをアーティファクトとしてアップロードします。最後に専用の `commit` ジョブがすべてのアーティファクトをダウンロードし、1 回のコミットでプッシュすることで Git プッシュの競合を完全に排除します。
4. **データ専用ブランチ (Data Orphan Branch)**: Git リポジトリが時間とともに肥大化するのを防ぐため、履歴 JSONL データは `main` ではなく完全に独立した `data` ブランチにコミットされます。
5. **履歴 GC (History GC)**: 月次メンテナンワークフロー (`gc-data-branch.yml`) が、180 日より古い `data` ブランチのコミットを自動的にスカッシュ (Squash) し、リポジトリを極めて軽量に保ちます。

ローカルでシャーディングを実行することもできます：

```bash
npm run collect -- marketplace --shard 0/10
npm run collect -- marketplace --shard 1/10
```

コレクターは `--concurrency` を使用して API の同時実行数を制限します（デフォルトは `5`）。そのため、大規模な設定でもすべてのリクエストを一度に送信することはありません。

## 出力ファイル

生成されたすべてのファイルは `output/` に保存されます:

```text
output/
  data/
    winterdrive.virtual-tabs-marketplace.jsonl
    winterdrive.virtual-tabs-openvsx.jsonl
  charts/
    winterdrive.virtual-tabs-marketplace.svg
    winterdrive.virtual-tabs-openvsx.svg
```

集約された `snapshots.jsonl` は生成されません。1000 個の製品を追跡する場合でも、各製品/プラットフォームのシリーズは独立したままであり、個別に検査、再生成、または修復できます。

### チャートの埋め込み方法 (GitHub Pages)

Git リポジトリの肥大化を防ぐため、生成された SVG チャートは `main` ブランチには**コミットされません**。代わりに、GitHub Actions が自動的にチャートを専用の `gh-pages` ブランチにデプロイします。

チャートを公開するには：

1. リポジトリが **Public (公開)** であることを確認します。
2. **Settings > Pages** に移動します。
3. **Build and deployment** の下で、Source を **Deploy from a branch** に設定します。
4. Branch として **`gh-pages`** と `/ (root)` を選択し、**Save** をクリックします。

   ![GitHub Pages のブランチ設定](assets/01_github_page.png)

有効になると、以下のマークダウン構文を使用して、毎日自動更新されるチャートを任意の場所に埋め込むことができます：

```markdown
![Marketplace トレンド](https://<ユーザー名>.github.io/<リポジトリ名>/<製品キー>-marketplace.svg)
```

## ワークフロー (Workflows)

プロバイダーワークフローはデータソースごとに命名されています。これらは同じ同時実行グループ (concurrency group) を共有しているため、手動実行またはスケジュール実行時にチャート/データが同時に書き込まれるのを防ぎます。

- `collect-vscode-marketplace.yml`: VS Code Marketplace, UTC 01:00 / JST 10:00
- `collect-open-vsx-registry.yml`: Open VSX Registry, UTC 01:10 / JST 10:10
