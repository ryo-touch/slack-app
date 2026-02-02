import dotenv from "dotenv";
import { LaterExporter } from "../later/exporter";

dotenv.config();

const userToken = process.env.SLACK_USER_TOKEN;

async function main() {
  if (!userToken) {
    throw new Error(
      "SLACK_USER_TOKEN is not defined. Add your user OAuth token to the .env file before running the exporter."
    );
  }

  const exporter = new LaterExporter(userToken);
  const { filePath, rowCount } = await exporter.run();
  console.log(`Exported ${rowCount} saved items to ${filePath}`);
}

main().catch((error) => {
  console.error("Failed to export Slack Later items:", error);
  process.exitCode = 1;
});
