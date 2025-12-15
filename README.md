# Slack App with Later Export

A Slack bot application built with Bolt for Node.js that responds to mentions and exports your Slack "Later" (saved items) to CSV format.

## Features

- **Slack Bot:** Responds to app mentions with a friendly greeting
- **Later Export:** Export all your Slack saved items (Later) to CSV for archival or analysis (note: status information not available via API)
- **Flexible Deployment:** Supports both HTTP and Socket Mode
- **Type-Safe:** Built with TypeScript for reliability and maintainability

## Prerequisites

- Node.js 14.x or higher
- npm or yarn
- A Slack workspace where you can install apps
- Slack app credentials (see Setup section)

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd slack-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and fill in your Slack credentials (see Configuration section)

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example` with the following variables:

```env
# Required for the main Slack bot
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# Required for Socket Mode (alternative to HTTP mode)
SLACK_APP_TOKEN=xapp-your-app-level-token
SLACK_SOCKET_MODE=false

# Required for Later export feature
SLACK_USER_TOKEN=xoxp-your-user-token

# Server configuration
PORT=3000
```

### Setting Up Your Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app

2. **For the Bot:**
   - Navigate to **OAuth & Permissions**
   - Add Bot Token Scopes:
     - `app_mentions:read` - Listen for mentions
     - `chat:write` - Send messages
   - Install the app to your workspace
   - Copy the **Bot User OAuth Token** to `SLACK_BOT_TOKEN`
   - Copy the **Signing Secret** from Basic Information to `SLACK_SIGNING_SECRET`

3. **For Later Export:**
   - Navigate to **OAuth & Permissions**
   - Add User Token Scopes:
     - `stars:read` - Read saved items
     - `channels:read`, `groups:read`, `im:read`, `mpim:read` - Channel information
     - `channels:history`, `groups:history`, `im:history`, `mpim:history` - Message history
     - `users:read` - User information
   - Reinstall the app to get a user token
   - Copy the **User OAuth Token** to `SLACK_USER_TOKEN`

4. **Socket Mode (Optional):**
   - Enable Socket Mode in your app settings
   - Generate an App-Level Token with `connections:write` scope
   - Copy the token to `SLACK_APP_TOKEN`
   - Set `SLACK_SOCKET_MODE=true` in `.env`

## Usage

### Running the Slack Bot

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

The bot will:
- Listen for app mentions in your workspace
- Respond with a greeting when mentioned: `@YourBot hello`

### Exporting Saved Items (Later)

**Development mode:**
```bash
npm run export:later
```

**Production mode:**
```bash
npm run build
npm run export:later:build
```

This will:
1. Connect to Slack using your user token
2. Retrieve all items you've saved to "Later"
3. Export them to a CSV file in the `exports/` directory
4. Print the file path and number of exported items

**Example output:**
```
Exported 42 saved items to C:\Users\...\slack-app\exports\later-export-20231215-143022.csv
```

### CSV Export Format

The exported CSV contains the following columns:

| Column | Description |
|--------|-------------|
| savedAt | When the item was saved (ISO 8601 format) |
| messageTs | Slack message timestamp |
| channelId | Channel/conversation ID |
| channelName | Human-readable channel name |
| userId | User ID (or bot identifier) |
| userDisplayName | Display name or real name |
| text | Message text (sanitized) |
| permalink | Direct link to the message in Slack |

**Note:** Later status information (In Progress/Archived/Completed) is not available through the Slack API and therefore cannot be included in the export.

## Limitations

### Later Status Not Available

Slack's "Later" feature in the UI supports three status types:
- In Progress
- Archived
- Completed

**However, these status values are not available through the Slack API.** The current implementation uses the `stars.list` API method, which:

- Does not include status information for saved items
- Is deprecated as of March 2023
- May not reflect items saved through the newer "Later" feature

### Impact

Exported CSV files will contain all saved messages but **without their Later status** (in progress/archived/completed). All items are exported with the same treatment regardless of their status in the Slack UI.

### Future Considerations

Slack has not yet released a direct API for the "Later" feature. This tool will be updated if/when Slack provides an official Later API with status information.

## Project Structure

```
slack-app/
├── src/
│   ├── index.ts              # Main bot application
│   ├── later/
│   │   └── exporter.ts       # Later export logic
│   └── scripts/
│       └── exportLater.ts    # Export CLI script
├── dist/                     # Compiled JavaScript
├── exports/                  # CSV export output
├── docs/                     # Documentation
├── .env.example              # Environment template
├── package.json              # Dependencies
└── tsconfig.json             # TypeScript config
```

## Development

### Available Scripts

- `npm run dev` - Run the bot in development mode (with ts-node)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled bot
- `npm run export:later` - Export saved items (development)
- `npm run export:later:build` - Export saved items (production)
- `npm test` - Run tests (not yet implemented)

### Building

```bash
npm run build
```

This compiles TypeScript files from `src/` to JavaScript in `dist/`.

## Troubleshooting

### "Missing SLACK_BOT_TOKEN in environment"
- Ensure `.env` file exists and contains `SLACK_BOT_TOKEN`
- Verify the token starts with `xoxb-`

### "SLACK_USER_TOKEN is not defined"
- Add your user OAuth token to `.env`
- Ensure the token starts with `xoxp-`
- Verify you've added all required user scopes to your app

### "Failed to read saved items"
- Check that your user token has the `stars:read` scope
- Reinstall the app to your workspace after adding scopes
- Generate a new user token with the updated scopes

### Socket Mode Connection Issues
- Verify `SLACK_APP_TOKEN` is set correctly
- Ensure Socket Mode is enabled in your app settings
- Check that the app-level token has `connections:write` scope

### Export produces empty CSV
- Ensure you have items saved to "Later" in Slack
- Check the console output for any error messages
- Verify all required scopes are granted

### Some items in my Later list are missing from the export

- The `stars.list` API used by this tool is deprecated and may not include items saved through Slack's newer "Later" feature
- Items saved before March 2023 using the old "Saved Items" feature should export correctly
- There is currently no official Slack API for the Later feature

## Security

- Never commit your `.env` file (already in `.gitignore`)
- Rotate tokens if they are accidentally exposed
- The CSV export may contain sensitive information - handle appropriately
- User tokens have broad access - store them securely

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Build and test: `npm run build`
5. Commit your changes: `git commit -m 'Add my feature'`
6. Push to the branch: `git push origin feature/my-feature`
7. Open a pull request

## License

ISC

## Additional Resources

- [Slack Bolt Documentation](https://slack.dev/bolt-js/)
- [Slack API Reference](https://api.slack.com/methods)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## Support

For detailed implementation notes, see [docs/later-export-plan.md](docs/later-export-plan.md).

For technical details for AI assistants, see [claude.md](claude.md).
