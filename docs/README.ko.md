# extension-tracker

[English](../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md)

익스텐션을 위한 일일 공개 마켓플레이스 분석 트래커.

`extension-tracker`는 공개된 익스텐션 마켓플레이스 통계를 수집하고, 제품/플랫폼당 하나의 JSONL 시계열을 저장하며, 제품/플랫폼당 하나의 SVG 트렌드 차트를 생성합니다. 이 리포지토리는 포크(Fork)하여 사용하도록 설계되었습니다: `config/extensions.json`을 수정하고, GitHub Actions를 활성화하면 예약된 수집기가 여러분만의 공개 분석 기록을 구축합니다.

## 빠른 시작 (Quick Start)

1. 이 리포지토리를 포크합니다. 그런 다음 리포지토리 설명과 웹사이트 URL을 자신의 GitHub Pages로 업데이트합니다:

   ![포크 후 리포지토리 웹사이트 URL 업데이트](assets/02_url_rename.png)

2. [config/extensions.json](../config/extensions.json)을 편집하여 제품과 마켓플레이스 URL을 지정합니다.

   ![GitHub에서 config/extensions.json 편집](assets/03_edit_config_list.png)

3. 로컬에서 확인 작업을 실행합니다:

   ```bash
   npm install
   npm run build
   npm test
   npm run collect
   npm run query -- latest
   ```

4. 구성 파일과 생성된 `output/` 기준 데이터를 커밋합니다.

5. 포크한 리포지토리에서 GitHub Actions를 활성화합니다.

   ![포크에서 GitHub Actions 활성화](assets/04_enbale_workflow.png)

6. Actions 탭에서 제공자 워크플로우를 수동으로 한 번 실행하면 이후부터는 예약된 일정에 따라 매일 실행됩니다.

   ![Actions 탭에서 워크플로우 수동 실행](assets/05_run_workflow.png)

   > **참고:** 데이터 수집은 이 첫 번째 실행부터 시작됩니다. 최초 수집 이전 날짜에 대한 소급 수집은 지원되지 않습니다.

> **업스트림 동기화:** 향후 이 리포지토리에서 업데이트를 가져올 때, `config/extensions.json`은 `.gitattributes`로 보호됩니다——Git이 자동으로 포크 버전을 유지하며 업스트림의 데모 설정으로 덮어쓰지 않습니다.

## 구성 (Configuration)

[config/extensions.json](../config/extensions.json)의 각 항목은 하나의 제품을 설명합니다. 안정적인 `key`와 추적할 공개 마켓플레이스 URL만 제공하면 됩니다.

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

필드 설명:

| 필드 | 목적 |
|---|---|
| `key` | 출력 파일명 및 차트 레이블에 사용되는 안정적인 제품 키입니다. |
| `displayName` | (선택 사항) 유지 관리자를 위해 사람이 읽을 수 있는 이름입니다. |
| `repository` | (선택 사항) 소스 리포지토리 URL입니다. |
| `urls` | 수집할 마켓플레이스 페이지들입니다. 수집기는 이 URL에서 제공자 고유의 ID를 유추합니다. |

현재 지원되는 URL 형식:

| 제공자 | URL 형식 |
|---|---|
| VS Code Marketplace | `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>` |
| Open VSX Registry | `https://open-vsx.org/extension/<namespace>/<name>` |

### 향후 지원 예정: Chrome 웹 스토어 (Chrome Web Store)

향후 Chrome 웹 스토어를 지원하기 위해 기존의 `config/extensions.json` 파일 형식을 유지하면서 두 가지 아키텍처를 추가할 예정입니다:

1. **URL 파서**: `https://chromewebstore.google.com/detail/<name>/<extension_id>` 형식을 인식하여 익스텐션 ID를 추출합니다.
2. **수집기 (Collector)**: Chrome 웹 스토어는 통계를 위한 직접적인 공개 JSON API를 제공하지 않으므로, 수집기가 HTML 페이지를 가져와 DOM 구조나 내장된 스크립트 메타데이터에서 사용자 수, 평점, 버전을 구문 분석(Parsing)해야 합니다.

### 기타 잠재적인 마켓플레이스

URL 기반 구성 방식을 사용하면 다른 생태계로 추적을 확장하는 것이 매우 쉽습니다. 향후 지원될 가능성이 있는 시장은 다음과 같습니다:

- **Chrome Web Store** (브라우저 익스텐션)
- **Mozilla Add-ons (AMO)** (Firefox 익스텐션)
- **Microsoft Edge Add-ons** (Edge 익스텐션)
- **JetBrains Marketplace** (IntelliJ, WebStorm, PyCharm 플러그인)
- **Raycast Store** (Raycast 익스텐션)
- **npm Registry** (CLI 도구 또는 라이브러리 다운로드 통계)
- **Docker Hub** (컨테이너 이미지 풀 횟수)
- **GitHub Releases** (사전 컴파일된 바이너리 다운로드 횟수)

## 추적되는 제품 (Tracked Products)

> 아래 항목은 **데모 예시**입니다 — 지원되는 각 제공자별로 하나씩 예시 제품을 보여줍니다. 이 리포지토리를 포크한 후 자신의 제품으로 교체하여 추적을 시작하세요.

| 제품 키 (Product key) | 리포지토리 (Repository) |
|---|---|
| `Pain-Labs.edo-tensei` | <https://github.com/Pain-Labs/Edo-Tensei> |
| `ublock-origin-firefox` | <https://github.com/gorhill/uBlock> |
| `ideavim-jetbrains` | <https://github.com/JetBrains/ideavim> |
| `typescript-npm` | <https://github.com/microsoft/TypeScript> |
| `ubuntu-docker` | <https://hub.docker.com/_/ubuntu> |
| `ripgrep-github` | <https://github.com/BurntSushi/ripgrep> |

## 명령어 (Commands)

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
npm 기 query -- export snapshots.csv
```

`npm run collect`는 구성 파일에서 지원되는 모든 제공자 URL을 수집합니다. 제공자 전용 워크플로우는 플랫폼 인수를 사용하여 각 데이터 소스가 독립적으로 실패하거나 재시도되거나 확장될 수 있도록 합니다.

## 출력 파일 (Outputs)

생성된 모든 파일은 `output/` 디렉토리 아래에 저장됩니다:

```text
output/
  data/
    winterdrive.virtual-tabs-marketplace.jsonl
    winterdrive.virtual-tabs-openvsx.jsonl
  charts/
    winterdrive.virtual-tabs-marketplace.svg
    winterdrive.virtual-tabs-openvsx.svg
```

통합된 `snapshots.jsonl`은 생성되지 않습니다. 1000개의 제품을 추적하더라도 각 제품/플랫폼 시리즈는 독립적으로 유지되며 개별적으로 검사, 재생성 또는 복구할 수 있습니다.

### 차트 삽입 방법 (GitHub Pages)

Git 리포지토리가 비대해지는 것을 방지하기 위해 생성된 SVG 차트는 `main` 브랜치에 **커밋되지 않습니다**. 대신 GitHub Actions가 생성된 차트를 전용 `gh-pages` 브랜치에 자동으로 배포합니다.

차트를 표시하려면:

1. 리포지토리가 **Public (공개)** 로 설정되어 있는지 확인합니다.
2. **Settings > Pages** 로 이동합니다.
3. **Build and deployment** 아래에서 Source를 **Deploy from a branch** 로 선택합니다.
4. Branch로 **`gh-pages`** 와 `/ (root)` 를 선택한 다음 **Save** 를 클릭합니다.

   ![GitHub Pages 브랜치 설정](assets/01_github_page.png)

활성화되면 다음 표준 이미지 마크다운 구문을 사용하여 매일 자동 업데이트되는 차트를 어디에나 삽입할 수 있습니다:

```markdown
![Marketplace Trend](https://<여러분의-계정>.github.io/<리포지토리-이름>/<제품키>-marketplace.svg)
```

## 스케일링 및 아키텍처 (Scaling & Architecture)

대규모 구성(예: 1000일 동안 1000개의 익스텐션 추적)을 지원하기 위해 이 리포지토리는 다음과 같은 강력한 스케일링 메커니즘을 구현합니다:

1. **API 속도 제한 (Rate Limiting)**: `429 Too Many Requests` 차단을 방지하기 위해 지수 백오프(Exponential backoff) 및 지터(Jitter)와 함께 엄격한 호스트당 토큰 버킷 속도 제한(기본 2 RPS)을 적용합니다.
2. **매트릭스 샤딩 (Matrix Sharding)**: GitHub Actions 워크플로우는 데이터 수집을 여러 병렬 매트릭스 작업(예: 5개의 샤드)으로 분산하여 실행을 가속화합니다.
3. **아티팩트 집계 (Artifact Aggregation)**: 병렬 매트릭스 작업은 격리된 `output/` 디렉토리를 아티팩트로 업로드합니다. 그런 다음 전용 `commit` 작업이 모든 아티팩트를 다운로드하여 단일 커밋으로 푸시함으로써 Git 푸시 경쟁 조건(Race condition)을 완전히 제거합니다.
4. **전용 데이터 브랜치 (Data Orphan Branch)**: Git 리포지토리가 시간이 지남에 따라 비대해지는 것을 방지하기 위해 과거 JSONL 데이터는 `main` 브랜치가 아닌 완전히 독립된 `data` 브랜치에 커밋됩니다.
5. **히스토리 GC (History GC)**: 월간 유지 관리 워크플로우(`gc-data-branch.yml`)가 180일이 지난 `data` 브랜치 커밋을 자동으로 압축(Squash)하여 리포지토리를 매우 가볍게 유지합니다.

로컬에서 샤딩을 실행할 수도 있습니다:

```bash
npm run collect -- marketplace --shard 0/10
npm run collect -- marketplace --shard 1/10
```

수집기는 `--concurrency`를 사용하여 API 동시성을 제한하며(기본값 `5`), 따라서 대규모 구성이라도 모든 요청을 한 번에 실행하지 않습니다.

## 워크플로우 (Workflows)

제공자 워크플로우는 데이터 소스별로 이름이 지정됩니다. 이들은 동일한 동시성 그룹(concurrency group)을 공유하므로 수동 또는 예약된 실행 시 차트/데이터가 동시에 기록되는 것을 방지하기 위해 큐(Queue) 형태로 대기합니다:

- `collect-vscode-marketplace.yml`: VS Code Marketplace, UTC 01:00 / KST 10:00
- `collect-open-vsx-registry.yml`: Open VSX Registry, UTC 01:10 / KST 10:10
