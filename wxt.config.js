import { resolve } from "node:path";
import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import sourceManifest from "./manifest.build.json" with { type: "json" };
import { SUPPORTED_MATCHES } from "./src/supported-sites.js";

// WXT owns entrypoint paths and the manifest version; manifest.build.json holds
// product metadata, and every site pattern comes from SUPPORTED_MATCHES.
const { manifest_version, web_accessible_resources, ...manifest } = sourceManifest;

export default defineConfig({
  imports: false,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifestVersion: 3,
  manifest: {
    ...manifest,
    host_permissions: [...SUPPORTED_MATCHES],
    web_accessible_resources: web_accessible_resources.map((entry) => ({ ...entry, matches: [...SUPPORTED_MATCHES] }))
  },
  watchOptions: {
    ignored: [/(?:^|[/\\])(?:dist|Release)(?:[/\\]|$)/]
  },
  hooks: {
    "config:resolved"(wxt) {
      if (wxt.config.command !== "serve") wxt.config.outDir = resolve(wxt.config.root, "dist");
    }
  }
});
