import path from "path";
import { config } from "dotenv";
import { HistoryExporter, ExportOptions } from "./exporter";

config();

interface CliArgs {
  channel?: string;
  from?: string;
  to?: string;
  format?: "csv" | "markdown" | "yaml";
  output?: string;
  listChannels?: boolean;
  prefetchUsers?: boolean;
  refreshCache?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--channel":
      case "-c":
        result.channel = nextArg;
        i++;
        break;
      case "--from":
        result.from = nextArg;
        i++;
        break;
      case "--to":
        result.to = nextArg;
        i++;
        break;
      case "--format":
      case "-f":
        if (nextArg === "csv" || nextArg === "md" || nextArg === "markdown" || nextArg === "yaml") {
          result.format = nextArg === "md" ? "markdown" : nextArg;
        } else {
          console.error(`Invalid format: ${nextArg}. Use 'yaml', 'csv', or 'md'.`);
          process.exit(1);
        }
        i++;
        break;
      case "--output":
      case "-o":
        result.output = nextArg;
        i++;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      case "--list-channels":
        result.listChannels = true;
        break;
      case "--prefetch-users":
        result.prefetchUsers = true;
        break;
      case "--refresh-cache":
        result.refreshCache = true;
        break;
    }
  }

  return result;
}

function parseDate(dateStr: string): Date | undefined {
  if (!dateStr) {
    return undefined;
  }

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    console.error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`);
    process.exit(1);
  }

  const [, year, month, day] = match;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

function printUsage(): void {
  console.log(`
Slack History Export

Usage:
  npm run dev -- --channel <name|id> [options]
  npm run dev -- --list-channels
  npm run dev -- --prefetch-users

Options:
  --channel, -c <name|id>  Channel to export (ID recommended to avoid rate limits)
                           Example: --channel C01234567
                           Use --list-channels to find channel IDs
  --from <YYYY-MM-DD>      Start date (optional)
  --to <YYYY-MM-DD>        End date (optional)
  --format, -f <yaml|csv|md>  Output format (default: yaml)
  --output, -o <dir>       Output directory (default: exports/)
  --list-channels          List all channels and save to cache
  --prefetch-users         Prefetch all users and save to cache
  --refresh-cache          Force refresh cache from API
  --help, -h               Show this help

Rate Limit Tips:
  1. First run: npm run dev -- --list-channels --prefetch-users
     This creates cache files to avoid rate limits on subsequent runs.
  2. Use channel ID (C...) instead of channel name for faster execution.
  3. Cache files are stored in .cache/ directory.

Examples:
  # Create all caches first (recommended)
  npm run dev -- --list-channels
  npm run dev -- --prefetch-users

  # Export using channel ID (recommended, avoids rate limits)
  npm run dev -- --channel C01234567

  # Export using channel name (uses cache if available)
  npm run dev -- --channel general

  # Date range filter
  npm run dev -- --channel C01234567 --from 2026-01-01 --to 2026-01-31

  # CSV format output
  npm run dev -- --channel C01234567 --format csv

  # Force refresh caches
  npm run dev -- --list-channels --refresh-cache
  npm run dev -- --prefetch-users --refresh-cache
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const token = process.env.SLACK_USER_TOKEN;

  if (!token) {
    console.error("Error: SLACK_USER_TOKEN environment variable is required.");
    console.error("Copy .env.example to .env and set your token.");
    process.exit(1);
  }

  const exporter = new HistoryExporter(token);

  // Handle --list-channels option
  if (args.listChannels) {
    try {
      const channels = await exporter.listChannels(args.refreshCache ?? false);
      console.log(`\nFound ${channels.length} channels:`);
      for (const ch of channels) {
        console.log(`  ${ch.name} (${ch.id})`);
      }
      console.log("");
    } catch (error) {
      console.error("Failed to list channels:", error);
      process.exit(1);
    }
    return;
  }

  // Handle --prefetch-users option
  if (args.prefetchUsers) {
    try {
      const userCount = await exporter.prefetchUsersToCache(
        args.refreshCache ?? false
      );
      console.log(`\nCached ${userCount} users.`);
    } catch (error) {
      console.error("Failed to prefetch users:", error);
      process.exit(1);
    }
    return;
  }

  if (!args.channel) {
    console.error("Error: --channel is required.");
    printUsage();
    process.exit(1);
  }

  const options: ExportOptions = {
    channelId: args.channel,
    startDate: args.from ? parseDate(args.from) : undefined,
    endDate: args.to ? parseDate(args.to) : undefined,
    format: args.format ?? "yaml",
    outputDir: args.output ?? path.resolve(process.cwd(), "exports"),
  };

  try {
    const result = await exporter.export(options);
    console.log(`\nExport complete!`);
    console.log(`  File: ${result.filePath}`);
    console.log(`  Messages: ${result.messageCount}`);
  } catch (error) {
    console.error("Export failed:", error);
    process.exit(1);
  }
}

main();
