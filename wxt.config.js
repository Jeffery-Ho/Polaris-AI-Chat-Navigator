import { resolve } from "node:path";
import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import sourceManifest from "./manifest.build.json" with { type: "json" };
import { SUPPORTED_MATCHES } from "./src/supported-sites.js";

// WXT owns entrypoint paths and the manifest version; manifest.build.json holds
// product metadata, and every site pattern comes from SUPPORTED_MATCHES.
const { manifest_version, web_accessible_resources, ...manifest } = sourceManifest;

// Firefox add-on id; AMO ties every future update to it.
export const GECKO_ID = "polaris@polaris-ai.work";

// Firefox has no Side Panel API; WXT emits the sidepanel entrypoint as
// sidebar_action there, so drop the Chromium-only keys.
function browserManifest(browser) {
  const shared = {
    host_permissions: [...SUPPORTED_MATCHES],
    web_accessible_resources: web_accessible_resources.map((entry) => ({ ...entry, matches: [...SUPPORTED_MATCHES] }))
  };
  if (browser !== "firefox") return { ...manifest, ...shared };
  const { minimum_chrome_version, permissions, ...firefoxManifest } = manifest;
  return {
    ...firefoxManifest,
    ...shared,
    permissions: permissions.filter((permission) => permission !== "sidePanel"),
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] }
      }
    }
  };
}

export default defineConfig({
  imports: false,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifestVersion: 3,
  manifest: ({ browser }) => browserManifest(browser),
  zip: {
    artifactTemplate: "{{name}}-{{version}}-{{browser}}.zip",
    sourcesTemplate: "{{name}}-{{version}}-sources.zip",
    // AMO reviewers rebuild from these files with `pnpm install && pnpm build:firefox`.
    includeSources: [
      "entrypoints/**", "public/**", "src/**", "scripts/**",
      "manifest.build.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
      "wxt.config.js", "README.md", "LICENSE"
    ]
  },
  watchOptions: {
    ignored: [/(?:^|[/\\])(?:dist|Release)(?:[/\\]|$)/]
  },
  hooks: {
    "config:resolved"(wxt) {
      // Only the Chrome package lives in dist/; other browsers keep .output/<browser>-mv3/.
      if (wxt.config.command !== "serve" && wxt.config.browser === "chrome") wxt.config.outDir = resolve(wxt.config.root, "dist");
    }
  }
});
