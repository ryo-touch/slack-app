import { App, LogLevel } from "@slack/bolt";
import dotenv from "dotenv";

dotenv.config();

const botToken = process.env.SLACK_BOT_TOKEN;
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const appToken = process.env.SLACK_APP_TOKEN;
const socketMode = process.env.SLACK_SOCKET_MODE === "true";

if (!botToken) {
  throw new Error("Missing SLACK_BOT_TOKEN in environment");
}

if (!signingSecret && !socketMode) {
  throw new Error(
    "Provide SLACK_SIGNING_SECRET for HTTP mode or enable Socket Mode"
  );
}

if (socketMode && !appToken) {
  throw new Error("Socket Mode requires SLACK_APP_TOKEN");
}

const app = new App({
  token: botToken,
  signingSecret,
  logLevel: LogLevel.INFO,
  socketMode,
  appToken,
});

app.event("app_mention", async ({ event, say }) => {
  await say(`Hi, <@${event.user}>!`);
});

const port = Number(process.env.PORT) || 3000;

(async () => {
  await app.start(port);
  console.log(`⚡️ Slack Bolt app is running on port ${port}`);
})();
