import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), "passport-tint-"));
try {
  const compiled = spawnSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      join(here, "tsconfig.test.json"),
      "--outDir",
      output,
    ],
    { stdio: "inherit" },
  );
  if (compiled.status !== 0) process.exitCode = compiled.status ?? 1;
  else {
    const files = readdirSync(join(here, "tests")).filter((name) =>
      name.endsWith(".test.mjs"),
    );
    const tested = spawnSync(
      process.execPath,
      [
        "--test",
        ...files.map((name) => join(here, "tests", name)),
      ],
      {
        stdio: "inherit",
        env: { ...process.env, TINT_TEST_BUILD: output },
      },
    );
    process.exitCode = tested.status ?? 1;
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
