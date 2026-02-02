# ディレクトリ構成提案：メッセージ検索機能の追加

## 概要

現在の `later`（保存済みメッセージ）エクスポート機能と同様のパターンで、「特定のチャンネルの特定のワードを含むメッセージを検索・エクスポート」する機能を追加する際の推奨ディレクトリ構成を提案します。

## 推奨ディレクトリ構成

### 現在の構成
```
slack-app/
├── src/
│   ├── index.ts              # Slack Bolt アプリ
│   ├── later/
│   │   └── exporter.ts       # Later エクスポート機能
│   └── scripts/
│       └── exportLater.ts    # Later CLI スクリプト
├── dist/                     # コンパイル出力
├── exports/                  # エクスポート出力
└── docs/
    └── later-export-plan.md  # 実装計画
```

### 提案する構成
```
slack-app/
├── src/
│   ├── index.ts              # Slack Bolt アプリ
│   ├── later/
│   │   ├── exporter.ts       # Later エクスポート機能
│   │   ├── README.md         # ← 新規追加：Later 機能の使い方
│   │   └── CLAUDE.md         # ← 新規追加：AI向け技術コンテキスト
│   ├── search/               # ← 新規追加
│   │   ├── searcher.ts       # メッセージ検索機能
│   │   ├── README.md         # ← 新規追加：検索機能の使い方
│   │   └── CLAUDE.md         # ← 新規追加：AI向け技術コンテキスト
│   └── scripts/
│       ├── exportLater.ts    # Later CLI スクリプト
│       └── searchMessages.ts # ← 新規追加：検索 CLI スクリプト
├── dist/                     # コンパイル出力
├── exports/                  # エクスポート出力
├── docs/
│   └── later-export-plan.md  # Later 実装計画（既存、将来的には不要になる可能性）
├── README.md                 # ← 更新：リポジトリ全体の概要 + 各機能への参照
└── CLAUDE.md                 # ← 更新：全体のコンテキスト + 各機能への参照
```

## ドキュメント構成の詳細

### ドキュメントの役割分担

#### リポジトリルート（全体）

**README.md**
- リポジトリ全体の概要説明
- セットアップ手順（環境変数、npm install など）
- 全機能の一覧と簡単な説明
- 各機能の詳細ドキュメントへのリンク
- 例:
  ```markdown
  # slack-app

  Slackボットアプリケーション（複数の機能を含む）

  ## 機能一覧
  - [Later Export](./src/later/) - 保存済みメッセージのエクスポート
  - [Message Search](./src/search/) - 特定チャンネルのメッセージ検索

  ## セットアップ
  ...
  ```

**CLAUDE.md**
- リポジトリ全体のアーキテクチャ
- 共通の技術スタック（TypeScript、Slack Bolt など）
- ディレクトリ構成の説明
- 各機能の CLAUDE.md へのリンク
- 共通パターン（ページネーション、キャッシング、CSV エクスポート）
- 例:
  ```markdown
  # Claude.md - Technical Context

  ## Project Overview
  Slack Bot Application with multiple features...

  ## Repository Structure
  ...

  ## Features
  - [Later Export](./src/later/CLAUDE.md) - Technical details
  - [Message Search](./src/search/CLAUDE.md) - Technical details

  ## Common Patterns
  - Pagination pattern
  - Caching mechanism
  - CSV serialization
  ```

#### 機能ごと（src/*/）

**src/later/README.md & src/search/README.md**
- 機能の概要と目的
- 使い方（CLI コマンド、環境変数）
- 出力形式（CSV カラムの説明）
- 必要な Slack スコープ
- トラブルシューティング
- 例（src/search/README.md）:
  ```markdown
  # Message Search - メッセージ検索機能

  特定のチャンネルから特定のキーワードを含むメッセージを検索し、CSV にエクスポートします。

  ## 使い方
  \`\`\`bash
  # 環境変数を設定
  SLACK_USER_TOKEN=xoxp-...
  SEARCH_CHANNEL_ID=C1234567890
  SEARCH_KEYWORD=bug

  # 実行
  npm run search:messages
  \`\`\`

  ## 出力形式
  CSV with columns: messageTs, channelId, channelName, userId, userDisplayName, text, permalink

  ## 必要なスコープ
  - channels:history
  - users:read
  ```

**src/later/CLAUDE.md & src/search/CLAUDE.md**
- クラス設計の詳細
- メソッド一覧と責務
- API 呼び出しパターン
- 型定義
- 実装上の注意点
- コードパス（ファイルパス:行番号）
- AI がコードを修正・拡張する際の参考情報
- 例（src/search/CLAUDE.md）:
  ```markdown
  # Message Search - Technical Context

  ## Class Design
  \`\`\`typescript
  export class MessageSearcher {
    constructor(userToken: string)
    async run(channelId: string, keyword: string): Promise<Result>
    ...
  }
  \`\`\`

  ## Method Responsibilities
  | Method | Responsibility | Location |
  |--------|---------------|----------|
  | run() | Main flow control | searcher.ts:45 |
  | collectMessages() | Aggregate & transform | searcher.ts:67 |
  ...

  ## API Patterns
  - Pagination: conversations.history with cursor
  - Filtering: keyword matching (case-insensitive)

  ## Common Tasks for AI
  - Extending search criteria: Modify filterByKeyword()
  - Adding export columns: Update ExportRow interface
  ```

### ドキュメントの管理方針

1. **リポジトリルート**: 全体の見取り図と導線
2. **機能別ディレクトリ**: 各機能の詳細な仕様と技術情報
3. **独立性**: 各機能のドキュメントは他に依存せず完結
4. **参照関係**: ルート → 機能への一方向リンク

## 新規ファイルの役割

### コードファイル

#### 1. `src/search/searcher.ts`

**責務:**
- 特定チャンネルの履歴取得（ページネーション）
- キーワードフィルタリング
- メッセージの正規化と CSV エクスポート
- ユーザー名・チャンネル名のキャッシング

**クラス設計例:**
```typescript
export class MessageSearcher {
  private readonly client: WebClient
  private readonly userNameCache = new Map<string, string>()
  private readonly channelNameCache = new Map<string, string>()

  constructor(userToken: string)

  async run(
    channelId: string,
    keyword: string,
    outputDir?: string
  ): Promise<{ filePath: string; rowCount: number }>

  private async collectMessages(channelId: string, keyword: string): Promise<ExportRow[]>
  private async listChannelHistory(channelId: string): Promise<SlackMessage[]>
  private filterByKeyword(messages: SlackMessage[], keyword: string): SlackMessage[]
  private async getUserDisplayName(userId: string): Promise<string>
  private async getChannelName(channelId: string): Promise<string>
  private getPermalink(channelId: string, messageTs: string): string
  private sanitizeText(text: string): string
  private formatTimestamp(ts: string): string
  private async writeCsv(rows: ExportRow[], outputDir: string): Promise<string>
  private toCsv(rows: ExportRow[]): string
  private escapeCsv(value: string): string
  private currentDateStamp(): string
}
```

**主要メソッド:**
- `listChannelHistory()`: `conversations.history` API を使用してページネーション
- `filterByKeyword()`: メッセージテキストからキーワードをマッチング
- その他のメソッドは `LaterExporter` のパターンを踏襲

**必要な API スコープ:**
```
channels:read, groups:read, im:read, mpim:read
channels:history, groups:history, im:history, mpim:history
users:read
```

**CSV カラム例:**
```
messageTs, channelId, channelName, userId, userDisplayName, text, permalink
```

### 2. `src/scripts/searchMessages.ts`

**責務:**
- CLI エントリポイント
- 環境変数の検証
- `MessageSearcher` のインスタンス化と実行
- 実行結果のログ出力

**実装例:**
```typescript
import dotenv from "dotenv"
import { MessageSearcher } from "../search/searcher"

dotenv.config()

const userToken = process.env.SLACK_USER_TOKEN
const channelId = process.env.SEARCH_CHANNEL_ID  // 例: C1234567890
const keyword = process.env.SEARCH_KEYWORD       // 例: "bug"

if (!userToken) {
  console.error("Error: SLACK_USER_TOKEN is required")
  process.exitCode = 1
  process.exit()
}

if (!channelId || !keyword) {
  console.error("Error: SEARCH_CHANNEL_ID and SEARCH_KEYWORD are required")
  process.exitCode = 1
  process.exit()
}

const searcher = new MessageSearcher(userToken)
searcher
  .run(channelId, keyword)
  .then(({ filePath, rowCount }) => {
    console.log(`Exported ${rowCount} messages to ${filePath}`)
  })
  .catch((error) => {
    console.error("Export failed:", error)
    process.exitCode = 1
  })
```

## npm scripts の追加

**package.json に以下を追加:**
```json
{
  "scripts": {
    "search:messages": "ts-node src/scripts/searchMessages.ts",
    "search:messages:build": "node dist/scripts/searchMessages.js"
  }
}
```

## 環境変数の追加

**.env.example に以下を追加:**
```bash
# メッセージ検索設定
SEARCH_CHANNEL_ID=C1234567890      # 検索対象チャンネル ID
SEARCH_KEYWORD=bug                  # 検索キーワード
```

## 設計の利点

### 1. 一貫性
- `later/` と `search/` が同じ階層で並列配置
- 各機能のエクスポーター（`exporter.ts`, `searcher.ts`）が同じ役割
- スクリプトが `scripts/` ディレクトリに集約

### 2. 拡張性
- 新しい機能を追加する際も同じパターンで対応可能
- 例: `src/analytics/analyzer.ts` + `src/scripts/runAnalytics.ts`

### 3. 独立性
- 各機能が独立したディレクトリで管理される
- 依存関係が明確（スクリプト → 機能ロジック）

### 4. 再利用性
- キャッシング機構（`userNameCache`, `channelNameCache`）を共通化可能
- CSV 出力ロジック（`toCsv()`, `escapeCsv()`）を共通化可能
- 将来的に `src/common/` や `src/utils/` に共通ロジックを抽出することも検討可能

## 実装時の注意点

### 1. API 制限
- `conversations.history` は Rate Limit があるため、大量メッセージ取得時はレート制限を考慮
- ページネーションは `cursor` ベースで実装

### 2. キーワードマッチング
- 大文字小文字の区別（case-sensitive / case-insensitive）を選択可能に
- 正規表現サポートも検討可能

### 3. エクスポート形式
- CSV だけでなく JSON エクスポートも将来的に検討可能
- その場合、`searcher.ts` 内に `toJson()` メソッドを追加

### 4. パフォーマンス
- チャンネル履歴が大きい場合、メモリ使用量に注意
- ストリーミング処理も検討可能（一度に全メッセージをメモリに保持しない）

## 将来の拡張案

### 共通ロジックの抽出
機能が増えてきたら、以下のような構成も検討可能：

```
src/
├── common/
│   ├── cache.ts          # キャッシュ管理
│   ├── csv.ts            # CSV ユーティリティ
│   └── slack.ts          # Slack API ヘルパー
├── later/
│   └── exporter.ts
├── search/
│   └── searcher.ts
└── scripts/
    ├── exportLater.ts
    └── searchMessages.ts
```

### インタラクティブモード
Slack Bolt アプリ（`index.ts`）に検索機能を統合する場合：

```typescript
// index.ts に追加
app.command("/search", async ({ command, ack, say }) => {
  await ack()
  const keyword = command.text
  const searcher = new MessageSearcher(userToken)
  const results = await searcher.run(command.channel_id, keyword)
  await say(`Found ${results.rowCount} messages`)
})
```

## 重要なファイルパス

### 変更が必要なファイル
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\package.json` - npm scripts 追加
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\.env.example` - 環境変数例追加
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\README.md` - 全体概要を更新、検索機能への参照追加
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\CLAUDE.md` - 全体コンテキスト更新、検索機能への参照追加

### 新規作成するファイル（Later 機能用）
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\src\later\README.md` - Later 機能の使い方
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\src\later\CLAUDE.md` - Later 機能の技術詳細

### 新規作成するファイル（検索機能用）
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\src\search\searcher.ts` - メッセージ検索ロジック
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\src\search\README.md` - 検索機能の使い方
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\src\search\CLAUDE.md` - 検索機能の技術詳細
- `C:\Users\ryo_sakai\Documents\github-repo\slack-app\src\scripts\searchMessages.ts` - CLI スクリプト

## まとめ

機能別ディレクトリ構成 + 機能別ドキュメントにより、以下を実現できます：

### コード構成の利点
✅ 現在の `later/` パターンとの一貫性
✅ 各機能の独立した管理（コードとドキュメントが同じ場所）
✅ 将来的な拡張の容易性（新機能追加も同じパターン）
✅ 共通ロジックの抽出可能性（将来的に `src/common/` へ）
✅ 明確な責務分離（ロジック vs スクリプト）

### ドキュメント構成の利点
✅ **機能の独立性**: 各機能のドキュメントがコードと同じディレクトリに配置され、完結
✅ **参照の明確性**: ルートから各機能へのリンクで全体像を把握
✅ **AI 向け最適化**: 各機能の CLAUDE.md により、AI が特定機能のコードを修正・拡張する際の精度向上
✅ **ユーザー向け利便性**: 各機能の README.md により、エンドユーザーが使い方をすぐに理解可能
✅ **保守性**: ドキュメントとコードが同じ場所にあるため、変更時の更新漏れを防止

### 全体としての利点
✅ **スケーラビリティ**: 機能数が増えても構成パターンは変わらない
✅ **学習コスト低減**: 新しい開発者（人間・AI）が一つの機能を理解すれば、他の機能も理解しやすい
✅ **モジュール性**: 各機能を別リポジトリに分離する場合も容易

この構成により、コードベースの保守性と拡張性が大幅に向上します。
