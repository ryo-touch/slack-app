# Claude.md - Technical Context for AI Assistants

This document provides comprehensive technical context about the slack-app repository for AI assistants working with this codebase.

## Project Overview

**Type:** Slack Bot Application with Saved Items Export Functionality
**Language:** TypeScript
**Runtime:** Node.js
**Framework:** Slack Bolt (@slack/bolt v4.6.0)
**Build Tool:** TypeScript Compiler (tsc)

## Repository Structure

```
slack-app/
├── src/
│   ├── index.ts              # Main Slack Bolt app entry point
│   ├── later/
│   │   └── exporter.ts       # LaterExporter class for exporting saved items
│   └── scripts/
│       └── exportLater.ts    # CLI script to run the exporter
├── dist/                     # Compiled JavaScript output
├── exports/                  # CSV export output directory
├── docs/
│   └── later-export-plan.md  # Detailed implementation plan
├── .env.example              # Environment variable template
├── package.json              # Dependencies and npm scripts
└── tsconfig.json             # TypeScript configuration
```

## Core Components

### 1. Main Slack App (src/index.ts)

**Purpose:** Initializes and runs the Slack Bolt application

**Environment Variables:**
- `SLACK_BOT_TOKEN` (required) - Bot OAuth token (xoxb-...)
- `SLACK_SIGNING_SECRET` (required for HTTP mode) - App signing secret
- `SLACK_APP_TOKEN` (required for Socket Mode) - App-level token (xapp-...)
- `SLACK_SOCKET_MODE` (default: "false") - Enable/disable Socket Mode
- `PORT` (default: 3000) - Server port for HTTP mode

**Features:**
- Responds to `app_mention` events with a greeting
- Supports both HTTP and Socket Mode
- Basic error handling for missing environment variables

**Code Pattern:**
```typescript
app.event("app_mention", async ({ event, say }) => {
  await say(`Hi, <@${event.user}>!`);
});
```

### 2. Later Exporter (src/later/exporter.ts)

**Purpose:** Exports Slack "Later" (saved items) to CSV format

**Class:** `LaterExporter`

**Constructor:**
- Requires a user OAuth token (xoxp-...) with appropriate scopes
- Initializes WebClient with user token
- Creates caches for user names and channel names

**Main Method:** `run(outputDir?: string)`
- Collects all saved items via pagination
- Normalizes data into flat ExportRow objects
- Writes CSV to `exports/later-export-{timestamp}.csv`
- Returns: `{ filePath: string, rowCount: number }`

**Required Slack Scopes (User Token):**
- `stars:read` - Read saved items
- `channels:read`, `groups:read`, `im:read`, `mpim:read` - Channel metadata
- `channels:history`, `groups:history`, `im:history`, `mpim:history` - Message history
- `users:read` - User information

**Export CSV Columns:**
1. `savedAt` - ISO timestamp when item was saved
2. `messageTs` - Slack message timestamp
3. `channelId` - Channel/conversation ID
4. `channelName` - Human-readable channel name
5. `userId` - User ID (or "bot:{bot_id}" for bots)
6. `userDisplayName` - Display name or real name
7. `text` - Sanitized message text (newlines removed)
8. `permalink` - Clickable link to original message

**Implementation Details:**
- Uses cursor-based pagination for `stars.list` API
- Caches user and channel lookups to minimize API calls
- Falls back to `conversations.history` if message details incomplete
- Sanitizes text by replacing newlines with spaces
- CSV escaping: quotes doubled, values wrapped if containing `,` `"` or newlines
- Timestamp format: `yyyyMMdd-HHmmss` for filename
- Filters to only include items of type "message" with a channel

### 3. Export Script (src/scripts/exportLater.ts)

**Purpose:** CLI entry point for exporting saved items

**Environment Variables:**
- `SLACK_USER_TOKEN` (required) - User OAuth token

**Usage:**
```bash
npm run export:later         # Development (ts-node)
npm run export:later:build   # Production (compiled)
```

**Output:**
- Success: Logs filepath and row count
- Failure: Logs error and exits with code 1

## Development Workflow

### Setup
1. Copy `.env.example` to `.env`
2. Fill in Slack tokens and credentials
3. Install dependencies: `npm install`

### Scripts
- `npm run dev` - Run main app in development mode (ts-node)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled main app
- `npm run export:later` - Export saved items (development)
- `npm run export:later:build` - Export saved items (production)

### TypeScript Configuration
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Root: `src/` → Output: `dist/`

## API Integration Patterns

### Pagination Pattern
```typescript
let cursor: string | undefined;
do {
  const response = await client.stars.list({ cursor, limit: 200 });
  items.push(...response.items);
  cursor = response.response_metadata?.next_cursor || undefined;
} while (cursor);
```

### Caching Pattern
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

### Error Handling Pattern
```typescript
const response = await client.api.method(params) as ResponseType & WebAPICallResult;
if (!response.ok) {
  throw new Error(`Failed: ${response.error ?? "unknown_error"}`);
}
```

## Git History

Recent commits:
- `d69f7dc` - "feature:later に保存されているメッセージを取得する" (Get saved messages from Later)
- `e9c0caa` - "initial commit"

## Key Dependencies

**Production:**
- `@slack/bolt` ^4.6.0 - Slack app framework
- `dotenv` ^17.2.3 - Environment variable loading

**Development:**
- `typescript` ^5.9.3
- `ts-node` ^10.9.2 - Run TypeScript directly
- `@types/node` ^25.0.2

## Common Tasks for AI Assistants

### Adding New Event Handlers
Add to `src/index.ts`:
```typescript
app.event("event_name", async ({ event, ... }) => {
  // handler logic
});
```

### Extending Export Columns
1. Add column to `ExportColumn` type (src/later/exporter.ts:20)
2. Add field to `ExportRow` interface (src/later/exporter.ts:30)
3. Add to `CSV_COLUMNS` array (src/later/exporter.ts:41)
4. Update `collectRows()` to populate new field (src/later/exporter.ts:73)

### Adding New API Scopes
1. Update scope list in docs/later-export-plan.md
2. Reinstall app to workspace in Slack App settings
3. Update `SLACK_USER_TOKEN` in `.env` with new token

### Debugging
- Check `.env` file for correct token values
- Verify Slack app has required scopes installed
- Check `dist/` directory exists after build
- Review exports/ directory for generated CSV files

## Security Notes

- All tokens are in `.env` (gitignored)
- Never commit `.env` file
- User tokens (xoxp-) required for personal data access
- Bot tokens (xoxb-) for app functionality
- CSV may contain sensitive message content - handle appropriately

## Type Safety

The project uses strict TypeScript with:
- Explicit return types on public methods
- Proper typing for Slack API responses
- Type assertions for WebAPICallResult intersection types
- No `any` types in production code

## Testing Status

Currently no automated tests configured (`npm test` returns error). When implementing tests:
- Consider Jest or Mocha for unit tests
- Mock Slack API calls using @slack/web-api test utilities
- Test CSV generation with sample data
- Validate environment variable validation logic
