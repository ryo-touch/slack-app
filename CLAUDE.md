# CLAUDE.md - Slackツールリポジトリ

Slackユーティリティツールのコレクション。各ツールは独立したSlack Appとして実装。

## リポジトリ概要

- **種別:** Slackユーティリティツール集
- **言語:** TypeScript
- **ランタイム:** Node.js

## 設計方針

1. **独立したSlack App** - 各ツールは最小限のスコープを持つ別々のSlack App
2. **最小スコープ** - 各ツールに必要な権限のみをリクエスト
3. **独立した動作** - 各サブプロジェクトは独立して開発・テスト・デプロイ可能
4. **User Token中心** - 個人データアクセスにはUser OAuth Token (xoxp-) を使用

## サブプロジェクト一覧

| ディレクトリ | 用途 | 状態 |
|-------------|------|------|
| `download-saved-items/` | Later（保存済みアイテム）をCSVエクスポート | Active |
| `history-export/` | チャンネル履歴をMarkdown/CSVエクスポート | Active |

## 共通パターン

### ページネーション
全ツールでcursor-basedページネーションを使用:
```typescript
let cursor: string | undefined;
do {
  const response = await client.api.method({ cursor, limit: 200 });
  items.push(...response.items);
  cursor = response.response_metadata?.next_cursor || undefined;
} while (cursor);
```

### 名前キャッシュ
API呼び出し削減のためユーザー名・チャンネル名をキャッシュ:
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

### エラーハンドリング
```typescript
const response = await client.api.method(params) as ResponseType & WebAPICallResult;
if (!response.ok) {
  throw new Error(`Failed: ${response.error ?? "unknown_error"}`);
}
```

## コード共通化ガイドライン

**現在の方針: 独立実装**

各サブプロジェクトは独自の実装を維持。これにより:
- 関心の明確な分離
- 独立した開発サイクル
- プロジェクト間の依存関係なし

**将来の共通ライブラリ候補:**
| コンポーネント | 説明 |
|---------------|------|
| Pagination | cursor-basedページネーションヘルパー |
| Cache | Map-based名前解決 |
| CSV Formatter | `escapeCsv`, `toCsv` ユーティリティ |
| Timestamp | Slack ts → Date 変換 |

**`shared/` ディレクトリ作成のトリガー:**
- 3つ以上のサブプロジェクトで同じコードが必要
- バグ修正を複数箇所で行う必要がある

## セキュリティ

- **`.env`ファイルはコミット禁止** - 全トークンは`.env`に格納（gitignore対象）
- **User Token (xoxp-)** - 個人データアクセス用（保存済みアイテム、履歴）
- **Bot Token (xoxb-)** - アプリ機能用（必要に応じて）
- **エクスポートファイルには機密データが含まれる可能性あり** - 適切に取り扱うこと

## 開発ワークフロー

1. 対象のサブプロジェクトディレクトリに移動
2. `.env.example`を`.env`にコピーしてトークンを設定
3. 依存関係インストール: `npm install`
4. 開発モードで実行: `npm run dev`

各サブプロジェクトの`CLAUDE.md`で詳細を確認。
