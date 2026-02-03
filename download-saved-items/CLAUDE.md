# CLAUDE.md - Later Export Tool

Slack「Later」（保存済みアイテム）エクスポートツールの技術コンテキスト。

## プロジェクト概要

- **種別:** Slack保存済みアイテムエクスポートツール
- **言語:** TypeScript
- **ランタイム:** Node.js
- **フレームワーク:** Slack Bolt (@slack/bolt v4.6.0)
- **ビルドツール:** TypeScript Compiler (tsc)

## ディレクトリ構造

```
download-saved-items/
├── src/
│   ├── index.ts              # メインSlack Boltアプリエントリポイント
│   ├── later/
│   │   └── exporter.ts       # LaterExporterクラス
│   └── scripts/
│       └── exportLater.ts    # CLIスクリプト
├── dist/                     # コンパイル済みJavaScript
├── exports/                  # CSV出力先
├── docs/
│   ├── later-export-plan.md  # 実装計画
│   └── directory-structure-plan.md
├── .env.example
├── package.json
└── tsconfig.json
```

## コアコンポーネント

### 1. メインSlackアプリ (src/index.ts)

**用途:** Slack Boltアプリケーションの初期化と実行

**環境変数:**
- `SLACK_BOT_TOKEN` (必須) - Bot OAuth Token (xoxb-...)
- `SLACK_SIGNING_SECRET` (HTTPモードで必須) - App signing secret
- `SLACK_APP_TOKEN` (Socket Modeで必須) - App-level token (xapp-...)
- `SLACK_SOCKET_MODE` (デフォルト: "false") - Socket Modeの有効/無効
- `PORT` (デフォルト: 3000) - HTTPモードのサーバーポート

**機能:**
- `app_mention`イベントに挨拶で応答
- HTTPとSocket Mode両対応
- 環境変数未設定時の基本的なエラーハンドリング

### 2. LaterExporter (src/later/exporter.ts)

**用途:** Slack「Later」（保存済みアイテム）をCSV形式でエクスポート

**クラス:** `LaterExporter`

**コンストラクタ:**
- 適切なスコープを持つUser OAuth Token (xoxp-...) が必要
- User TokenでWebClientを初期化
- ユーザー名とチャンネル名のキャッシュを作成

**メインメソッド:** `run(outputDir?: string)`
- ページネーションで全保存済みアイテムを収集
- データをフラットなExportRowオブジェクトに正規化
- `exports/later-export-{timestamp}.csv`にCSVを出力
- 戻り値: `{ filePath: string, rowCount: number }`

**必要なSlackスコープ (User Token):**
- `stars:read` - 保存済みアイテムの読み取り
- `channels:read`, `groups:read`, `im:read`, `mpim:read` - チャンネルメタデータ
- `channels:history`, `groups:history`, `im:history`, `mpim:history` - メッセージ履歴
- `users:read` - ユーザー情報

**エクスポートCSVカラム:**
1. `savedAt` - アイテム保存時のISOタイムスタンプ
2. `messageTs` - Slackメッセージタイムスタンプ
3. `channelId` - チャンネル/会話ID
4. `channelName` - 人間が読めるチャンネル名
5. `userId` - ユーザーID（ボットの場合は "bot:{bot_id}"）
6. `userDisplayName` - 表示名または本名
7. `text` - サニタイズ済みメッセージテキスト（改行削除）
8. `permalink` - 元メッセージへのリンク

**実装詳細:**
- `stars.list` APIでcursor-basedページネーション使用
- API呼び出し削減のためユーザー・チャンネル名をキャッシュ
- メッセージ詳細が不完全な場合は`conversations.history`にフォールバック
- 改行をスペースに置換してテキストをサニタイズ
- CSVエスケープ: クォートは二重化、`,` `"` 改行を含む場合はラップ
- ファイル名のタイムスタンプ形式: `yyyyMMdd-HHmmss`
- typeが"message"でchannelがあるアイテムのみをフィルタ

### 3. エクスポートスクリプト (src/scripts/exportLater.ts)

**用途:** 保存済みアイテムエクスポートのCLIエントリポイント

**環境変数:**
- `SLACK_USER_TOKEN` (必須) - User OAuth Token

**使用方法:**
```bash
npm run export:later         # 開発モード (ts-node)
npm run export:later:build   # プロダクション (コンパイル済み)
```

## 開発ワークフロー

### セットアップ
1. `.env.example`を`.env`にコピー
2. Slackトークンと認証情報を入力
3. 依存関係インストール: `npm install`

### スクリプト
- `npm run dev` - 開発モードでメインアプリ実行 (ts-node)
- `npm run build` - TypeScriptをJavaScriptにコンパイル
- `npm start` - コンパイル済みメインアプリ実行
- `npm run export:later` - 保存済みアイテムエクスポート (開発)
- `npm run export:later:build` - 保存済みアイテムエクスポート (プロダクション)

### TypeScript設定
- Target: ES2020
- Module: CommonJS
- Strictモード有効
- Root: `src/` → Output: `dist/`

## APIパターン

### ページネーションパターン
```typescript
let cursor: string | undefined;
do {
  const response = await client.stars.list({ cursor, limit: 200 });
  items.push(...response.items);
  cursor = response.response_metadata?.next_cursor || undefined;
} while (cursor);
```

### キャッシュパターン
```typescript
private readonly cache = new Map<string, string>();

async getCachedValue(key: string): Promise<string> {
  const cached = this.cache.get(key);
  if (cached) return cached;

  const value = await fetchValue(key);
  this.cache.set(key, value);
  return value;
}
```

### エラーハンドリングパターン
```typescript
const response = await client.api.method(params) as ResponseType & WebAPICallResult;
if (!response.ok) {
  throw new Error(`Failed: ${response.error ?? "unknown_error"}`);
}
```

## 主要な依存関係

**プロダクション:**
- `@slack/bolt` ^4.6.0 - Slackアプリフレームワーク
- `dotenv` ^17.2.3 - 環境変数読み込み

**開発:**
- `typescript` ^5.9.3
- `ts-node` ^10.9.2 - TypeScript直接実行
- `@types/node` ^25.0.2

## よくあるタスク

### エクスポートカラムの拡張
1. `ExportColumn`型にカラム追加 (src/later/exporter.ts:20)
2. `ExportRow`インターフェースにフィールド追加 (src/later/exporter.ts:30)
3. `CSV_COLUMNS`配列に追加 (src/later/exporter.ts:41)
4. `collectRows()`で新フィールドを設定 (src/later/exporter.ts:73)

### APIスコープの追加
1. docs/later-export-plan.mdのスコープリストを更新
2. Slackアプリ設定でワークスペースに再インストール
3. `.env`の`SLACK_USER_TOKEN`を新トークンで更新

### デバッグ
- `.env`ファイルのトークン値を確認
- Slackアプリに必要なスコープがインストールされているか確認
- ビルド後に`dist/`ディレクトリが存在するか確認
- `exports/`ディレクトリで生成されたCSVファイルを確認

## セキュリティ

- 全トークンは`.env`に格納（gitignore対象）
- `.env`ファイルは絶対にコミットしない
- 個人データアクセスにはUser Token (xoxp-) が必要
- アプリ機能にはBot Token (xoxb-)
- CSVには機密メッセージ内容が含まれる可能性あり - 適切に取り扱うこと

## 型安全性

プロジェクトは厳密なTypeScriptを使用:
- パブリックメソッドには明示的な戻り値型
- Slack APIレスポンスの適切な型付け
- WebAPICallResult交差型の型アサーション
- プロダクションコードで`any`型は使用しない
