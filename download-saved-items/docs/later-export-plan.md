# Slack "Later" Export Plan

## Objectives
- Retrieve every message saved to "Later" (aka Saved Items) for the authenticated user.
- Normalize each item (message text, author, channel, timestamps, permalink, attachments) and serialize it to CSV for ad-hoc analysis or archival.
- Keep the implementation inside this TypeScript project so it can share the existing Bolt configuration, env handling, and build tooling.

## Key Assumptions
1. We will use a **user token** (not a bot token) because Later/Saved Items are user-specific.
2. The saved items API (`stars.list`) still backs the Later feature, so exporting Later == exporting the user's starred items.
3. We can re-use the existing `.env` pattern (e.g., define `SLACK_USER_TOKEN`) and never commit secrets.
4. The export can run on demand via an npm script (e.g., `npm run export:later`) and output `exports/later-yyyyMMdd.csv`.

## User Token Setup (Step-by-step)
1. Visit [api.slack.com/apps](https://api.slack.com/apps), select this app, and open **OAuth & Permissions**.
2. Scroll to **User Token Scopes**, then add the following scopes: `Saved items:read`, `channels:read`, `groups:read`, `im:read`, `mpim:read`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, and `users:read`. Add `chat:write` only if you plan to DM results.
3. Click **Save Changes** (if prompted) and press **Install to Workspace** → **Allow** to issue a fresh user (xoxp) token that includes those scopes.
4. Copy the new **User OAuth Token** (it starts with `xoxp-...`) and paste it into your `.env` file as `SLACK_USER_TOKEN=...`.
5. Restart any running dev processes so the new environment variable is loaded before running the exporter.

## Required Slack Scopes
| Scope | Reason |
| --- | --- |
| Saved items:read (user scope `stars:read`; UI label "Saved items") | Enumerate everything the user added to Later/Saved Items (`stars.list`). |
| `channels:read`, `groups:read`, `im:read`, `mpim:read` | Resolve channel metadata (name/type) for each saved item and allow permalink generation. |
| `channels:history`, `groups:history`, `im:history`, `mpim:history` | Fetch message bodies via `conversations.history` when `stars.list` returns a reference only. |
| `users:read` | Display the message author's real name/display name in the CSV. |
| `chat:write` (optional) | Only needed if we plan to DM the CSV or send confirmation messages from the script. |

> The "Saved items:read" scope only appears under **OAuth & Permissions → User Token Scopes**; enable user scopes (xoxp token) to expose it and search for "Saved items" in the scope picker. Slack also lists a `bookmarks:read` scope, but that only returns channel bookmark metadata and does **not** cover Later/Saved Items.
> Use a **user token** (granular scopes) that includes the union of the scopes above. Store it as `SLACK_USER_TOKEN` in `.env`.

## High-Level Work Plan
1. **Token & env wiring**
   - Generate a user token with the scopes above.
   - Extend `.env.example` with `SLACK_USER_TOKEN` and update Bolt initialization to load it separately from the bot token.
2. **Data retrieval module** (`src/later/exporter.ts`)
   - Wrap `stars.list` with cursor-based pagination until every saved item is collected.
   - Extract `channel`, `message`, and `created` metadata from each entry. For items missing full text, call `conversations.history` (or `conversations.replies` for thread replies) to pull the message body.
   - Use `chat.getPermalink` for each channel/timestamp pair so the CSV contains a clickable link back to the original message.
3. **Normalization layer**
   - Map each saved item to a flat object: `{savedAt, messageTs, channelId, channelName, userId, userDisplayName, text, permalink}`.
   - Fetch and cache `users.info` responses to avoid redundant lookups for the same user IDs.
4. **CSV writer**
   - Create `exports/` if it does not exist.
   - Use either a lightweight dependency (e.g., `papaparse` or `json2csv`) or a custom serializer to output UTF-8 CSV with headers.
   - Name files `later-export-<ISO date>.csv` for traceability and ensure errors surface non-zero exit codes.
5. **CLI entry point** (`src/scripts/exportLater.ts`)
   - Bootstrap `dotenv`, instantiate the exporter module, run it, and log the file path when complete.
   - Add `"export:later": "ts-node src/scripts/exportLater.ts"` (and a compiled counterpart) to `package.json`.
6. **Validation**
   - Dry-run against a workspace with a few Later items and manually verify row counts vs Slack UI.
   - Spot-check timestamps, channel names, and permalinks; confirm the CSV opens cleanly in Excel/Sheets.

## Open Questions / Next Steps
- Confirm whether Slack plans to deprecate `stars.list`; if so, monitor for a dedicated Later API and update accordingly.
- Decide if attachments/files need to be downloaded or just referenced via permalink.
- Consider encrypting/scrubbing sensitive message content before distributing the CSV externally.
