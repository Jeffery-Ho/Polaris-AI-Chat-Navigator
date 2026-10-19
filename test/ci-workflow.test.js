import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workflow, release, packageJson] = await Promise.all([
  readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8")
]);

test("拉取请求检查构建三个浏览器并 lint Firefox，且不发布", () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /run: pnpm check/);
  assert.match(workflow, /run: pnpm build$/m);
  assert.match(workflow, /run: pnpm test/);
  assert.match(workflow, /run: pnpm build:firefox/);
  assert.match(workflow, /run: pnpm build:edge/);
  assert.match(workflow, /run: pnpm zip:firefox/);
  assert.match(workflow, /run: pnpm zip:edge/);
  assert.match(workflow, /web-ext lint --source-dir \.output\/firefox-mv3 --no-input --no-config-discovery/);
  assert.doesNotMatch(workflow, /warnings-as-errors/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /name: store-packages/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /\.output\/\*-firefox\.zip/);
  assert.match(workflow, /\.output\/\*-edge\.zip/);
  assert.match(workflow, /\.output\/\*-sources\.zip/);
  assert.doesNotMatch(workflow, /gh release/);
  assert.doesNotMatch(workflow, /contents: write/);

  const buildIndex = workflow.indexOf("run: pnpm build\n");
  const testIndex = workflow.indexOf("run: pnpm test");
  assert.ok(buildIndex !== -1 && buildIndex < testIndex);
});

test("发布工作流仍只上传现有 Chrome 资产", () => {
  assert.doesNotMatch(release, /zip:firefox/);
  assert.doesNotMatch(release, /zip:edge/);
  assert.doesNotMatch(release, /web-ext lint/);
  assert.doesNotMatch(release, /upload-artifact/);
  assert.match(release, /stable_archive="release\/Polaris-AI\.zip"/);
  assert.match(release, /Polaris-AI-\$\{VERSION\}-build-\$\{BUILD\}\.zip/);
});

test("扩展依赖不包含 iconify-mcp-server", () => {
  assert.doesNotMatch(packageJson, /iconify-mcp-server/);
  assert.equal(JSON.parse(packageJson).dependencies, undefined);
});
