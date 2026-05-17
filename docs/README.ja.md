# extension-tracker

拡張機能向けの毎日の公開マーケットプレイス分析トラッカー。

`extension-tracker` は、公開されている拡張機能マーケットプレイスの統計を収集し、製品/プラットフォームごとに 1 つの JSONL 履歴を保存し、製品/プラットフォームごとに 1 つの SVG トレンドチャートを生成します。このリポジトリはフォークされるように設計されています。`config/extensions.json` を変更し、GitHub Actions を有効にすると、スケジュールされたコレクターが独自の公開分析履歴を自動的に構築します。

## クイックスタート

1. このリポジトリをフォークします。
2. [config/extensions.json](../config/extensions.json) を編集して、製品とマーケットプレイスの URL を指定します。
3. ローカルでチェックを実行します:

```bash
npm install
npm run build
npm test
npm run collect
npm run query -- latest
```

1. 設定と生成された `output/` ベースラインをコミットします。
2. フォークしたリポジトリで GitHub Actions を有効にします。
3. Actions タブからプロバイダーのワークフローを手動で 1 回実行すると、その後はスケジュールに従って毎日実行されます。

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

## スケーリングとアーキテクチャ (Scaling & Architecture)

大規模な設定（例：1000 拡張機能 × 1000 日間の履歴追跡）に対応するため、このリポジトリにはいくつかの堅牢なスケーリングメカニズムが実装されています。

1. **API レート制限 (Rate Limiting)**: `429 Too Many Requests` によるブロックを防ぐため、ホストごとの厳格な Token Bucket レート制限（デフォルト 2 RPS）と Exponential Backoff および Jitter を適用します。
2. **マトリックスシャーディング (Matrix Sharding)**: GitHub Actions のワークフローは、データ収集を並列マトリックスジョブ（例：5 つのシャード）に分散し、実行を高速化します。
3. **アーティファクト集約 (Artifact Aggregation)**: 並列ジョブはそれぞれ独立した `output/` ディレクトリをアーティファクトとしてアップロードします。最後に専用の `commit` ジョブがすべてのアーティファクトをダウンロードし、1 回のコミットでプッシュすることで Git プッシュの競合を完全に排除します。
4. **データ専用ブランチ (Data Orphan Branch)**: Git リポジトリが時間とともに肥大化するのを防ぐため、履歴 JSONL データは `main` ではなく完全に独立した `data` ブランチにコミットされます。
5. **履歴 GC (History GC)**: 月次メンテナンワークフロー (`gc-data-branch.yml`) が、180 日より古い `data` ブランチのコミットを自動的にスカッシュ (Squash) し、リポジトリを極めて軽量に保ちます。

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

## ワークフロー (Workflows)

プロバイダーワークフローはデータソースごとに命名されています。これらは同じ同時実行グループ (concurrency group) を共有しているため、手動実行またはスケジュール実行時にチャート/データが同時に書き込まれるのを防ぎます。

- `collect-vscode-marketplace.yml`: VS Code Marketplace, UTC 01:00 / JST 10:00
- `collect-open-vsx-registry.yml`: Open VSX Registry, UTC 01:10 / JST 10:10
