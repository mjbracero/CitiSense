// ===== [BACKUP SERVER] CLI: `npm run backup:now` runs one backup without the API =====
import { runBackup } from "./backup.js";

const command = process.argv[2];

if (command !== "backup") {
  console.log("Usage: node src/cli.js backup");
  process.exit(1);
}

const result = await runBackup({ trigger: "cli" });
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "success" ? 0 : 1);
