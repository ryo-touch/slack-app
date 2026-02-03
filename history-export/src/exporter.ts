import path from "path";
import os from "os";
import { mkdir, writeFile, readFile } from "fs/promises";
import {
  WebClient,
  WebAPICallResult,
  LogLevel,
  retryPolicies,
  ErrorCode,
  type CodedError,
} from "@slack/web-api";
import type {
  ConversationsHistoryResponse,
  ConversationsRepliesResponse,
  ConversationsInfoResponse,
  ConversationsListResponse,
  UsersInfoResponse,
  UsersListResponse,
} from "@slack/web-api";

type SlackMessage = NonNullable<ConversationsHistoryResponse["messages"]>[number];
type SlackUser = NonNullable<UsersListResponse["members"]>[number];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  return (error as CodedError)?.code === ErrorCode.RateLimitedError;
}

export interface ExportOptions {
  channelId: string;
  startDate?: Date;
  endDate?: Date;
  format: "csv" | "markdown" | "yaml";
  outputDir: string;
}

export interface ExportResult {
  filePath: string;
  messageCount: number;
}

interface MessageWithReplies {
  message: SlackMessage;
  replies: SlackMessage[];
}

interface ChannelCacheFile {
  updatedAt: string;
  channels: Record<string, string>; // name -> id
}

interface UserCacheFile {
  updatedAt: string;
  users: Record<string, string>; // id -> displayName
}

interface ChannelInfo {
  id: string;
  name: string;
}

export class HistoryExporter {
  private readonly client: WebClient;
  private readonly userCache = new Map<string, string>();
  private readonly channelNameToIdCache = new Map<string, string>();
  private readonly channelIdToNameCache = new Map<string, string>();
  private readonly cacheDir: string;

  constructor(token: string, cacheDir: string = ".cache") {
    if (!token) {
      throw new Error("SLACK_USER_TOKEN is required to export history");
    }

    this.cacheDir = cacheDir;
    this.client = new WebClient(token, {
      logLevel: LogLevel.WARN,
      retryConfig: retryPolicies.fiveRetriesInFiveMinutes,
      rejectRateLimitedCalls: false,
    });
  }

  private get channelCacheFilePath(): string {
    return path.join(this.cacheDir, "channels.json");
  }

  private get userCacheFilePath(): string {
    return path.join(this.cacheDir, "users.json");
  }

  private async loadChannelCacheFromFile(): Promise<ChannelCacheFile | null> {
    try {
      const data = await readFile(this.channelCacheFilePath, "utf8");
      return JSON.parse(data) as ChannelCacheFile;
    } catch {
      return null;
    }
  }

  private async saveChannelCacheToFile(
    channels: Record<string, string>
  ): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const cache: ChannelCacheFile = {
      updatedAt: new Date().toISOString(),
      channels,
    };
    await writeFile(
      this.channelCacheFilePath,
      JSON.stringify(cache, null, 2),
      "utf8"
    );
  }

  private async loadUserCacheFromFile(): Promise<UserCacheFile | null> {
    try {
      const data = await readFile(this.userCacheFilePath, "utf8");
      return JSON.parse(data) as UserCacheFile;
    } catch {
      return null;
    }
  }

  private async saveUserCacheToFile(
    users: Record<string, string>
  ): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const cache: UserCacheFile = {
      updatedAt: new Date().toISOString(),
      users,
    };
    await writeFile(
      this.userCacheFilePath,
      JSON.stringify(cache, null, 2),
      "utf8"
    );
  }

  async prefetchUsersToCache(refreshCache: boolean = false): Promise<number> {
    await this.prefetchUsers(refreshCache);
    return this.userCache.size;
  }

  async listChannels(refreshCache: boolean = false): Promise<ChannelInfo[]> {
    // Try to use cached data if not forcing refresh
    if (!refreshCache) {
      const cachedData = await this.loadChannelCacheFromFile();
      if (cachedData) {
        console.log(
          `Using cached channel list from ${cachedData.updatedAt}`
        );
        const channels: ChannelInfo[] = Object.entries(cachedData.channels).map(
          ([name, id]) => ({ name, id })
        );
        channels.sort((a, b) => a.name.localeCompare(b.name));
        return channels;
      }
    }

    console.log("Fetching channel list from Slack API...");
    const channels: ChannelInfo[] = [];
    let cursor: string | undefined;

    do {
      const response = (await this.client.conversations.list({
        cursor,
        limit: 200,
        types: "public_channel,private_channel",
      })) as ConversationsListResponse & WebAPICallResult;

      if (!response.ok) {
        throw new Error(
          `Failed to list channels: ${response.error ?? "unknown_error"}`
        );
      }

      for (const ch of response.channels ?? []) {
        if (ch.id && ch.name) {
          channels.push({ id: ch.id, name: ch.name });
        }
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Save to cache file
    const cacheData: Record<string, string> = {};
    for (const ch of channels) {
      cacheData[ch.name] = ch.id;
    }
    await this.saveChannelCacheToFile(cacheData);
    console.log(`Channel cache saved to ${this.channelCacheFilePath}`);

    channels.sort((a, b) => a.name.localeCompare(b.name));
    return channels;
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    const channelId = await this.resolveChannelId(options.channelId);
    const channelName = await this.getChannelName(channelId);

    console.log(`Fetching history for #${channelName}...`);

    const messages = await this.fetchHistory(
      channelId,
      options.startDate,
      options.endDate
    );

    console.log(`Found ${messages.length} messages`);

    const messagesWithReplies = await this.expandThreads(channelId, messages);

    // Prefetch all users to avoid rate limits during formatting
    await this.prefetchUsers();

    const content =
      options.format === "csv"
        ? await this.formatAsCsv(channelName, messagesWithReplies)
        : options.format === "yaml"
        ? await this.formatAsYaml(channelName, messagesWithReplies)
        : await this.formatAsMarkdown(channelName, messagesWithReplies);

    const filePath = await this.writeOutput(
      content,
      channelName,
      options.format,
      options.outputDir
    );

    return {
      filePath,
      messageCount: messages.length,
    };
  }

  private async resolveChannelId(channelIdOrName: string): Promise<string> {
    // If it's already an ID, return as-is
    if (channelIdOrName.startsWith("C") || channelIdOrName.startsWith("G")) {
      return channelIdOrName;
    }

    const normalizedName = channelIdOrName.replace(/^#/, "");

    // Check in-memory cache first
    const cached = this.channelNameToIdCache.get(normalizedName);
    if (cached) {
      return cached;
    }

    // Try to load from file cache
    const cachedData = await this.loadChannelCacheFromFile();
    if (cachedData) {
      const channelId = cachedData.channels[normalizedName];
      if (channelId) {
        // Populate in-memory caches
        for (const [name, id] of Object.entries(cachedData.channels)) {
          this.channelNameToIdCache.set(name, id);
          this.channelIdToNameCache.set(id, name);
        }
        console.log(`Using channel ID from cache: ${normalizedName} -> ${channelId}`);
        return channelId;
      }
    }

    // Fallback: fetch from API
    console.log("Channel not in cache, fetching from Slack API...");
    let cursor: string | undefined;
    const allChannels: Record<string, string> = {};

    do {
      const response = (await this.client.conversations.list({
        cursor,
        limit: 200,
        types: "public_channel,private_channel",
      })) as ConversationsListResponse & WebAPICallResult;

      if (!response.ok) {
        throw new Error(
          `Failed to list channels: ${response.error ?? "unknown_error"}`
        );
      }

      for (const ch of response.channels ?? []) {
        if (ch.id && ch.name) {
          allChannels[ch.name] = ch.id;
          this.channelNameToIdCache.set(ch.name, ch.id);
          this.channelIdToNameCache.set(ch.id, ch.name);
        }
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Save to cache file for next time
    await this.saveChannelCacheToFile(allChannels);
    console.log(`Channel cache saved to ${this.channelCacheFilePath}`);

    const channelId = allChannels[normalizedName];
    if (channelId) {
      return channelId;
    }

    throw new Error(`Channel not found: ${channelIdOrName}`);
  }

  private async fetchHistory(
    channelId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;

    const oldest = startDate
      ? (startDate.getTime() / 1000).toString()
      : undefined;
    const latest = endDate ? (endDate.getTime() / 1000).toString() : undefined;

    do {
      const response = (await this.client.conversations.history({
        channel: channelId,
        cursor,
        limit: 200,
        oldest,
        latest,
      })) as ConversationsHistoryResponse & WebAPICallResult;

      if (!response.ok) {
        throw new Error(
          `Failed to fetch history: ${response.error ?? "unknown_error"}`
        );
      }

      if (response.messages) {
        messages.push(...response.messages);
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    messages.sort((a, b) => {
      const tsA = parseFloat(a.ts ?? "0");
      const tsB = parseFloat(b.ts ?? "0");
      return tsA - tsB;
    });

    return messages;
  }

  private async fetchThreadReplies(
    channelId: string,
    threadTs: string
  ): Promise<SlackMessage[]> {
    const replies: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const response = (await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        cursor,
        limit: 200,
      })) as ConversationsRepliesResponse & WebAPICallResult;

      if (!response.ok) {
        throw new Error(
          `Failed to fetch thread replies: ${response.error ?? "unknown_error"}`
        );
      }

      if (response.messages) {
        replies.push(...response.messages);
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return replies.filter((msg) => msg.ts !== threadTs);
  }

  private async expandThreads(
    channelId: string,
    messages: SlackMessage[]
  ): Promise<MessageWithReplies[]> {
    const result: MessageWithReplies[] = [];

    // Count threads to fetch for progress display
    const threadsToFetch = messages.filter(
      (m) => m.thread_ts && m.reply_count && m.reply_count > 0
    );
    let threadIndex = 0;

    for (const message of messages) {
      const replies: SlackMessage[] = [];

      if (message.thread_ts && message.reply_count && message.reply_count > 0) {
        threadIndex++;
        console.log(
          `  Fetching thread ${threadIndex}/${threadsToFetch.length} (${message.reply_count} replies)...`
        );
        const threadReplies = await this.fetchThreadReplies(
          channelId,
          message.thread_ts
        );
        replies.push(...threadReplies);

        // Throttle to avoid rate limits (100ms between thread fetches)
        if (threadIndex < threadsToFetch.length) {
          await delay(100);
        }
      }

      result.push({ message, replies });
    }

    return result;
  }

  private async getChannelName(channelId: string): Promise<string> {
    // Check in-memory cache first
    const cached = this.channelIdToNameCache.get(channelId);
    if (cached) {
      return cached;
    }

    // Try to load from file cache
    const cachedData = await this.loadChannelCacheFromFile();
    if (cachedData) {
      for (const [name, id] of Object.entries(cachedData.channels)) {
        this.channelNameToIdCache.set(name, id);
        this.channelIdToNameCache.set(id, name);
      }
      const cachedName = this.channelIdToNameCache.get(channelId);
      if (cachedName) {
        return cachedName;
      }
    }

    // Fallback: fetch from API
    const response = (await this.client.conversations.info({
      channel: channelId,
    })) as ConversationsInfoResponse & WebAPICallResult;

    if (!response.ok || !response.channel) {
      throw new Error(
        `Unable to resolve channel ${channelId}: ${response.error ?? "unknown_error"}`
      );
    }

    const name =
      response.channel.name_normalized ||
      response.channel.name ||
      response.channel.id ||
      channelId;

    this.channelIdToNameCache.set(channelId, name);
    return name;
  }

  private async prefetchUsers(forceRefresh: boolean = false): Promise<void> {
    // Try to load from file cache first
    if (!forceRefresh) {
      const cachedData = await this.loadUserCacheFromFile();
      if (cachedData) {
        for (const [id, name] of Object.entries(cachedData.users)) {
          this.userCache.set(id, name);
        }
        console.log(
          `Using cached user list (${Object.keys(cachedData.users).length} users) from ${cachedData.updatedAt}`
        );
        return;
      }
    }

    console.log("Fetching user list from Slack API...");
    let cursor: string | undefined;
    let userCount = 0;

    do {
      const response = (await this.client.users.list({
        cursor,
        limit: 200,
      })) as UsersListResponse & WebAPICallResult;

      if (!response.ok) {
        console.warn(`Warning: Failed to prefetch users: ${response.error}`);
        return;
      }

      for (const member of response.members ?? []) {
        if (member.id) {
          this.userCache.set(member.id, this.extractDisplayName(member));
          userCount++;
        }
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Save to file cache
    const usersData: Record<string, string> = {};
    for (const [id, name] of this.userCache.entries()) {
      usersData[id] = name;
    }
    await this.saveUserCacheToFile(usersData);
    console.log(`User cache saved to ${this.userCacheFilePath} (${userCount} users)`);
  }

  private extractDisplayName(user: SlackUser): string {
    const profile = user.profile;
    return (
      profile?.display_name?.trim() ||
      profile?.real_name?.trim() ||
      user.real_name ||
      user.id ||
      "unknown"
    );
  }

  private async getUserName(userId: string): Promise<string> {
    const cached = this.userCache.get(userId);
    if (cached) {
      return cached;
    }

    // Fallback: fetch individual user if not in cache (e.g., deactivated users)
    try {
      const response = (await this.client.users.info({
        user: userId,
      })) as UsersInfoResponse & WebAPICallResult;

      if (!response.ok || !response.user) {
        this.userCache.set(userId, userId);
        return userId;
      }

      const profile = response.user.profile;
      const displayName =
        profile?.display_name?.trim() ||
        profile?.real_name?.trim() ||
        response.user.real_name ||
        userId;

      this.userCache.set(userId, displayName);
      return displayName;
    } catch (error) {
      if (isRateLimitError(error)) {
        console.warn(`Rate limited while fetching user ${userId}, using ID`);
      }
      this.userCache.set(userId, userId);
      return userId;
    }
  }

  private async formatAsMarkdown(
    channelName: string,
    messages: MessageWithReplies[]
  ): Promise<string> {
    const lines: string[] = [];
    lines.push(`# #${channelName}`);
    lines.push("");

    let currentDate = "";

    for (const { message, replies } of messages) {
      const timestamp = this.parseTimestamp(message.ts);
      const dateStr = this.formatDate(timestamp);
      const timeStr = this.formatTime(timestamp);

      if (dateStr !== currentDate) {
        currentDate = dateStr;
        lines.push(`## ${dateStr}`);
        lines.push("");
      }

      const userName = await this.resolveUserName(message);
      const text = this.formatMessageText(message.text ?? "");

      lines.push(`### ${timeStr} @${userName}`);
      lines.push(text);
      lines.push("");

      for (const reply of replies) {
        const replyTimestamp = this.parseTimestamp(reply.ts);
        const replyTimeStr = this.formatTime(replyTimestamp);
        const replyUserName = await this.resolveUserName(reply);
        const replyText = this.formatMessageText(reply.text ?? "");

        lines.push(`> **${replyTimeStr} @${replyUserName}**`);
        for (const line of replyText.split("\n")) {
          lines.push(`> ${line}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private async formatAsCsv(
    channelName: string,
    messages: MessageWithReplies[]
  ): Promise<string> {
    const header = "timestamp,channel,user,text,thread_ts,reply_count";
    const rows: string[] = [header];

    for (const { message, replies } of messages) {
      const timestamp = this.parseTimestamp(message.ts);
      const userName = await this.resolveUserName(message);
      const text = this.sanitizeText(message.text ?? "");

      rows.push(
        [
          this.escapeCsv(timestamp.toISOString()),
          this.escapeCsv(channelName),
          this.escapeCsv(userName),
          this.escapeCsv(text),
          this.escapeCsv(message.thread_ts ?? ""),
          this.escapeCsv(String(message.reply_count ?? 0)),
        ].join(",")
      );

      for (const reply of replies) {
        const replyTimestamp = this.parseTimestamp(reply.ts);
        const replyUserName = await this.resolveUserName(reply);
        const replyText = this.sanitizeText(reply.text ?? "");

        rows.push(
          [
            this.escapeCsv(replyTimestamp.toISOString()),
            this.escapeCsv(channelName),
            this.escapeCsv(replyUserName),
            this.escapeCsv(replyText),
            this.escapeCsv(reply.thread_ts ?? ""),
            this.escapeCsv("0"),
          ].join(",")
        );
      }
    }

    return rows.join(os.EOL);
  }

  private async formatAsYaml(
    channelName: string,
    messages: MessageWithReplies[]
  ): Promise<string> {
    const lines: string[] = [];
    const exportedAt = new Date().toISOString();

    lines.push(`channel: ${channelName}`);
    lines.push(`exported_at: ${exportedAt}`);
    lines.push("messages:");

    for (const { message, replies } of messages) {
      const timestamp = this.parseTimestamp(message.ts);
      const dateStr = this.formatDate(timestamp);
      const timeStr = this.formatTime(timestamp);
      const userName = await this.resolveUserName(message);
      const text = message.text ?? "";

      lines.push(`  - ts: "${message.ts ?? ""}"`);
      lines.push(`    date: "${dateStr}"`);
      lines.push(`    time: "${timeStr}"`);
      lines.push(`    user: ${userName}`);
      lines.push(`    text: |`);
      for (const textLine of text.split("\n")) {
        lines.push(`      ${textLine}`);
      }

      if (replies.length > 0) {
        lines.push("    replies:");
        for (const reply of replies) {
          const replyTimestamp = this.parseTimestamp(reply.ts);
          const replyTimeStr = this.formatTime(replyTimestamp);
          const replyUserName = await this.resolveUserName(reply);
          const replyText = reply.text ?? "";

          lines.push(`      - ts: "${reply.ts ?? ""}"`);
          lines.push(`        time: "${replyTimeStr}"`);
          lines.push(`        user: ${replyUserName}`);
          lines.push(`        text: |`);
          for (const replyTextLine of replyText.split("\n")) {
            lines.push(`          ${replyTextLine}`);
          }
        }
      } else {
        lines.push("    replies: []");
      }
    }

    return lines.join("\n");
  }

  private async resolveUserName(message: SlackMessage): Promise<string> {
    if (message.user) {
      return this.getUserName(message.user);
    }
    if (message.bot_id) {
      return message.username || `bot:${message.bot_id}`;
    }
    return "unknown";
  }

  private parseTimestamp(ts?: string): Date {
    if (!ts) {
      return new Date();
    }
    return new Date(parseFloat(ts) * 1000);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  private formatMessageText(text: string): string {
    return text.trim();
  }

  private sanitizeText(text: string): string {
    return text.replace(/\r\n|\r|\n/g, " ").trim();
  }

  private escapeCsv(value: string): string {
    const needsQuotes = /[",\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  }

  private async writeOutput(
    content: string,
    channelName: string,
    format: "csv" | "markdown" | "yaml",
    outputDir: string
  ): Promise<string> {
    await mkdir(outputDir, { recursive: true });
    const timestamp = this.currentDateStamp();
    const extension = format === "csv" ? "csv" : format === "yaml" ? "yaml" : "md";
    const filePath = path.join(
      outputDir,
      `${channelName}-${timestamp}.${extension}`
    );
    await writeFile(filePath, content, "utf8");
    return filePath;
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
