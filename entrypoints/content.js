import { defineContentScript } from "wxt/utils/define-content-script";
import manifest from "../manifest.build.json" with { type: "json" };
import { initializeI18n } from "../src/i18n.js";
import { initializeContent } from "../src/content.js";
import "../src/styles.css";

const options = manifest.content_scripts[0];

export default defineContentScript({
  matches: options.matches,
  allFrames: options.all_frames,
  runAt: options.run_at,
  cssInjectionMode: "manifest",
  main(ctx) {
    initializeI18n();
    const dispose = initializeContent();
    if (dispose) ctx.onInvalidated(dispose);
  }
});
