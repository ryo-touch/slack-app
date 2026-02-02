import path from "path";
import os from "os";
import { mkdir, writeFile } from "fs/promises";
import {
  WebClient,
  WebAPICallResult,
  LogLevel,
} from "@slack/web-api";
import type {
  StarsListResponse,
  ConversationsHistoryResponse,
  ConversationsInfoResponse,
  UsersInfoResponse,
  ChatGetPermalinkResponse,
} from "@slack/web-api";

type SavedItem = NonNullable<StarsListResponse["items"]>[number];
type SlackMessage = NonNullable<ConversationsHistoryResponse["messages"]>[number];

type ExportColumn =
  | "savedAt"
  | "messageTs"
  | "channelId"
  | "channelName"
  | "userId"
  | "userDisplayName"
  | "text"
  | "permalink";

export interface ExportRow {
  savedAt: string;
  messageTs: string;
  channelId: string;
  channelName: string;
  userId: string;
  userDisplayName: string;
  text: string;
  permalink: string;
}

const CSV_COLUMNS: ExportColumn[] = [
  "savedAt",
  "messageTs",
  "channelId",
  "channelName",
  "userId",
  "userDisplayName",
  "text",
  "permalink",
];

export class LaterExporter {
  private readonly client: WebClient;
  private readonly userNameCache = new Map<string, string>();
  private readonly channelNameCache = new Map<string, string>();

  constructor(userToken: string) {
    if (!userToken) {
      throw new Error("SLACK_USER_TOKEN is required to export Later items");
    }

    this.client = new WebClient(userToken, {
      logLevel: LogLevel.INFO,
    });
  }

  async run(outputDir = path.resolve(process.cwd(), "exports")) {
    const rows = await this.collectRows();
    const filePath = await this.writeCsv(rows, outputDir);
    return { filePath, rowCount: rows.length };
  }

  private async collectRows(): Promise<ExportRow[]> {
    const savedItems = await this.listSavedItems();
    const rows: ExportRow[] = [];

    for (const item of savedItems) {
      if (item.type !== "message" || !item.channel) {
        continue;
      }

      const sourceMessage = item.message;
      const messageTs = sourceMessage?.ts;

      if (!messageTs) {
        continue;
      }

      const channelId = item.channel;
      const savedAt = this.formatTimestamp(item.date_create);
      const message = await this.ensureMessage(channelId, messageTs, sourceMessage);
      const userId = message?.user ?? "";
      const normalizedUserId = userId || (message?.bot_id ? `bot:${message.bot_id}` : "unknown");
      const userDisplayName = userId
        ? await this.getUserDisplayName(userId)
        : message?.username || "Unknown";
      const channelName = await this.getChannelName(channelId);
      const permalink = await this.getPermalink(channelId, messageTs);
      const text = this.sanitizeText(message?.text ?? "");

      rows.push({
        savedAt,
        messageTs,
        channelId,
        channelName,
        userId: normalizedUserId,
        userDisplayName,
        text,
        permalink,
      });
    }

    return rows;
  }

  private async listSavedItems(): Promise<SavedItem[]> {
    const items: SavedItem[] = [];
    let cursor: string | undefined;

    do {
      const response = (await this.client.stars.list({
        cursor,
        limit: 200,
      })) as StarsListResponse & WebAPICallResult;

      if (!response.ok) {
        throw new Error(`Failed to read saved items: ${response.error ?? "unknown_error"}`);
      }

      if (response.items) {
        items.push(...response.items);
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return items;
  }

  private async ensureMessage(
    channel: string,
    messageTs: string,
    fallback?: SavedItem["message"]
  ): Promise<SlackMessage | SavedItem["message"] | undefined> {
    if (fallback?.text && fallback.user) {
      return fallback;
    }

    const history = (await this.client.conversations.history({
      channel,
      latest: messageTs,
      inclusive: true,
      limit: 1,
    })) as ConversationsHistoryResponse & WebAPICallResult;

    if (!history.ok) {
      throw new Error(
        `Failed to fetch message ${messageTs} in ${channel}: ${history.error ?? "unknown_error"}`
      );
    }

    return history.messages?.[0] ?? fallback;
  }

  private async getChannelName(channelId: string): Promise<string> {
    const cached = this.channelNameCache.get(channelId);
    if (cached) {
      return cached;
    }

    const response = (await this.client.conversations.info({
      channel: channelId,
    })) as ConversationsInfoResponse & WebAPICallResult;

    if (!response.ok || !response.channel) {
      throw new Error(
        `Unable to resolve channel ${channelId}: ${response.error ?? "unknown_error"}`
      );
    }

    const name =
      response.channel.name_normalized || response.channel.name || response.channel.id || channelId;
    this.channelNameCache.set(channelId, name);
    return name;
  }

  private async getUserDisplayName(userId: string): Promise<string> {
    const cached = this.userNameCache.get(userId);
    if (cached) {
      return cached;
    }

    const response = (await this.client.users.info({
      user: userId,
    })) as UsersInfoResponse & WebAPICallResult;

    if (!response.ok || !response.user) {
      return userId;
    }

    const profile = response.user.profile;
    const displayName =
      profile?.display_name?.trim() || profile?.real_name?.trim() || response.user.real_name || userId;

    this.userNameCache.set(userId, displayName);
    return displayName;
  }

  private async getPermalink(channelId: string, messageTs: string): Promise<string> {
    const response = (await this.client.chat.getPermalink({
      channel: channelId,
      message_ts: messageTs,
    })) as ChatGetPermalinkResponse & WebAPICallResult;

    if (!response.ok || !response.permalink) {
      throw new Error(
        `Failed to build permalink for ${channelId} at ${messageTs}: ${response.error ?? "unknown_error"}`
      );
    }

    return response.permalink;
  }

  private sanitizeText(text: string): string {
    return text.replace(/\r\n|\r|\n/g, " ").trim();
  }

  private formatTimestamp(ts?: number): string {
    if (!ts) {
      return "";
    }

    return new Date(ts * 1000).toISOString();
  }

  private async writeCsv(rows: ExportRow[], outputDir: string): Promise<string> {
    await mkdir(outputDir, { recursive: true });
    const timestamp = this.currentDateStamp();
    const filePath = path.join(outputDir, `later-export-${timestamp}.csv`);
    const csvContents = this.toCsv(rows);
    await writeFile(filePath, csvContents, "utf8");
    return filePath;
  }

  private toCsv(rows: ExportRow[]): string {
    const header = CSV_COLUMNS.join(",");
    const lines = rows.map((row) =>
      CSV_COLUMNS.map((column) => this.escapeCsv(row[column] ?? "")).join(",")
    );

    return [header, ...lines].join(os.EOL);
  }

  private escapeCsv(value: string): string {
    const needsQuotes = /[",\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  }

  private currentDateStamp(): string {
    const date = new Date();
    const pad = (num: number) => num.toString().padStart(2, "0");
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
  }
}
