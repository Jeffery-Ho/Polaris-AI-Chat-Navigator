import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldInstallGitHooks } from "../scripts/prepare.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function git(cwd, args, env) {
  return spawnSync("git", args, {
    cwd,
    env,
    encoding: "utf8"
  });
}

function readLog(logPath) {
  if (!existsSync(logPath)) return [];
  return readFile(logPath, "utf8").then((text) => text.split("\n").map((line) => line.trim()).filter(Boolean));
}

async function createRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), "polaris-hooks-"));
  const bin = path.join(dir, "bin");
  const log = path.join(dir, "pnpm.log");
  await mkdir(bin);
  await writeFile(path.join(bin, "pnpm"), `#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
if [ "$1" = "install" ] && [ "\${POLARIS_FAIL_INSTALL:-}" = "1" ]; then
  exit 1
fi
if [ "$1" = "build" ] && [ "\${POLARIS_FAIL_BUILD:-}" = "1" ]; then
  exit 1
fi
exit 0
`);
  await chmod(path.join(bin, "pnpm"), 0o755);
  await cp(path.join(repoRoot, ".githooks"), path.join(dir, ".githooks"), { recursive: true });
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await cp(path.join(repoRoot, "scripts", "refresh-extension.sh"), path.join(dir, "scripts", "refresh-extension.sh"));
  for (const file of ["post-checkout", "post-merge", "post-rewrite", path.join("..", "scripts", "refresh-extension.sh")]) {
    const target = file.startsWith("..")
      ? path.join(dir, "scripts", "refresh-extension.sh")
      : path.join(dir, ".githooks", file);
    await chmod(target, 0o755);
  }

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    POLARIS_PNPM_LOG: log,
    GIT_AUTHOR_NAME: "Polaris",
    GIT_AUTHOR_EMAIL: "polaris@example.com",
    GIT_COMMITTER_NAME: "Polaris",
    GIT_COMMITTER_EMAIL: "polaris@example.com",
    CI: "",
    GITHUB_ACTIONS: ""
  };
  delete env.POLARIS_FAIL_BUILD;
  delete env.POLARIS_FAIL_INSTALL;

  const run = (args, extra = {}) => git(dir, args, { ...env, ...extra });
  assert.equal(run(["init", "-b", "main"]).status, 0);
  assert.equal(run(["config", "user.email", "polaris@example.com"]).status, 0);
  assert.equal(run(["config", "user.name", "Polaris"]).status, 0);
  assert.equal(run(["config", "commit.gpgsign", "false"]).status, 0);
  assert.equal(run(["config", "core.hooksPath", ".githooks"]).status, 0);
  await writeFile(path.join(dir, "pnpm-lock.yaml"), "lock: a\n");
  await writeFile(path.join(dir, "readme.txt"), "base\n");
  assert.equal(run(["add", "pnpm-lock.yaml", "readme.txt"]).status, 0);
  assert.equal(run(["commit", "-m", "base"]).status, 0);
  await writeFile(log, "");
  return { dir, log, run, async cleanup() { await rm(dir, { recursive: true, force: true }); } };
}

test("prepare installs git hooks only outside CI", () => {
  assert.equal(shouldInstallGitHooks({}), true);
  assert.equal(shouldInstallGitHooks({ CI: "true" }), false);
  assert.equal(shouldInstallGitHooks({ GITHUB_ACTIONS: "true" }), false);
});

test("WXT development is isolated and hooks keep production dist current", async () => {
  const [pkg, workflow, gitignore, prepare] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../scripts/prepare.js", import.meta.url), "utf8")
  ]);
  assert.equal(pkg.scripts.dev, "wxt");
  assert.equal(pkg.scripts.build, "wxt build");
  assert.equal(pkg.scripts.prepare, "node scripts/prepare.js");
  assert.match(prepare, /runWxt\("prepare"\)/);
  assert.match(prepare, /if \(shouldInstallGitHooks\(\)\) runWxt\("build"\)/);
  assert.match(gitignore, /^dist\/$/m);
  assert.match(gitignore, /^\.output\/$/m);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.ok(workflow.indexOf("run: pnpm build") < workflow.indexOf("run: pnpm test"));
  assert.doesNotMatch(workflow, /githooks|refresh-extension|core\.hooksPath/);
});

test("branch checkout builds, and installs only when the lockfile changed", async () => {
  const repo = await createRepo();
  try {
    assert.equal(repo.run(["checkout", "-b", "feature"]).status, 0);
    await writeFile(path.join(repo.dir, "readme.txt"), "feature\n");
    assert.equal(repo.run(["add", "readme.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "feature"]).status, 0);
    await writeFile(repo.log, "");

    const back = repo.run(["checkout", "main"]);
    assert.equal(back.status, 0, back.stderr);
    assert.deepEqual(await readLog(repo.log), ["build"]);

    await writeFile(repo.log, "");
    await writeFile(path.join(repo.dir, "pnpm-lock.yaml"), "lock: b\n");
    assert.equal(repo.run(["add", "pnpm-lock.yaml"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "lock"]).status, 0);
    const feature = repo.run(["checkout", "feature"]);
    assert.equal(feature.status, 0, feature.stderr);
    assert.deepEqual(await readLog(repo.log), ["install --frozen-lockfile", "build"]);
  } finally {
    await repo.cleanup();
  }
});

test("file checkout skips the rebuild", async () => {
  const repo = await createRepo();
  try {
    await writeFile(path.join(repo.dir, "readme.txt"), "dirty\n");
    const started = Date.now();
    const restored = repo.run(["checkout", "--", "readme.txt"]);
    const elapsed = Date.now() - started;
    assert.equal(restored.status, 0, restored.stderr);
    assert.deepEqual(await readLog(repo.log), []);
    assert.ok(elapsed < 1000, `file checkout took ${elapsed}ms`);
  } finally {
    await repo.cleanup();
  }
});

test("CI checkout and merge are no-ops", async () => {
  const repo = await createRepo();
  try {
    assert.equal(repo.run(["checkout", "-b", "feature"]).status, 0);
    await writeFile(path.join(repo.dir, "readme.txt"), "feature\n");
    assert.equal(repo.run(["add", "readme.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "feature"]).status, 0);
    await writeFile(repo.log, "");
    const checkout = repo.run(["checkout", "main"], { CI: "true" });
    assert.equal(checkout.status, 0, checkout.stderr);
    assert.deepEqual(await readLog(repo.log), []);

    const merge = repo.run(["merge", "feature"], { GITHUB_ACTIONS: "true" });
    assert.equal(merge.status, 0, merge.stderr);
    assert.deepEqual(await readLog(repo.log), []);
  } finally {
    await repo.cleanup();
  }
});

test("merge and rebase rebuild without failing git", async () => {
  const repo = await createRepo();
  try {
    assert.equal(repo.run(["checkout", "-b", "feature"]).status, 0);
    await writeFile(path.join(repo.dir, "readme.txt"), "feature\n");
    assert.equal(repo.run(["add", "readme.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "feature"]).status, 0);
    assert.equal(repo.run(["checkout", "main"]).status, 0);
    await writeFile(path.join(repo.dir, "notes.txt"), "main\n");
    assert.equal(repo.run(["add", "notes.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "main"]).status, 0);
    await writeFile(repo.log, "");

    const merge = repo.run(["merge", "feature", "-m", "merge feature"]);
    assert.equal(merge.status, 0, merge.stderr);
    assert.deepEqual(await readLog(repo.log), ["build"]);

    assert.equal(repo.run(["checkout", "-b", "rebased"]).status, 0);
    await writeFile(path.join(repo.dir, "extra.txt"), "one\n");
    assert.equal(repo.run(["add", "extra.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "one"]).status, 0);
    await writeFile(path.join(repo.dir, "extra.txt"), "two\n");
    assert.equal(repo.run(["add", "extra.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "two"]).status, 0);
    assert.equal(repo.run(["checkout", "main"]).status, 0);
    await writeFile(path.join(repo.dir, "notes.txt"), "later\n");
    assert.equal(repo.run(["add", "notes.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "later"]).status, 0);
    assert.equal(repo.run(["checkout", "rebased"]).status, 0);
    await writeFile(repo.log, "");

    const rebase = repo.run(["rebase", "main"]);
    assert.equal(rebase.status, 0, rebase.stderr);
    const rebaseLog = await readLog(repo.log);
    const builds = rebaseLog.filter((line) => line === "build");
    assert.ok(builds.length >= 1 && builds.length <= 2, `unexpected rebase rebuilds: ${rebaseLog.join(", ")}`);
    assert.equal(rebaseLog.filter((line) => line.startsWith("install")).length, 0);
  } finally {
    await repo.cleanup();
  }
});

test("a failed build warns and does not block checkout", async () => {
  const repo = await createRepo();
  try {
    assert.equal(repo.run(["checkout", "-b", "feature"]).status, 0);
    await writeFile(path.join(repo.dir, "readme.txt"), "feature\n");
    assert.equal(repo.run(["add", "readme.txt"]).status, 0);
    assert.equal(repo.run(["commit", "-m", "feature"]).status, 0);
    await writeFile(repo.log, "");
    const back = repo.run(["checkout", "main"], { POLARIS_FAIL_BUILD: "1" });
    assert.equal(back.status, 0, back.stderr);
    assert.match(back.stderr, /\[Polaris\] pnpm build failed after checkout/);
    assert.deepEqual(await readLog(repo.log), ["build"]);
  } finally {
    await repo.cleanup();
  }
});
