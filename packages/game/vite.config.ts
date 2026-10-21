import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import {
  applyBuildPlaceholders,
  createBuildInfo,
  parseChangelog,
  type ChangelogEntry,
} from "./build-info";

const port = Number(process.env.TICKET_PORT ?? 4173);
const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(packageRoot, "../..");
const changelogPath = resolve(repoRoot, "docs/CHANGELOG.md");

function readGitSha(): string | null {
  try {
    const output = execFileSync(
      "git",
      ["rev-parse", "--short", "HEAD"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const sha = output.trim();
    return sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}

function readChangelogEntries(): ChangelogEntry[] {
  try {
    return parseChangelog(readFileSync(changelogPath, "utf8"));
  } catch {
    return [];
  }
}

function buildInfoPlugin(): Plugin {
  return {
    name: "moonlander-build-info",
    transformIndexHtml(html: string): string {
      const info = createBuildInfo({
        env: process.env,
        now: new Date(),
        gitSha: readGitSha(),
      });

      return applyBuildPlaceholders(html, info, readChangelogEntries());
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [buildInfoPlugin()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
