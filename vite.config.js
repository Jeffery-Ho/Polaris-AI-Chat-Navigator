import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.build.json" with { type: "json" };

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: "sidepanel.html"
      },
      output: {
        chunkFileNames: (chunkInfo) => {
          const name = chunkInfo.name.endsWith(".js") ? chunkInfo.name : `${chunkInfo.name}.js`;
          return `assets/${name}`;
        },
        entryFileNames: "assets/[name].js"
      }
    }
  },
  plugins: [crx({
    manifest,
    contentScripts: {
      standaloneFiles: ["src/content.js"]
    }
  })]
});
