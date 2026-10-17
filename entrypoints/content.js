import { defineContentScript } from "wxt/utils/define-content-script";
import { SUPPORTED_MATCHES } from "../src/supported-sites.js";
import { initializeContent } from "../src/content.js";
import "../src/styles.css";

export default defineContentScript({
  matches: [...SUPPORTED_MATCHES],
  allFrames: true,
  runAt: "document_idle",
  cssInjectionMode: "manifest",
  main(ctx) {
    const dispose = initializeContent();
    if (dispose) ctx.onInvalidated(dispose);
  }
});
