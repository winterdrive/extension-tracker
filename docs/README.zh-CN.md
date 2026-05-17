# extension-tracker

[English](../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

扩展插件的每日公开市场分析数据追踪器。

`extension-tracker` 会收集公开的扩展插件市场数据，为每个产品/平台存储一份 JSONL 历史记录，并生成对应的 SVG 趋势图表。此存储库设计为可供 Fork 使用：只需修改 `config/extensions.json`、启用 GitHub Actions，即可让计划任务自动建立您专属的公开分析历史数据。

## 快速开始

1. Fork 本存储库。
2. 编辑 [config/extensions.json](../config/extensions.json) 填入您的产品名称与市场 URL。
3. 在本地执行检查：

```bash
npm install
npm run build
npm test
npm run collect
npm run query -- latest
```

1. 提交您的配置文件与生成的 `output/` 基准数据。
2. 在您的 Fork 中启用 GitHub Actions。
3. 从 Actions 选项卡手动执行一次供应商的工作流 (Workflows)，之后计划任务便会自动每日运行。

## 配置

[config/extensions.json](../config/extensions.json) 中的每个条目描述了一个产品。您只需提供一组稳定的 `key` 及要追踪的公开市场 URL 即可。

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

字段说明：

| 字段 | 说明 |
|---|---|
| `key` | 稳定的产品键值，用于输出文件名与图表标签。 |
| `displayName` | （选填）供维护者阅读的人类可读名称。 |
| `repository` | （选填）源码存储库的 URL。 |
| `urls` | 要收集的市场页面。收集器会从这些 URL 中自动推断供应商专属的 ID。 |

目前支持的 URL 格式：

| 供应商 | URL 格式 |
|---|---|
| VS Code Marketplace | `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>` |
| Open VSX Registry | `https://open-vsx.org/extension/<namespace>/<name>` |

## 扩容与架构 (Scaling & Architecture)

针对大规模配置（例如：1000 个扩展插件 × 1000 天的历史记录），本存储库实现了一系列强健的扩容机制：

1. **API 速率限制 (Rate Limiting)**：实现严格的 Token Bucket 算法（默认每主机 2 RPS），并搭配指数退避 (Exponential backoff) 与随机抖动 (Jitter)，以防止触发 `429 Too Many Requests` 封锁。
2. **矩阵分片 (Matrix Sharding)**：GitHub Actions 工作流会将收集任务分散到多个并行的矩阵 Job 中（例如 5 个 Shard），以加速执行时间。
3. **产物聚合 (Artifact Aggregation)**：各并行 Job 会将其独立的 `output/` 目录上传为 Artifact。最后由一个专属的 `commit` Job 下载所有 Artifacts 并进行单一 Commit 推送，彻底消除 Git push 的竞态条件。
4. **孤儿数据分支 (Data Orphan Branch)**：为了避免 Git 存储库随时间无限膨胀，历史 JSONL 数据将会提交到独立的 `data` orphan 分支，而非 `main` 分支。
5. **历史数据回收 (History GC)**：提供月度维护脚本 (`gc-data-branch.yml`)，自动将 `data` 分支中超过 180 天的旧 Commit 压缩 (Squash)，使存储库永远保持极致轻量。

## 输出文件

所有生成的文件皆位于 `output/` 目录：

```text
output/
  data/
    winterdrive.virtual-tabs-marketplace.jsonl
    winterdrive.virtual-tabs-openvsx.jsonl
  charts/
    winterdrive.virtual-tabs-marketplace.svg
    winterdrive.virtual-tabs-openvsx.svg
```

这里不会产生汇总的 `snapshots.jsonl`。如果您追踪 1000 个产品，每个产品/平台的数据皆保持独立隔离，您可以独立检查、重新生成或修复任何一个项目。

## 工作流 (Workflows)

供应商工作流是以数据来源来命名的。它们共用同一个 concurrency group，因此无论手动或计划触发，皆会以队列形式执行，避免同时写入：

- `collect-vscode-marketplace.yml`: VS Code Marketplace, UTC 01:00 / 北京时间 09:00
- `collect-open-vsx-registry.yml`: Open VSX Registry, UTC 01:10 / 北京时间 09:10
