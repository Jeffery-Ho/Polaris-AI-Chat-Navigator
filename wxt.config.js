import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "wxt";
import sourceManifest from "./manifest.build.json" with { type: "json" };

// WXT owns generated entrypoint paths; all product metadata stays in the
// existing manifest source, including version_name and host permissions.
const { manifest_version, background, content_scripts, side_panel, ...manifest } = sourceManifest;

export default defineConfig({
  imports: false,
  manifestVersion: 3,
  manifest,
  watchOptions: {
    ignored: [/(?:^|[/\\])(?:dist|Release)(?:[/\\]|$)/]
  },
  hooks: {
    "config:resolved"(wxt) {
      if (wxt.config.command !== "serve") wxt.config.outDir = resolve(wxt.config.root, "dist");
    },
    "build:publicAssets"(wxt, assets) {
      for (const name of readdirSync(resolve(wxt.config.root, "icons"))) {
        assets.push({ absoluteSrc: resolve(wxt.config.root, "icons", name), relativeDest: `icons/${name}` });
      }
      assets.push({ absoluteSrc: resolve(wxt.config.root, "src/route-bridge.js"), relativeDest: "src/route-bridge.js" });
    }
  }
});
