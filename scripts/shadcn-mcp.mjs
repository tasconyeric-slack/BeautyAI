// Keep the shadcn MCP process in web/, where components.json lives.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../web");
const isWindows = process.platform === "win32";
const child = spawn(isWindows ? "cmd.exe" : "npx", isWindows
  ? ["/d", "/s", "/c", "npx.cmd --yes shadcn@latest mcp"]
  : ["--yes", "shadcn@latest", "mcp"], {
  cwd: webRoot,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("Unable to start shadcn MCP:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
