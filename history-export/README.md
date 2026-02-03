# Slack History Export

Slackチャンネルの履歴をエクスポートするCLIツール。

## 機能

- チャンネル履歴をYAML/Markdown/CSV形式でエクスポート
- スレッド返信を展開して表示
- 日付範囲でフィルタリング
- ユーザー名・チャンネル名を自動解決

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Slack User Tokenの設定

`.env.example` を `.env` にコピーして、User Tokenを設定:

```bash
cp .env.example .env
```

```env
SLACK_USER_TOKEN=xoxp-your-token-here
```

**必要なスコープ:**
- `channels:history` - パブリックチャンネルの履歴
- `channels:read` - チャンネル情報
- `groups:history` - プライベートチャンネルの履歴
- `groups:read` - プライベートチャンネル情報
- `users:read` - ユーザー名解決

## 使い方

### 基本的な使い方

```bash
# チャンネルIDで指定（推奨）
npm run dev -- --channel C01234567

# 日付範囲を指定
npm run dev -- --channel C01234567 --from 2026-01-01 --to 2026-01-31

# 出力形式を指定（yaml/csv/md）
npm run dev -- --channel C01234567 --format csv
```

### チャンネルIDの確認方法

Slackでチャンネルを開き、チャンネル名をクリック → 一番下にチャンネルIDが表示されます（例: `C01234567`）。

### Rate Limit回避のためのセットアップ（推奨）

Slack APIにはrate limitがあるため、初回実行前にユーザーキャッシュを作成しておくことを推奨します:

```bash
# ユーザーキャッシュを作成（1回だけ実行すればOK）
npm run dev -- --prefetch-users
```

これにより `.cache/users.json` にユーザー情報がキャッシュされ、以降のエクスポートでrate limitを回避できます。

## オプション一覧

| オプション | 説明 |
|-----------|------|
| `--channel, -c <ID>` | エクスポート対象チャンネル（**ID推奨**） |
| `--from <YYYY-MM-DD>` | 開始日 |
| `--to <YYYY-MM-DD>` | 終了日 |
| `--format, -f <形式>` | 出力形式: `yaml`（デフォルト）, `csv`, `md` |
| `--output, -o <dir>` | 出力先ディレクトリ（デフォルト: `exports/`） |
| `--prefetch-users` | ユーザー一覧をキャッシュに保存 |
| `--list-channels` | チャンネル一覧を表示・キャッシュ（※チャンネル名で指定したい場合のみ） |
| `--refresh-cache` | キャッシュを強制更新 |
| `--help, -h` | ヘルプを表示 |

## 出力形式

### YAML（デフォルト）

```yaml
channel: general
exported_at: 2026-02-03T10:00:00.000Z
messages:
  - ts: "1234567890.123456"
    date: "2026-02-03"
    time: "10:00"
    user: username
    text: |
      メッセージ本文
    replies:
      - ts: "1234567890.234567"
        time: "10:05"
        user: replier
        text: |
          返信本文
```

### Markdown

```markdown
# #general

## 2026-02-03

### 10:00 @username
メッセージ本文

> **10:05 @replier**
> 返信本文
```

### CSV

```csv
timestamp,channel,user,text,thread_ts,reply_count
2026-02-03T10:00:00.000Z,general,username,メッセージ本文,,1
2026-02-03T10:05:00.000Z,general,replier,返信本文,1234567890.123456,0
```

## ライセンス

Private
