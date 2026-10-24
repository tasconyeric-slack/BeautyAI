// Run from web/: node lib/copy/run-tests.mjs. No shared test setup required.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = mkdtempSync(join(tmpdir(), "passport-copy-tests-"));
try {
  const compile = spawnSync(process.execPath, [
    join(web, "node_modules/typescript/bin/tsc"),
    "lib/copy/zh.ts", "lib/copy/zh.test.ts",
    "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
    "--esModuleInterop", "--skipLibCheck", "--strict", "--outDir", output,
  ], { cwd: web, stdio: "inherit" });
  if (compile.error) throw compile.error;
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, [join(output, "zh.test.js")], { cwd: web, stdio: "inherit" });
    if (tests.error) throw tests.error;
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
