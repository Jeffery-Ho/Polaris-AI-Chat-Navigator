import { createContentLifecycle } from "./content-lifecycle.js";
import { createChatGptIndexController } from "./chatgpt-index-controller.js";
import { createConversationCacheClient } from "./conversation-cache.js";
import { createChatGptConversationCover } from "./chatgpt-conversation-cover.js";
import { createLocateFlash } from "./locate-flash.js";
import { chapterTreeText } from "./sidepanel-chapter-state.js";
import { mountSettingsPanel } from "./settings-panel.js";
import { createI18n } from "./i18n.js";
import { cleanupLegacyMakerSnapshots } from "./legacy-maker-snapshot-cleanup.js";
import { doubaoMessageRoleFromClassNames } from "./doubao-message-role.js";
import { dedupeAdjacentTextHeadings } from "./adjacent-heading-deduplication.js";
import {
  createPageThemeWatcher,
  pageThemeFromColors,
  PAGE_THEME_MEDIA_QUERY
} from "./page-theme.js";
import { releaseNotesForUpdate } from "./release-notes.js";
import { nextControlTabIndex } from "./control-tab-keyboard.js";
import {
  hasExceededMarkerListDragThreshold,
  preserveMarkerListDragPosition
} from "./marker-list-drag.js";
import { createMarkerListActiveTracker } from "./marker-list-active-tracker.js";
import {
  createMarkerListNativeWheelHandler,
  markerListCardForTarget
} from "./marker-list-native-scroll.js";
import { hasRelevantMarkerMutation } from "./marker-mutation-relevance.js";
import { createMarkerListReconciler } from "./marker-list-reconciler.js";
import { createMarkerListScrollPersistence } from "./marker-list-scroll-persistence.js";
import { createMarkerScanContext } from "./marker-scan-context.js";
import { collectSidepanelChapters } from "./sidepanel-chapter-content.js";
import { buildWindowChapterOutline } from "./window-chapter-outline.js";
import { limitMarkerGroups } from "./marker-group-limit.js";
import {
  createMarkerMotionSuppressor,
  createMarkerStreamingIndicator
} from "./marker-motion-suppression.js";
import { createMarkerRenderStateMachine } from "./marker-render-state-machine.js";
import { createRuntimeMarkerKeySequence } from "./runtime-marker-key-sequence.js";
import {
  isFoldGroupExpanded,
  toggleFoldGroupExpansion
} from "./marker-group-expansion.js";
import {
  isUserMarkerExpanded,
  latestUserMarkerKey,
  shouldShowUserMarkerNotLoadedNotice,
} from "./user-marker-expansion.js";
import {
  scrollMarkerIntoView,
  TABLE_MARKER_LEVEL,
  tableMarkerEntries,
  tableMarkerEntryForTarget
} from "./table-marker.js";
import {
  appendSanitizedChapterContent,
  appendSanitizedChapterNode,
  appendParsedMarkdownInline,
  CHAPTER_BLOCK_SELECTOR,
  parseChapterMarkdown
} from "./chapter-markdown.js";
import { createPointerDragLifecycle } from "./pointer-drag-lifecycle.js";
import { pointerCaptureTargetForEvent } from "./pointer-capture-target.js";
import { createDiagnosticLog } from "./diagnostic-log.js";
import {
  diagnosticFilename,
  downloadDiagnosticLog,
  openDiagnosticEmail
} from "./diagnostic-export.js";
import {
  inlineUserMessageImageSource,
  isOwnedUserAttachmentCandidate,
  safeUserMessageImageUrl,
  userMessageImageSelectorForPlatform,
  userMessageThumbnailForSources
} from "./user-message-images.js";
import { bindSearchInput } from "./search-input.js";
import { sendRuntimeMessage } from "./runtime-message.js";
import {
  HASHED_HEADING_SELECTOR,
  HASHED_MARKDOWN_ROOT_SELECTOR,
  hashedMarkdownHeadingLevel
} from "./hashed-markdown.js";
import {
  CHATGPT_LEGACY_ASSISTANT_SELECTOR,
  CHATGPT_USER_SELECTOR,
  CHATGPT_PROSE_SELECTOR,
  isChatGptUserTurnNode,
  mergeChatGptAssistantNodes,
  stripChatGptUserRolePrefix
} from "./chatgpt-messages.js";
import {
  collectManusConversation,
  manusUserMessageText,
  isManusConversationScrollTarget,
  MANUS_ASSISTANT_SELECTOR,
  MANUS_USER_CONTAINER_SELECTOR
} from "./manus-messages.js";
import {
  collectDeepSeekConversation,
  deepseekUserMessageText,
  isDeepSeekConversationScrollTarget,
  isDeepSeekConversationMutation,
  DEEPSEEK_OBSERVED_ATTRIBUTES,
  DEEPSEEK_ASSISTANT_SELECTOR,
  DEEPSEEK_USER_CONTAINER_SELECTOR
} from "./deepseek-messages.js";
import {
  routeFallbackDiagnosticDecision,
  routeFallbackLogLevel,
  routeFallbackLogMessage
} from "./snapshot-delivery.js";

export function initializeContent() {
  const CONTENT_SCRIPT_INSTANCE_KEY = "__POLARIS_CONTENT_SCRIPT_ACTIVE__";

  if (globalThis[CONTENT_SCRIPT_INSTANCE_KEY]) {
    return;
  }
  globalThis[CONTENT_SCRIPT_INSTANCE_KEY] = true;
  const lifecycle = createContentLifecycle(window);

  const { locale, t } = createI18n();
  const ROOT_ID = "gpt-paragraph-nav";
  const MAX_USER_PREVIEW_LENGTH = 160;
  const MARKER_MOTION_SUPPRESSION_CLASS = "is-marker-motion-suppressed";
  const DEBUG_ATTR = "data-gpt-paragraph-nav";
  const HEADING_SELECTOR = "h1, h2, h3, h4";
  const ROLE_HEADING_SELECTOR = '[role="heading"][aria-level]';
  const STRONG_HEADING_SELECTOR = "p, li";
  const NUMBERED_HEADING_SELECTOR = "p, div";
  const MARKER_CANDIDATE_SELECTOR = [
    HEADING_SELECTOR,
    ROLE_HEADING_SELECTOR,
    STRONG_HEADING_SELECTOR,
    NUMBERED_HEADING_SELECTOR,
    "ul > li",
    "ol > li"
  ].join(", ");
  const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"]';
  const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';
  const CHATGPT_MODEL_SELECTOR = [
    'button[data-testid="model-switcher"]',
    'button[aria-label*="Select ChatGPT model" i]',
    'button[aria-label*="select model" i]',
    'button[aria-label*="选择模型" i]'
  ].join(", ");
  const CLAUDE_ASSISTANT_MESSAGE_SELECTOR = 'div[data-cds="Prose"].prose';
  const CLAUDE_USER_MESSAGE_SELECTOR = '[data-cds="UserMessage"] [data-testid="user-message"]';
  const GEMINI_ASSISTANT_MESSAGE_SELECTOR = "model-response message-content";
  const GEMINI_USER_MESSAGE_SELECTOR = "user-query";
  const GEMINI_USER_MESSAGE_FALLBACK_SELECTOR = "user-query-content, .user-query-content, .user-query-container";
  // Prefer the query body: query-content also includes a screen-reader copy.
  const GEMINI_USER_TEXT_SELECTOR = ".query-text-line, .query-text, .query-content";
  const USER_MESSAGE_IMAGE_ATTRIBUTE_FILTER = ["src", "srcset", "data-src", "data-original", "data-url"];
  const USER_MESSAGE_AVATAR_SELECTOR = '[class*="avatar" i], [class*="profile" i], [data-testid*="avatar" i]';
  const GEMINI_USER_ROLE_PREFIX_PATTERN = /^\s*(?:You said|你说|你話|你话)\s*[:：]?\s*/i;
  const GROK_ASSISTANT_MESSAGE_SELECTOR = "[data-testid=\"assistant-message\"] .response-content-markdown.markdown";
  const GROK_USER_MESSAGE_SELECTOR = "[data-testid=\"user-message\"]";
  const DOUBAO_ASSISTANT_MESSAGE_SELECTOR = [
    ".receive-message-box",
    ".receive-message-content-block",
    ".receive-message-content-block-merge",
    '[class*="receive-message-box"]',
    '[class*="receive-message-content-block"]'
  ].join(", ");
  const DOUBAO_LEGACY_USER_MESSAGE_SELECTOR = [
    ".send-message-box",
    ".send-message-content-block",
    '[class*="send-message-box"]',
    '[class*="send-message-content-block"]'
  ].join(", ");
  const DOUBAO_USER_MESSAGE_SELECTOR = [
    ".bg-g-send-msg-bubble-bg",
    DOUBAO_LEGACY_USER_MESSAGE_SELECTOR
  ].join(", ");
  const KIMI_ASSISTANT_MESSAGE_SELECTOR = [
    ".segment.segment-assistant .markdown",
    ".segment-assistant .markdown",
    ".segment-assistant .markdown-container",
    '[class*="segment-assistant"] [class*="markdown"]'
  ].join(", ");
  const KIMI_USER_MESSAGE_SELECTOR = ".segment.segment-user";
  const QIANWEN_ASSISTANT_MESSAGE_SELECTOR = [
    '[class*="message-select-wrapper-answer"] .qk-markdown',
    ".chat-answers-card-wrap .qk-markdown",
    ".answer-common-card .qk-markdown",
    ".markdown-pc-special-class .qk-markdown"
  ].join(", ");
  const QIANWEN_USER_MESSAGE_SELECTOR = [
    '[class*="message-select-wrapper-question"]',
    ".chat-questions-card-wrap",
    ".question-common-card"
  ].join(", ");
  const QIANWEN_VIDEO_LIST_SELECTOR = [
    ".card_card_video",
    '[class*="card_card_video"]',
    '[data-tpl*="video_note_list"]'
  ].join(", ");
  const QIANWEN_VIDEO_TITLE_SELECTOR = '[class*="item-title"]';
  const YUANBAO_ASSISTANT_MESSAGE_SELECTOR = [
    '[data-conv-speaker="ai"] .hyc-common-markdown',
    '[data-conv-speaker="ai"]',
    ".agent-chat__list__item--ai .hyc-common-markdown"
  ].join(", ");
  const YUANBAO_USER_MESSAGE_SELECTOR = [
    '[data-conv-speaker="user"]',
    '[data-conv-speaker="human"]',
    ".agent-chat__list__item--user"
  ].join(", ");
  const XIAOHONGSHU_ASSISTANT_MESSAGE_SELECTOR = ".ai-message .xhs-ai-md-container";
  const XIAOHONGSHU_ASSISTANT_MARKDOWN_SELECTOR = [
    ".markdown-styles-diandian-main-v3",
    ".markdown-styles-diandian-main-v2",
    ".markdown-styles-diandian-main",
    ".markdown-styles-deep-research",
    ".markdown-styles-pc-main",
    ".markdown-styles-xhs-main",
    '[class*="markdown-styles-diandian-main"]',
    '[class*="markdown-styles-deep-research"]',
    '[class*="markdown-styles-pc-main"]',
    '[class*="markdown-styles-xhs-main"]'
  ].join(", ");
  const XIAOHONGSHU_ASSISTANT_FALLBACK_SELECTOR = [
    ".xhs-ai-chat-page .round-item",
    ".xhs-ai-chat-page .scroll-container",
    ".xhs-ai-chat-page .chat-container",
    '[class*="xhs-ai-chat-page"] [class*="round-item"]',
    '[class*="xhs-ai-chat-page"] [class*="scroll-container"]',
    '[class*="xhs-ai-chat-page"] [class*="chat-container"]'
  ].join(", ");
  const XIAOHONGSHU_MESSAGE_ITEM_SELECTOR = [
    ".xhs-ai-chat-page .round-item",
    '[class*="xhs-ai-chat-page"] [class*="round-item"]'
  ].join(", ");
  const XIAOHONGSHU_USER_MESSAGE_ROOT_SELECTOR = [
    ".user-message-wrapper",
    '[class*="user-message-wrapper"]'
  ].join(", ");
  const XIAOHONGSHU_USER_MESSAGE_SELECTOR = [
    ".xhs-ai-chat-page .user-message",
    '[class*="xhs-ai-chat-page"] [class*="user-message"]',
    '[class*="xhs-ai-chat-page"] [class*="user-content"]',
    '[class*="xhs-ai-chat-page"] [class*="message-user"]'
  ].join(", ");
  const YUANBAO_VIDEO_CARD_SELECTOR = [
    ".ybc-chat-videoBoxV2-bigCard",
    ".video-box-v2_ybc-chat-videoBoxV2-bigCard",
    '[class*="ybc-chat-videoBoxV2-bigCard"]',
    '[class*="video-box-v2_ybc-chat-videoBoxV2-bigCard"]'
  ].join(", ");
  const YUANBAO_VIDEO_TITLE_SELECTORS = [
    "h1, h2",
    '[class*="title"], [class*="Title"]',
    '[data-title], [title], [aria-label]'
  ];
  const MARKDOWN_FALLBACK_SELECTOR = [
    "main .markdown",
    '[class*="markdown"]',
    '[class*="md-box"]',
    '[class*="mdbox"]'
  ].join(", ");
  const USER_INPUT_SELECTOR = [
    "textarea",
    "input",
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[role="textbox"]',
    ".ProseMirror"
  ].join(", ");
  const CONTROLS_CLASS = "gpt-paragraph-nav__controls";
  const CONTROL_CAPSULE_CLASS = "gpt-paragraph-nav__control-capsule";
  const CONTROL_TAB_INDICATOR_CLASS = "gpt-paragraph-nav__control-tab-indicator";
  const CONTROL_COMPACT_TOGGLE_CLASS = "gpt-paragraph-nav__control-compact-toggle";
  const SETTINGS_CLASS = "gpt-paragraph-nav__settings";
  const MAKER_PANE_CLASS = "gpt-paragraph-nav__maker-pane";
  const LIST_ID = "gpt-paragraph-nav-list";
  const SETTINGS_PANEL_ID = "gpt-paragraph-nav-settings-panel";
  const ROUTE_CHANGE_EVENT = "polaris-for-web-route-change";
  const FLOATING_ACTIVE_CLASS = "gpt-paragraph-nav__floating-active";
  const IMAGE_PREVIEW_CLASS = "gpt-paragraph-nav__image-preview-overlay";
  const LIQUID_GLASS_SELECTOR = [
    `.${CONTROL_CAPSULE_CLASS}`,
    `.${CONTROL_COMPACT_TOGGLE_CLASS}`,
    ".gpt-paragraph-nav__search-input"
  ].join(", ");
  const QUEUE_MAX_VISIBLE = 30;
  const DEFAULT_TOP_GAP = 8;
  const TABLE_MARKER_SCROLL_GAP = 12;
  const DEFAULT_RIGHT_OFFSET = 14;
  const MARKER_LIST_SCROLL_PERSIST_MS = 1200;
  const DEFAULT_HEADER_HEIGHT = 64;
  const CONFIG_STORAGE_KEY = "gpt-paragraph-nav-config";
  const RATING_DISMISSAL_STORAGE_KEY = "polaris-rating-dismissed-until";
  const SUPPORT_URL = "https://jeffery-ho.github.io/polaris-landing/entry/extension/";
  const X_PROFILE_URL = "https://x.com/JefferyHo_";
  const RATING_DISMISSAL_DURATION_MS = 24 * 60 * 60 * 1000;
  const CONFIG_SCHEMA_VERSION = 9;
  const POINTER_DRAG_THRESHOLD = 4;
  const EXPLOSION_EMPTY_TEXT = t("chapters.empty");
  const EXPLOSION_BLOCK_SELECTOR = CHAPTER_BLOCK_SELECTOR;
  const CONVERSATION_HEADER_SELECTOR = [
    '[data-testid="conversation-header"]',
    '[data-testid="chat-header"]',
    "main header"
  ].join(", ");
  const CONFIG_FIELDS = [
    { key: "maxVisible", label: t("settings.maxVisible"), min: 1, max: 80, step: 1, unit: "" },
    { key: "maxVisibleUserGroups", label: t("settings.maxVisibleUserGroups"), min: 1, max: 80, step: 1, unit: "" },
    { key: "foldThreshold", label: t("settings.foldThreshold"), min: 2, max: 80, step: 1, unit: "" },
    { key: "tooltipMaxWidth", label: t("settings.tooltipMaxWidth"), min: 160, max: 720, step: 10, unit: "px" }
  ];
  const PLATFORM_KEYS = ["chatgpt", "claude", "gemini", "grok", "doubao", "kimi", "qianwen", "yuanbao", "xiaohongshu", "manus", "deepseek", "default"];
  const MARKER_LEVEL_OPTIONS = [1, 2, 3, 4];
  const DEFAULT_ENABLED_LEVELS_BY_PLATFORM = Object.freeze({
    chatgpt: [1, 2, 3],
    claude: [1, 2, 3],
    gemini: [1, 2, 3],
    grok: [1, 2, 3],
    doubao: [1, 2, 3],
    kimi: [1, 2],
    qianwen: [1, 2, 3],
    yuanbao: [1, 2],
    xiaohongshu: [1, 2, 3, 4],
    manus: [1, 2, 3],
    deepseek: [1, 2, 3],
    default: [1, 2, 3]
  });
  const DEFAULT_UNORDERED_LIST_BY_PLATFORM = Object.freeze({
    chatgpt: true,
    claude: true,
    gemini: true,
    grok: true,
    doubao: true,
    kimi: true,
    qianwen: true,
    yuanbao: true,
    xiaohongshu: true,
    manus: true,
    deepseek: true,
    default: true
  });
  const DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM = Object.freeze({
    chatgpt: false,
    claude: false,
    gemini: false,
    grok: false,
    doubao: false,
    kimi: false,
    qianwen: false,
    yuanbao: false,
    xiaohongshu: false,
    manus: false,
    deepseek: false,
    default: false
  });
  const DEFAULT_ENABLED_STRONG_BY_PLATFORM = Object.freeze({
    chatgpt: true,
    claude: true,
    gemini: true,
    grok: true,
    doubao: true,
    kimi: true,
    qianwen: true,
    yuanbao: true,
    xiaohongshu: true,
    manus: true,
    deepseek: true,
    default: true
  });
  const DEFAULT_CONFIG = Object.freeze({
    controlPosition: null,
    isControlMinimized: false,
    chatgptHistoryMode: "default",
    maxVisible: QUEUE_MAX_VISIBLE,
    maxVisibleUserGroups: 20,
    foldThreshold: 20,
    tooltipMaxWidth: 360,
    configVersion: CONFIG_SCHEMA_VERSION,
    enabledLevelsByPlatform: DEFAULT_ENABLED_LEVELS_BY_PLATFORM,
    enabledOrderedListByPlatform: DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM,
    enabledStrongByPlatform: DEFAULT_ENABLED_STRONG_BY_PLATFORM,
    enabledUnorderedListByPlatform: DEFAULT_UNORDERED_LIST_BY_PLATFORM
  });
  const liquidGlassSignatures = new WeakMap();
  const userImagePreviewSources = new WeakMap();
  const standaloneWindowImageCache = new Map();
  const standaloneWindowImagePromises = new Map();
  const settingsPanelControllers = new WeakMap();
  const settingsPanelRenderSignatures = new WeakMap();
  const extensionMetadata = {
    iconUrl: "",
    routeBridgeUrl: "",
    releaseVersion: "",
    version: ""
  };
  const runtimeMarkerKeySequence = createRuntimeMarkerKeySequence();
  const pointerDragLifecycle = createPointerDragLifecycle({ threshold: POINTER_DRAG_THRESHOLD });
  const diagnosticLog = createDiagnosticLog();

  const state = {
    headings: [],
    markerGroups: [],
    conversationMetrics: null,
    activeHeading: null,
    activeMarkerKey: "",
    observer: null,
    scheduled: 0,
    scheduledRenderSuppressesMarkerMotion: false,
    scrollScheduled: 0,
    floatingScheduled: 0,
    markerNoticeTimer: 0,
    pointerDrag: null,
    suppressNextClick: false,
    suppressNextClickTimer: 0,
    liquidGlassObserver: null,
    liquidGlassElements: new Set(),
    lastDebugSignature: "",
    lastRenderedHeadingCount: 0,
    markerSearchQuery: "",
    awaitingRouteDom: false,
    explosionSearchQuery: "",
    collapsedFoldGroups: new Set(),
    collapsedUserMarkerKeys: new Set(),
    latestUserMarkerKey: "",
    areEarlierUserGroupsExpanded: false,
    isCollapsed: false,
    collapsedListHeight: 0,
    ratingDismissedUntil: 0,
    releaseNotes: [],
    releaseNoticePending: false,
    isReleaseNoticeOpen: false,
    releaseNoticeFocusPending: false,
    releaseNoticeReturnControlTab: null,
    shouldMarkReleaseNoticeRead: false,
    config: { ...DEFAULT_CONFIG },
    activeControlTab: "navigation",
    isExplosionOpen: false,
    explosionSections: [],
    activeExplosionSectionIndex: 0,
    lastExplosionRenderSignature: "",
    isImagePreviewOpen: false,
    imagePreviewUrls: [],
    activeImagePreviewIndex: 0,
    imagePreviewReturnElement: null,
    scrollLock: null,
    routeKey: "",
    isExtensionContextInvalidated: false,
    markerSourceContainers: [],
    pageThemeWatcher: null,
    diagnosticStatus: "",
    windowSnapshotTimer: 0
  };
  const markerMotionSuppressor = createMarkerMotionSuppressor({
    setSuppressed: (isSuppressed) => {
      document.getElementById(ROOT_ID)?.classList.toggle(MARKER_MOTION_SUPPRESSION_CLASS, isSuppressed);
    }
  });
  const markerStreamingIndicator = createMarkerStreamingIndicator({
    setActive(marker, isActive) {
      marker.classList.toggle("is-streaming", isActive);
    }
  });
  const markerListReconciler = createMarkerListReconciler({
    createRow: createMarkerRenderRow,
    updateRow: updateMarkerRenderRow
  });
  const markerListActiveTracker = createMarkerListActiveTracker({
    setActive(marker, isActive) {
      marker.classList.toggle("is-active", isActive);
    }
  });
  const markerListScrollPersistence = createMarkerListScrollPersistence({
    durationMs: MARKER_LIST_SCROLL_PERSIST_MS,
    now: () => performance.now(),
    requestFrame: (callback) => lifecycle.requestAnimationFrame(callback),
    cancelFrame: (frameId) => lifecycle.cancelAnimationFrame(frameId),
    keepActiveMarkerVisible() {
      const marker = getActiveMarker();
      if (!(marker instanceof HTMLElement) || state.isCollapsed) {
        return false;
      }
      scrollMarkerIntoListView(marker);
      updateFloatingActiveMarker(marker);
      return true;
    }
  });
  const markerRenderStateMachine = createMarkerRenderStateMachine({
    readSnapshot: collectMarkerRenderSnapshot,
    hasStartPoint: (snapshot) => snapshot.headings.length > 0,
    renderSnapshot: (snapshot) => render(snapshot, { suppressMarkerMotion: true })
  });
  const locateFlash = createLocateFlash({ window, onReport: (outcome) => recordDiagnosticEvent("locate_flash", { outcome }) });
  const flashLocated = (element, resolve) => locateFlash.flash(element, { theme: document.getElementById(ROOT_ID)?.dataset.pageTheme || "light", resolve });
  const conversationCover = createChatGptConversationCover({ window, locale,
    logoUrl: chrome.runtime.getURL("icons/gpt-voyager-icon-96.png"),
    onRetry: () => conversationIndex.retry(),
    onDismiss() { syncConversationCover(); publishWindowSnapshot(); },
    onStateChange() { syncConversationCover(); publishWindowSnapshot(); }
  });
  const conversationIndex = createChatGptIndexController({
    window,
    cache: createConversationCacheClient(chrome.runtime),
    onDiagnostics(timings) { recordDiagnosticEvent("conversation_read", timings); },
    bridgeUrl: chrome.runtime.getURL("src/chatgpt-index-bridge.js"),
    onChange() {
      syncConversationCover();
      chapterContentRevision += 1;
      publishWindowSnapshot();
    }
  });
  const conversationReading = () => conversationCover.isShowing() || conversationCover.isWaiting();
  function syncConversationCover() {
    const theme = document.getElementById(ROOT_ID)?.dataset.pageTheme || "light";
    if (conversationIndex.awaitingConversation()) conversationCover.awaitConversation(theme);
    else conversationCover.update(conversationIndex.snapshot(), theme);
    // Makers appear with the conversation, not before the cover finishes.
    document.getElementById(ROOT_ID)?.toggleAttribute("data-conversation-loading", conversationReading());
  }

  function isExtensionContextValid() {
    try {
      return !state.isExtensionContextInvalidated && typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function cacheExtensionMetadata() {
    try {
      const manifest = chrome.runtime.getManifest();
      extensionMetadata.iconUrl = chrome.runtime.getURL("icons/gpt-voyager-icon-96.png");
      extensionMetadata.routeBridgeUrl = chrome.runtime.getURL("src/route-bridge.js");
      extensionMetadata.releaseVersion = manifest.version;
      extensionMetadata.version = manifest.version_name || `v${manifest.version}`;
      return true;
    } catch {
      disposeInvalidExtensionContext();
      return false;
    }
  }

  function runtimeLastError() {
    try {
      return chrome.runtime.lastError || null;
    } catch {
      disposeInvalidExtensionContext();
      return null;
    }
  }

  function diagnosticBrowserSummary() {
    const userAgent = String(globalThis.navigator?.userAgent || "");
    const browserMatch = [
      [/Edg\/(\d+)/i, "Edge"],
      [/Firefox\/(\d+)/i, "Firefox"],
      [/Chrome\/(\d+)/i, "Chrome"],
      [/Version\/(\d+).*Safari\//i, "Safari"]
    ].map(([pattern, name]) => ({ match: userAgent.match(pattern), name }))
      .find(({ match }) => match);
    const browser = browserMatch ? [browserMatch.name, browserMatch.match[1]] : ["Unknown", ""];
    return browser.filter(Boolean).join(" ");
  }

  function diagnosticOsSummary() {
    const userAgent = String(globalThis.navigator?.userAgent || "");
    const platform = String(globalThis.navigator?.platform || "");
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      return "iOS";
    }
    if (/Android/i.test(userAgent)) {
      return "Android";
    }
    if (/Mac/i.test(platform) || /Mac OS X/i.test(userAgent)) {
      return "macOS";
    }
    if (/Win/i.test(platform) || /Windows/i.test(userAgent)) {
      return "Windows";
    }
    if (/Linux/i.test(platform) || /Linux/i.test(userAgent)) {
      return "Linux";
    }
    return "Unknown";
  }

  function diagnosticContext() {
    return {
      version: extensionMetadata.version || "unknown",
      platform: currentPlatformKey(),
      locale,
      browser: diagnosticBrowserSummary(),
      os: diagnosticOsSummary(),
      viewportWidth: Math.round(window.innerWidth),
      viewportHeight: Math.round(window.innerHeight),
      devicePixelRatio: Number(globalThis.devicePixelRatio || 1)
    };
  }

  function recordDiagnosticEvent(type, details = {}) {
    if (!isTopLevelFrame()) {
      return;
    }
    try {
      diagnosticLog.record(type, {
        platform: currentPlatformKey(),
        ...details
      });
    } catch {
      // Diagnostics must never interrupt navigation or settings actions.
    }
  }

  function diagnosticErrorName(value) {
    if (value && typeof value.name === "string" && value.name.trim()) {
      return value.name.trim().slice(0, 80);
    }
    if (value && value.constructor && typeof value.constructor.name === "string" && value.constructor.name) {
      return value.constructor.name.slice(0, 80);
    }
    return "UnknownError";
  }

  function handleDiagnosticError(event) {
    recordDiagnosticEvent("extension_error", {
      source: "window-error",
      errorName: diagnosticErrorName(event.error)
    });
  }

  function handleDiagnosticUnhandledRejection(event) {
    recordDiagnosticEvent("extension_error", {
      source: "unhandled-rejection",
      errorName: diagnosticErrorName(event.reason)
    });
  }

  function registerDiagnosticErrorListeners() {
    if (!isTopLevelFrame()) {
      return;
    }
    lifecycle.listen(window, "error", handleDiagnosticError);
    lifecycle.listen(window, "unhandledrejection", handleDiagnosticUnhandledRejection);
  }

  function exportDiagnosticLog(operation = "download") {
    const filename = diagnosticFilename();
    recordDiagnosticEvent("diagnostic_export_requested", { operation, filename });
    const downloaded = downloadDiagnosticLog({
      text: diagnosticLog.serialize(diagnosticContext()),
      filename
    });
    recordDiagnosticEvent("diagnostic_export_result", {
      operation,
      filename,
      downloaded
    });
    return { filename, downloaded };
  }

  function handleDownloadDiagnostics() {
    const { downloaded } = exportDiagnosticLog("download");
    state.diagnosticStatus = downloaded
      ? t("settings.diagnostics.downloadSuccess")
      : t("settings.diagnostics.failure");
    render();
    return { ok: downloaded, diagnosticStatus: state.diagnosticStatus };
  }

  function handleSendDiagnostics() {
    const { filename, downloaded } = exportDiagnosticLog("send");
    if (!downloaded) {
      state.diagnosticStatus = t("settings.diagnostics.failure");
      render();
      return { ok: false, diagnosticStatus: state.diagnosticStatus };
    }

    const mailOpened = openDiagnosticEmail({
      email: "jefferyho.build@gmail.com",
      subject: t("settings.diagnostics.emailSubject"),
      body: t("settings.diagnostics.emailBody", { filename })
    });
    recordDiagnosticEvent("diagnostic_email_result", { filename, mailOpened });
    state.diagnosticStatus = mailOpened
      ? t("settings.diagnostics.sendSuccess")
      : t("settings.diagnostics.mailFailure");
    render();
    return { ok: true, diagnosticStatus: state.diagnosticStatus };
  }

  function disposeInvalidExtensionContext() {
    if (state.isExtensionContextInvalidated) {
      return;
    }

    state.isExtensionContextInvalidated = true;
    conversationIndex.dispose();
    conversationCover.dispose();
    locateFlash.cancel();
    lifecycle.dispose();
    delete globalThis[CONTENT_SCRIPT_INSTANCE_KEY];
    lifecycle.clearTimeout(state.scheduled);
    state.scheduledRenderSuppressesMarkerMotion = false;
    markerMotionSuppressor.reset();
    markerStreamingIndicator.reset();
    markerRenderStateMachine.reset();
    markerListReconciler.reset();
    markerListActiveTracker.reset();
    markerListScrollPersistence.reset();
    lifecycle.clearTimeout(state.markerNoticeTimer);
    lifecycle.clearTimeout(state.windowSnapshotTimer);
    state.observer?.disconnect();
    document.removeEventListener("scroll", handleManusConversationScroll, true);
    document.removeEventListener("scroll", handleDeepSeekConversationScroll, true);
    state.pageThemeWatcher?.dispose();
    state.pageThemeWatcher = null;
    state.liquidGlassObserver?.disconnect();
    window.dispatchEvent(new Event("polaris-for-web-route-dispose"));
    document.querySelector("script[data-polaris-route-bridge]")?.remove();
    closeExplosionOverlay();
    closeImagePreviewOverlay();
    state.isReleaseNoticeOpen = false;
    unlockPageScroll();
    cancelPointerDrag("extension-context-invalidated");
    removeNavigationRoot();
  }

  function getRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.setAttribute("aria-label", t("navigation.rootLabel"));
      root.setAttribute("role", "navigation");
      document.documentElement.appendChild(root);
    }
    if (isTopLevelFrame()) {
      root.classList.add("is-window-managed");
    }
    root.toggleAttribute("data-conversation-loading", conversationReading());
    return root;
  }

  function applyPageTheme(root, theme) {
    if (root.dataset.pageTheme !== theme) {
      root.dataset.pageTheme = theme;
    }

    const settings = root.querySelector(`#${SETTINGS_PANEL_ID}`);
    if (settings instanceof HTMLElement && settings.dataset.pageTheme !== theme) {
      settings.dataset.pageTheme = theme;
    }
    syncConversationCover();
  }

  function backgroundColorAlpha(value) {
    const match = String(value || "").match(/^rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (!match) {
      return 0;
    }
    const alpha = match[1] ? Number.parseFloat(match[1]) : 1;
    return match[1]?.endsWith("%") ? alpha / 100 : alpha;
  }

  function firstOpaqueBackgroundColor(elements) {
    for (const element of elements) {
      for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
        const backgroundColor = window.getComputedStyle(node).backgroundColor;
        if (backgroundColorAlpha(backgroundColor) >= 0.8) {
          return backgroundColor;
        }
      }
    }
    return "";
  }

  function updatePageTheme(root) {
    const fallbackTheme = window.matchMedia(PAGE_THEME_MEDIA_QUERY).matches ? "dark" : "light";
    const pageSurfaces = [
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
      document.body,
      document.documentElement
    ].filter((element) => element instanceof HTMLElement);
    const aiContentBackground = firstOpaqueBackgroundColor([
      ...getAssistantContainers(),
      ...pageSurfaces
    ]);
    const theme = pageThemeFromColors(
      pageSurfaces.map((element) => window.getComputedStyle(element).backgroundColor),
      fallbackTheme
    );

    applyPageTheme(root, theme);
    if (aiContentBackground) {
      root.style.setProperty("--gpt-ai-content-bg", aiContentBackground);
    } else {
      root.style.removeProperty("--gpt-ai-content-bg");
    }
    state.pageThemeWatcher?.refresh();
  }

  function getControls(root = getRoot()) {
    let controls = root.querySelector(`.${CONTROLS_CLASS}`);
    if (!controls) {
      controls = document.createElement("div");
      controls.className = CONTROLS_CLASS;
      root.prepend(controls);
    }
    return controls;
  }

  function getMakerPane(root = getRoot()) {
    let pane = root.querySelector(`.${MAKER_PANE_CLASS}`);
    if (!(pane instanceof HTMLElement)) {
      pane = document.createElement("div");
      pane.className = MAKER_PANE_CLASS;
      root.appendChild(pane);
    }
    const list = root.querySelector(`#${LIST_ID}`);
    if (list instanceof HTMLElement && list.parentElement !== pane) {
      pane.appendChild(list);
    }
    const search = root.querySelector(".gpt-paragraph-nav__search");
    if (search instanceof HTMLElement && search.parentElement !== pane) {
      pane.insertBefore(search, list instanceof HTMLElement ? list : null);
    }
    return pane;
  }

  function configureMarkerList(list) {
    if (list.dataset.polarisListConfigured === "true") {
      return;
    }
    list.dataset.polarisListConfigured = "true";
    list.addEventListener("click", handleMarkerListClick);
    list.addEventListener("wheel", createMarkerListNativeWheelHandler({
      list,
      cancelAutoPosition: () => markerListScrollPersistence.cancel()
    }), { passive: true });
    list.addEventListener("scroll", () => {
      scheduleFloatingActiveUpdate();
    }, { passive: true });
  }

  function getList(root = getRoot()) {
    const pane = getMakerPane(root);
    let list = root.querySelector(`#${LIST_ID}`);
    if (!list) {
      list = document.createElement("div");
      list.id = LIST_ID;
      list.className = "gpt-paragraph-nav__list";
      list.setAttribute("role", "tabpanel");
      list.setAttribute("aria-labelledby", "gpt-paragraph-nav-tab-navigation");
      configureMarkerList(list);
      pane.appendChild(list);
    }
    return list;
  }

  function ensureMarkerSearchIcon(wrapper) {
    if (wrapper.querySelector(".gpt-paragraph-nav__search-icon")) {
      return;
    }
    const icon = document.createElement("span");
    icon.className = "gpt-paragraph-nav__search-icon";
    icon.setAttribute("aria-hidden", "true");
    wrapper.prepend(icon);
  }

  function getMarkerSearchInput(root = getRoot()) {
    let input = root.querySelector(".gpt-paragraph-nav__search-input");
    const pane = getMakerPane(root);
    const list = getList(root);
    if (!(input instanceof HTMLInputElement)) {
      if (input) {
        input.remove();
      }

      const wrapper = document.createElement("div");
      wrapper.className = "gpt-paragraph-nav__search";

      input = document.createElement("input");
      input.type = "search";
      input.className = "gpt-paragraph-nav__search-input";
      input.placeholder = t("search.markers.placeholder");
      input.setAttribute("aria-label", t("search.markers.placeholder"));
      input.autocomplete = "off";
      input.inputMode = "text";
      input.spellcheck = false;
      input.dir = "auto";
      input.lang = locale === "zh" ? "zh-CN" : "en";
      input.value = state.markerSearchQuery;
      bindSearchInput(input, {
        onInput: (value) => {
          state.markerSearchQuery = value;
        },
        onCommit: () => {
          if (input.value) {
            state.isCollapsed = false;
          }
          render();
        }
      });
      input.addEventListener("focus", () => {
        if (state.isCollapsed) {
          state.isCollapsed = false;
          render();
        }
      });

      wrapper.appendChild(input);
      ensureMarkerSearchIcon(wrapper);
      pane.insertBefore(wrapper, list);
    } else {
      const wrapper = input.closest(".gpt-paragraph-nav__search");
      if (wrapper instanceof HTMLElement) {
        ensureMarkerSearchIcon(wrapper);
        if (wrapper.parentElement !== pane) {
          pane.insertBefore(wrapper, list);
        }
      }
    }

    if (document.activeElement !== input && input.value !== state.markerSearchQuery) {
      input.value = state.markerSearchQuery;
    }

    return input;
  }

  function getFloatingActive(root = getRoot()) {
    let floating = root.querySelector(`.${FLOATING_ACTIVE_CLASS}`);
    if (!(floating instanceof HTMLButtonElement)) {
      if (floating) {
        floating.remove();
      }
      floating = document.createElement("button");
      floating.type = "button";
      floating.className = FLOATING_ACTIVE_CLASS;
      floating.hidden = true;
      floating.tabIndex = -1;
      floating.setAttribute("aria-hidden", "true");
      floating.addEventListener("click", () => {
        const marker = getActiveMarker();
        const heading = getActiveHeading();
        if (heading) {
          jumpToHeading(heading, "smooth");
        }
        if (marker) {
          requestActiveMarkerListScrollPersistence();
          marker.focus({ preventScroll: true });
          updateFloatingActiveMarker(marker);
        }
      });
      root.appendChild(floating);
    }
    let preview = floating.querySelector(".gpt-paragraph-nav__floating-active-preview");
    if (!(preview instanceof HTMLSpanElement)) {
      preview = document.createElement("span");
      preview.className = "gpt-paragraph-nav__floating-active-preview";
      floating.replaceChildren(preview);
    }
    return floating;
  }

  function toggleNavigation() {
    if (!state.markerGroups.length) {
      return;
    }
    if (!state.isCollapsed) {
      state.collapsedListHeight = getList().offsetHeight;
    }
    state.isCollapsed = !state.isCollapsed;
  }

  function syncControlTabIndicator(root = getRoot()) {
    const capsule = root.querySelector(`.${CONTROL_CAPSULE_CLASS}`);
    if (!(capsule instanceof HTMLElement)) {
      return;
    }

    const indicator = capsule.querySelector(`.${CONTROL_TAB_INDICATOR_CLASS}`);
    const activeTab = capsule.querySelector(".gpt-paragraph-nav__control-tab.is-active");
    if (!(indicator instanceof HTMLElement) || !(activeTab instanceof HTMLElement)) {
      return;
    }

    indicator.style.height = "";
    indicator.style.width = `${activeTab.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
  }

  function syncControlTabs(root = getRoot()) {
    const capsule = root.querySelector(`.${CONTROL_CAPSULE_CLASS}`);
    const isMinimized = state.config.isControlMinimized;
    if (!(capsule instanceof HTMLElement)) {
      return;
    }

    root.classList.toggle("is-settings-open", state.activeControlTab === "settings");
    root.classList.toggle("is-control-minimized", isMinimized);
    root.classList.toggle("has-custom-control-position", Boolean(activeControlPosition()));
    capsule.classList.toggle("is-minimized", isMinimized);
    capsule.setAttribute("role", isMinimized ? "group" : "tablist");
    capsule.setAttribute("aria-orientation", "horizontal");
    capsule.setAttribute("aria-label", isMinimized
      ? `${t("controls.label")}: ${t(`tab.${state.activeControlTab}`)}`
      : t("controls.label"));
    root.querySelectorAll("[data-control-tab]").forEach((tab) => {
      const isActive = tab.dataset.controlTab === state.activeControlTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.hidden = isMinimized && !isActive;
      tab.setAttribute("aria-hidden", String(isMinimized && !isActive));
      tab.tabIndex = isActive ? 0 : -1;
      if (tab.dataset.controlTab === "navigation") {
        tab.setAttribute("aria-expanded", String(!state.isCollapsed));
      }
    });
    const indicator = capsule.querySelector(`.${CONTROL_TAB_INDICATOR_CLASS}`);
    if (indicator instanceof HTMLElement) {
      indicator.hidden = false;
    }
    const toggle = capsule.querySelector(`.${CONTROL_COMPACT_TOGGLE_CLASS}`);
    if (toggle instanceof HTMLButtonElement) {
      toggle.setAttribute("aria-label", t(isMinimized ? "controls.maximize" : "controls.minimize"));
      toggle.replaceChildren(createControlCompactIcon(isMinimized));
    }
    syncControlTabIndicator(root);

    const settings = root.querySelector(`.${SETTINGS_CLASS}`);
    if (settings instanceof HTMLElement) {
      settings.hidden = state.activeControlTab !== "settings";
      settings.setAttribute("aria-labelledby", "gpt-paragraph-nav-tab-settings");
      settings.removeAttribute("aria-label");
    }
  }

  function activateControlTab(tabKey, { toggleNavigationWhenActive = false, openChapters = false } = {}) {
    const isActive = state.activeControlTab === tabKey;
    state.activeControlTab = tabKey;
    if (tabKey === "navigation" && isActive && toggleNavigationWhenActive) {
      toggleNavigation();
      render();
      return;
    }
    if (tabKey === "chapters" && openChapters) {
      openExplosionOverlay();
    }
    const root = document.getElementById(ROOT_ID);
    if (root instanceof HTMLElement) {
      syncControlTabs(root);
    }
  }

  function createControlCompactIcon(isMinimized) {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", isMinimized ? "1.8" : "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", isMinimized
      ? "M8 16L16 8M11 8h5v5M13 16H8v-5"
      : "M5 12H19");
    icon.appendChild(path);
    return icon;
  }

  function createControlTabIcon(key) {
    if (key === "navigation") {
      const icon = document.createElement("img");
      icon.className = "gpt-paragraph-nav__control-tab-icon";
      icon.alt = "";
      icon.width = 16;
      icon.height = 16;
      icon.src = extensionMetadata.iconUrl;
      return icon;
    }

    return null;
  }

  function createImagePreviewZoomIcon() {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", "m14.5 14.5 4 4M10.8 16.3a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Z");
    icon.appendChild(path);
    return icon;
  }

  function setControlMinimized(isMinimized) {
    state.config = normalizeConfig({
      ...state.config,
      controlPosition: isMinimized ? null : state.config.controlPosition,
      isControlMinimized: isMinimized
    });
    saveConfig(state.config);
    render();
  }

  function getControlCapsule(root = getRoot()) {
    const controls = getControls(root);
    let capsule = controls.querySelector(`.${CONTROL_CAPSULE_CLASS}`);
    if (!capsule) {
      capsule = document.createElement("div");
      capsule.className = CONTROL_CAPSULE_CLASS;
      capsule.setAttribute("role", "tablist");
      capsule.setAttribute("aria-label", t("controls.label"));

      const compactToggle = document.createElement("button");
      compactToggle.type = "button";
      compactToggle.className = CONTROL_COMPACT_TOGGLE_CLASS;
      compactToggle.addEventListener("click", () => {
        setControlMinimized(!state.config.isControlMinimized);
      });
      capsule.appendChild(compactToggle);

      const indicator = document.createElement("span");
      indicator.className = CONTROL_TAB_INDICATOR_CLASS;
      indicator.setAttribute("aria-hidden", "true");
      indicator.style.transition = "none";
      capsule.appendChild(indicator);

      [
        { key: "navigation", label: t("tab.navigation"), controls: LIST_ID },
        { key: "chapters", label: t("tab.chapters"), controls: "gpt-paragraph-nav-chapters" },
        { key: "settings", label: t("tab.settings"), controls: SETTINGS_PANEL_ID }
      ].forEach(({ key, label, controls: controlsId }) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "gpt-paragraph-nav__control-tab";
        tab.dataset.controlTab = key;
        tab.id = `gpt-paragraph-nav-tab-${key}`;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", controlsId);
        tab.setAttribute("aria-label", label);
        const icon = createControlTabIcon(key);
        if (icon) {
          tab.appendChild(icon);
        }

        const title = document.createElement("span");
        title.className = "gpt-paragraph-nav__control-tab-label";
        title.textContent = label;
        tab.appendChild(title);

        if (key === "navigation") {
          const chevron = document.createElement("span");
          chevron.className = "gpt-paragraph-nav__control-tab-chevron";
          chevron.setAttribute("aria-hidden", "true");
          tab.appendChild(chevron);
        }
        tab.addEventListener("click", () => {
          activateControlTab(key, {
            toggleNavigationWhenActive: key === "navigation",
            openChapters: key === "chapters"
          });
        });
        capsule.appendChild(tab);
      });

      capsule.addEventListener("keydown", (event) => {
        const tabs = Array.from(capsule.querySelectorAll("[data-control-tab]"));
        const currentIndex = tabs.indexOf(document.activeElement);
        if (currentIndex < 0) {
          return;
        }
        const nextIndex = nextControlTabIndex({
          key: event.key,
          currentIndex,
          tabCount: tabs.length,
          isChapterModalOpen: state.isExplosionOpen
        });
        if (nextIndex === null) {
          return;
        }
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        if (nextTab.dataset.controlTab !== "chapters") {
          activateControlTab(nextTab.dataset.controlTab);
        }
        nextTab.focus();
      });

      controls.appendChild(capsule);
      lifecycle.requestAnimationFrame(() => {
        indicator.style.transition = "";
      });
    }
    syncControlTabs(root);
    return capsule;
  }

  function getSettings(root = getRoot()) {
    const controls = getControls(root);
    let settings = controls.querySelector(`.${SETTINGS_CLASS}`);
    if (!settings) {
      settings = document.createElement("div");
      settings.className = SETTINGS_CLASS;
      settings.id = SETTINGS_PANEL_ID;
      settings.setAttribute("role", "tabpanel");
      settings.setAttribute("aria-labelledby", "gpt-paragraph-nav-tab-settings");
      settings.tabIndex = -1;
      controls.appendChild(settings);
    }

    settings.dataset.pageTheme = root.dataset.pageTheme || "dark";
    syncSettingsInputs(settings);
    settings.hidden = state.activeControlTab !== "settings";
    return settings;
  }

  function getExplosionOverlay(root = getRoot()) {
    let overlay = root.querySelector(".gpt-paragraph-nav__explosion-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "gpt-paragraph-nav-chapters";
      overlay.className = "gpt-paragraph-nav__explosion-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", t("chapters.label"));
      overlay.hidden = true;

      const content = document.createElement("div");
      content.className = "gpt-paragraph-nav__explosion-content";
      content.setAttribute("aria-label", t("chapters.label"));

      const header = document.createElement("div");
      header.className = "gpt-paragraph-nav__explosion-header";

      const searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.className = "gpt-paragraph-nav__explosion-search-input";
      searchInput.placeholder = t("search.chapters.placeholder");
      searchInput.setAttribute("aria-label", t("search.chapters.placeholder"));
      searchInput.autocomplete = "off";
      searchInput.inputMode = "text";
      searchInput.spellcheck = false;
      searchInput.dir = "auto";
      searchInput.lang = locale === "zh" ? "zh-CN" : "en";
      searchInput.value = state.explosionSearchQuery;
      bindSearchInput(searchInput, {
        onInput: (value) => {
          state.explosionSearchQuery = value;
        },
        onCommit: () => {
          syncExplosionOverlay(overlay);
        }
      });
      header.appendChild(searchInput);

      const actions = document.createElement("div");
      actions.className = "gpt-paragraph-nav__explosion-actions";

      const copyMenu = document.createElement("details");
      copyMenu.className = "gpt-paragraph-nav__explosion-copy-menu";

      const copyMenuTrigger = document.createElement("summary");
      copyMenuTrigger.className = "gpt-paragraph-nav__explosion-action gpt-paragraph-nav__explosion-copy-menu-trigger";
      copyMenuTrigger.textContent = t("chapters.copy");
      copyMenu.appendChild(copyMenuTrigger);

      const copyMenuItems = document.createElement("div");
      copyMenuItems.className = "gpt-paragraph-nav__explosion-copy-menu-items";

      const currentSectionButton = document.createElement("button");
      currentSectionButton.type = "button";
      currentSectionButton.className = "gpt-paragraph-nav__explosion-copy-menu-item";
      currentSectionButton.dataset.explosionAction = "copy-current-section";
      currentSectionButton.textContent = t("chapters.copyCurrent");
      currentSectionButton.addEventListener("click", async () => {
        await copyCurrentExplosionSection();
        copyMenu.open = false;
      });
      copyMenuItems.appendChild(currentSectionButton);

      const fullTextButton = document.createElement("button");
      fullTextButton.type = "button";
      fullTextButton.className = "gpt-paragraph-nav__explosion-copy-menu-item";
      fullTextButton.dataset.explosionAction = "copy-full-text";
      fullTextButton.textContent = t("chapters.copyFull");
      fullTextButton.addEventListener("click", async () => {
        await copyFullExplosionText();
        copyMenu.open = false;
      });
      copyMenuItems.appendChild(fullTextButton);
      copyMenu.appendChild(copyMenuItems);
      actions.appendChild(copyMenu);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "gpt-paragraph-nav__explosion-close";
      closeButton.dataset.explosionAction = "close";
      closeButton.setAttribute("aria-label", t("chapters.close"));
      closeButton.setAttribute("title", t("chapters.close"));
      closeButton.addEventListener("click", closeExplosionOverlay);
      actions.appendChild(closeButton);

      header.appendChild(actions);
      content.appendChild(header);
      const chips = document.createElement("div");
      chips.className = "gpt-paragraph-nav__explosion-chips";
      content.appendChild(chips);

      const body = document.createElement("div");
      body.className = "gpt-paragraph-nav__explosion-body";
      content.appendChild(body);

      const shortcutHint = document.createElement("div");
      shortcutHint.className = "gpt-paragraph-nav__explosion-shortcut-hint";
      shortcutHint.textContent = t("chapters.shortcutHint");
      content.appendChild(shortcutHint);
      overlay.appendChild(content);

      root.appendChild(overlay);
    }

    const searchInput = overlay.querySelector(".gpt-paragraph-nav__explosion-search-input");
    if (searchInput instanceof HTMLInputElement && document.activeElement !== searchInput && searchInput.value !== state.explosionSearchQuery) {
      searchInput.value = state.explosionSearchQuery;
    }
    syncExplosionOverlay(overlay);
    return overlay;
  }

  function getImagePreviewOverlay(root = getRoot()) {
    let overlay = root.querySelector(`.${IMAGE_PREVIEW_CLASS}`);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = IMAGE_PREVIEW_CLASS;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", t("userMarker.imagePreview"));
      overlay.hidden = true;
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          closeImagePreviewOverlay();
        }
      });

      const content = document.createElement("div");
      content.className = "gpt-paragraph-nav__image-preview-content";

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "gpt-paragraph-nav__image-preview-close gpt-paragraph-nav__explosion-close";
      closeButton.setAttribute("aria-label", t("userMarker.closeImagePreview"));
      closeButton.setAttribute("title", t("userMarker.closeImagePreview"));
      closeButton.addEventListener("click", closeImagePreviewOverlay);
      content.appendChild(closeButton);

      const viewport = document.createElement("div");
      viewport.className = "gpt-paragraph-nav__image-preview-viewport";

      const previousButton = document.createElement("button");
      previousButton.type = "button";
      previousButton.className = "gpt-paragraph-nav__image-preview-nav is-previous";
      previousButton.setAttribute("aria-label", t("userMarker.previousImage"));
      previousButton.setAttribute("title", t("userMarker.previousImage"));
      previousButton.addEventListener("click", () => stepImagePreview(-1));
      viewport.appendChild(previousButton);

      const image = document.createElement("img");
      image.className = "gpt-paragraph-nav__image-preview-image";
      image.alt = "";
      image.decoding = "async";
      image.addEventListener("load", () => {
        if (image.getAttribute("src") !== state.imagePreviewUrls[state.activeImagePreviewIndex]) {
          return;
        }
        image.hidden = false;
        const failure = overlay.querySelector(".gpt-paragraph-nav__image-preview-failure");
        if (failure instanceof HTMLElement) {
          failure.hidden = true;
        }
      });
      image.addEventListener("error", () => {
        if (image.getAttribute("src") !== state.imagePreviewUrls[state.activeImagePreviewIndex]) {
          return;
        }
        image.hidden = true;
        const failure = overlay.querySelector(".gpt-paragraph-nav__image-preview-failure");
        if (failure instanceof HTMLElement) {
          failure.hidden = false;
        }
      });
      viewport.appendChild(image);

      const nextButton = document.createElement("button");
      nextButton.type = "button";
      nextButton.className = "gpt-paragraph-nav__image-preview-nav is-next";
      nextButton.setAttribute("aria-label", t("userMarker.nextImage"));
      nextButton.setAttribute("title", t("userMarker.nextImage"));
      nextButton.addEventListener("click", () => stepImagePreview(1));
      viewport.appendChild(nextButton);
      content.appendChild(viewport);

      const counter = document.createElement("div");
      counter.className = "gpt-paragraph-nav__image-preview-counter";
      counter.setAttribute("aria-live", "polite");
      content.appendChild(counter);

      const failure = document.createElement("div");
      failure.className = "gpt-paragraph-nav__image-preview-failure";
      failure.hidden = true;
      failure.textContent = t("userMarker.imagePreviewLoadFailure");
      content.appendChild(failure);

      overlay.appendChild(content);
      root.appendChild(overlay);
    }

    syncImagePreviewOverlay(overlay);
    return overlay;
  }

  function imagePreviewUrlsForSources(sources) {
    const values = Array.isArray(sources) ? sources : [];
    return userMessageThumbnailForSources(values, window.location.href).imageUrls;
  }

  function syncImagePreviewOverlay(overlay) {
    const urls = state.imagePreviewUrls;
    const index = Math.min(Math.max(state.activeImagePreviewIndex, 0), Math.max(urls.length - 1, 0));
    state.activeImagePreviewIndex = index;
    const image = overlay.querySelector(".gpt-paragraph-nav__image-preview-image");
    const previousButton = overlay.querySelector(".gpt-paragraph-nav__image-preview-nav.is-previous");
    const nextButton = overlay.querySelector(".gpt-paragraph-nav__image-preview-nav.is-next");
    const counter = overlay.querySelector(".gpt-paragraph-nav__image-preview-counter");
    const failure = overlay.querySelector(".gpt-paragraph-nav__image-preview-failure");
    if (image instanceof HTMLImageElement) {
      const nextSrc = urls[index] || "";
      if (image.getAttribute("src") !== nextSrc) {
        image.hidden = !nextSrc;
        if (failure instanceof HTMLElement) {
          failure.hidden = true;
        }
        if (nextSrc) {
          image.src = nextSrc;
        } else {
          image.removeAttribute("src");
        }
      }
    }
    if (previousButton instanceof HTMLButtonElement) {
      previousButton.hidden = urls.length < 2;
      previousButton.disabled = urls.length < 2;
    }
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.hidden = urls.length < 2;
      nextButton.disabled = urls.length < 2;
    }
    if (counter instanceof HTMLElement) {
      counter.hidden = urls.length < 2;
      counter.textContent = urls.length > 1
        ? t("userMarker.imageCounter", { current: index + 1, count: urls.length })
        : "";
    }
    overlay.hidden = !state.isImagePreviewOpen || urls.length === 0;
  }

  function syncOpenImagePreviewForThumbnail(labelThumbnail) {
    if (!state.isImagePreviewOpen || state.imagePreviewReturnElement !== labelThumbnail) {
      return;
    }
    const urls = imagePreviewUrlsForSources(userImagePreviewSources.get(labelThumbnail) || []);
    if (!urls.length) {
      closeImagePreviewOverlay();
      return;
    }
    const currentUrl = state.imagePreviewUrls[state.activeImagePreviewIndex] || "";
    const currentIndex = urls.indexOf(currentUrl);
    state.imagePreviewUrls = urls;
    state.activeImagePreviewIndex = currentIndex >= 0
      ? currentIndex
      : Math.min(state.activeImagePreviewIndex, urls.length - 1);
    const overlay = document.querySelector(`#${ROOT_ID} .${IMAGE_PREVIEW_CLASS}`);
    if (overlay instanceof HTMLElement) {
      syncImagePreviewOverlay(overlay);
    }
  }

  function openImagePreview(sources, returnElement) {
    if (state.isReleaseNoticeOpen || state.isExplosionOpen) {
      return;
    }
    const urls = imagePreviewUrlsForSources(sources);
    if (!urls.length) {
      return;
    }
    state.imagePreviewUrls = urls;
    state.activeImagePreviewIndex = 0;
    state.imagePreviewReturnElement = returnElement instanceof HTMLElement ? returnElement : null;
    state.isImagePreviewOpen = true;
    lockPageScroll();
    const overlay = getImagePreviewOverlay();
    syncImagePreviewOverlay(overlay);
    const closeButton = overlay.querySelector(".gpt-paragraph-nav__image-preview-close");
    lifecycle.requestAnimationFrame(() => {
      if (state.isImagePreviewOpen && closeButton instanceof HTMLButtonElement) {
        closeButton.focus();
      }
    });
  }

  function stepImagePreview(delta) {
    if (!state.isImagePreviewOpen || state.imagePreviewUrls.length < 2) {
      return;
    }
    const count = state.imagePreviewUrls.length;
    state.activeImagePreviewIndex = (state.activeImagePreviewIndex + delta + count) % count;
    const overlay = document.querySelector(`#${ROOT_ID} .${IMAGE_PREVIEW_CLASS}`);
    if (overlay instanceof HTMLElement) {
      syncImagePreviewOverlay(overlay);
    }
  }

  function closeImagePreviewOverlay() {
    if (!state.isImagePreviewOpen) {
      return;
    }

    state.isImagePreviewOpen = false;
    state.imagePreviewUrls = [];
    state.activeImagePreviewIndex = 0;
    const returnElement = state.imagePreviewReturnElement;
    state.imagePreviewReturnElement = null;
    unlockPageScroll();
    const overlay = document.querySelector(`#${ROOT_ID} .${IMAGE_PREVIEW_CLASS}`);
    if (overlay instanceof HTMLElement) {
      syncImagePreviewOverlay(overlay);
    }
    let focusTarget = returnElement;
    if (!(focusTarget instanceof HTMLElement && focusTarget.isConnected && !focusTarget.hidden)) {
      const marker = returnElement?.closest?.(".gpt-paragraph-nav__marker-shell")?.querySelector("button");
      focusTarget = marker instanceof HTMLElement ? marker : null;
    }
    if (focusTarget instanceof HTMLElement && focusTarget.isConnected && !focusTarget.hidden) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function getReleaseNoticeOverlay(root = getRoot()) {
    let overlay = root.querySelector(".gpt-paragraph-nav__release-notice-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "gpt-paragraph-nav__release-notice-overlay";
      overlay.id = "gpt-paragraph-nav-release-notice";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "gpt-paragraph-nav-release-notice-title");
      overlay.hidden = true;
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          closeReleaseNotice();
        }
      });

      const card = document.createElement("section");
      card.className = "gpt-paragraph-nav__release-notice-card";

      const header = document.createElement("header");
      header.className = "gpt-paragraph-nav__release-notice-header";
      const title = document.createElement("h2");
      title.id = "gpt-paragraph-nav-release-notice-title";
      title.className = "gpt-paragraph-nav__release-notice-title";
      const titleIcon = document.createElement("img");
      titleIcon.className = "gpt-paragraph-nav__release-notice-title-icon";
      titleIcon.alt = "";
      titleIcon.height = 20;
      titleIcon.src = extensionMetadata.iconUrl;
      titleIcon.width = 20;
      const titleText = document.createElement("span");
      titleText.textContent = t("releaseNotice.title");
      title.append(titleIcon, titleText);
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "gpt-paragraph-nav__release-notice-close";
      closeButton.setAttribute("aria-label", t("releaseNotice.close"));
      closeButton.setAttribute("title", t("releaseNotice.close"));
      closeButton.addEventListener("click", closeReleaseNotice);
      header.append(title, closeButton);

      const summary = document.createElement("p");
      summary.className = "gpt-paragraph-nav__release-notice-summary";
      summary.textContent = t("releaseNotice.summary", { version: extensionMetadata.version });

      const notes = document.createElement("div");
      notes.className = "gpt-paragraph-nav__release-notice-notes";

      const feedback = document.createElement("p");
      feedback.className = "gpt-paragraph-nav__release-notice-feedback";
      feedback.textContent = `💬 ${t("releaseNotice.feedback")}`;

      const actions = document.createElement("div");
      actions.className = "gpt-paragraph-nav__release-notice-actions";
      const email = document.createElement("a");
      email.className = "gpt-paragraph-nav__release-notice-action is-icon";
      email.setAttribute("aria-label", t("releaseNotice.emailAction"));
      email.href = "mailto:jefferyho.build@gmail.com";
      email.title = t("releaseNotice.emailAction");
      email.appendChild(createReleaseNoticeMailIcon());
      const support = document.createElement("a");
      support.className = "gpt-paragraph-nav__release-notice-action is-icon is-support";
      support.setAttribute("aria-label", t("support.aria"));
      support.href = SUPPORT_URL;
      support.rel = "noreferrer";
      support.target = "_blank";
      support.title = t("support.aria");
      support.appendChild(createReleaseNoticeIcon("M12 21s-7-4.35-9.5-8.5C.38 8.93 2.71 5 6.5 5c2.08 0 4.04 1.08 5.5 2.72C13.46 6.08 15.42 5 17.5 5c3.79 0 6.12 3.93 4 7.5C19 16.65 12 21 12 21Z"));
      const issue = document.createElement("a");
      issue.className = "gpt-paragraph-nav__release-notice-action is-icon";
      issue.setAttribute("aria-label", t("releaseNotice.issueAction"));
      issue.href = "https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues";
      issue.rel = "noreferrer";
      issue.target = "_blank";
      issue.title = t("releaseNotice.issueAction");
      issue.appendChild(createReleaseNoticeIcon("M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.161-1.11-1.47-1.11-1.47-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.03-2.688-.103-.253-.447-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.748-1.026 2.748-1.026.546 1.379.202 2.398.1 2.65.64.7 1.029 1.595 1.029 2.688 0 3.848-2.339 4.695-4.566 4.944.359.31.678.921.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.481A10.019 10.019 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z"));
      const acknowledge = document.createElement("button");
      acknowledge.type = "button";
      acknowledge.className = "gpt-paragraph-nav__release-notice-action is-primary";
      acknowledge.textContent = t("releaseNotice.acknowledge");
      acknowledge.addEventListener("click", closeReleaseNotice);
      actions.append(support, email, issue, acknowledge);

      card.append(header, summary, notes, feedback, actions);
      overlay.appendChild(card);
      root.appendChild(overlay);
    }

    syncReleaseNoticeOverlay(overlay);
    return overlay;
  }

  function createReleaseNoticeIcon(pathData) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icon.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "currentColor");
    icon.appendChild(path);
    return icon;
  }

  function createReleaseNoticeMailIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("fill", "none");
    icon.setAttribute("focusable", "false");
    icon.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "1.7");
    icon.appendChild(path);
    return icon;
  }

  function syncReleaseNoticeOverlay(overlay) {
    const notes = overlay.querySelector(".gpt-paragraph-nav__release-notice-notes");
    if (notes instanceof HTMLElement) {
      notes.replaceChildren();
      state.releaseNotes.forEach((note) => {
        const localizedNote = note[locale] || note.en;
        const section = document.createElement("section");
        section.className = "gpt-paragraph-nav__release-note";
        const heading = document.createElement("h3");
        heading.textContent = `${note.version} · ${localizedNote.title}`;
        const changes = document.createElement("ul");
        localizedNote.changes.forEach((change) => {
          const item = document.createElement("li");
          item.textContent = change;
          changes.appendChild(item);
        });
        section.append(heading, changes);
        notes.appendChild(section);
      });
    }

    overlay.hidden = !state.isReleaseNoticeOpen;
    if (state.isReleaseNoticeOpen && state.releaseNoticeFocusPending) {
      state.releaseNoticeFocusPending = false;
      const acknowledge = overlay.querySelector(".gpt-paragraph-nav__release-notice-action.is-primary");
      if (acknowledge instanceof HTMLButtonElement) {
        lifecycle.requestAnimationFrame(() => acknowledge.focus());
      }
    }
  }

  function markReleaseNoticeReadIfNeeded() {
    if (!state.shouldMarkReleaseNoticeRead) {
      return;
    }
    state.shouldMarkReleaseNoticeRead = false;
  }

  function showPendingReleaseNotice() {
    if (!state.releaseNoticePending || state.isReleaseNoticeOpen || state.releaseNotes.length === 0) {
      return;
    }

    state.releaseNoticePending = false;
    state.isReleaseNoticeOpen = true;
    state.releaseNoticeFocusPending = true;
    state.shouldMarkReleaseNoticeRead = true;
    lockPageScroll();
  }

  function closeReleaseNoticeForNonConversation() {
    const wasOpen = state.isReleaseNoticeOpen;
    state.isReleaseNoticeOpen = false;
    state.releaseNoticeFocusPending = false;
    state.releaseNoticeReturnControlTab = null;
    if (wasOpen) {
      markReleaseNoticeReadIfNeeded();
    }
    unlockPageScroll();
  }

  function closeReleaseNotice() {
    if (!state.isReleaseNoticeOpen) {
      return;
    }

    state.isReleaseNoticeOpen = false;
    state.releaseNoticeFocusPending = false;
    if (state.releaseNoticeReturnControlTab) {
      state.activeControlTab = state.releaseNoticeReturnControlTab;
      state.releaseNoticeReturnControlTab = null;
    }
    unlockPageScroll();
    markReleaseNoticeReadIfNeeded();
    render();
  }

  function clearNonConversationPageState() {
    closeReleaseNoticeForNonConversation();
    closeExplosionOverlay();
    closeImagePreviewOverlay();
    unlockPageScroll();
    resetRouteState();
    removeNavigationRoot();
  }

  function normalizeNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(Math.max(Math.round(number), min), max);
  }

  function normalizeControlPosition(position) {
    if (!position || typeof position !== "object") {
      return null;
    }

    const top = Number(position.top);
    const right = Number(position.right);
    if (!Number.isFinite(top) || !Number.isFinite(right)) {
      return null;
    }

    return {
      top: Math.max(0, Math.round(top)),
      right: Math.max(0, Math.round(right))
    };
  }

  function maxHeadingLevelForPlatform(platformKey = currentPlatformKey()) {
    if (platformKey === "yuanbao" || platformKey === "kimi") {
      return 2;
    }
    return platformKey === "xiaohongshu" ? 4 : 3;
  }

  function supportedMarkerLevelsForPlatform(platformKey = currentPlatformKey()) {
    const maxLevel = maxHeadingLevelForPlatform(platformKey);
    return MARKER_LEVEL_OPTIONS.filter((level) => level <= maxLevel);
  }

  function defaultEnabledLevelsForPlatform(platformKey) {
    const levels = DEFAULT_ENABLED_LEVELS_BY_PLATFORM[platformKey] || DEFAULT_ENABLED_LEVELS_BY_PLATFORM.default;
    return [...levels];
  }

  function normalizeEnabledLevels(levels, platformKey) {
    const supportedLevels = supportedMarkerLevelsForPlatform(platformKey);
    const supportedSet = new Set(supportedLevels);
    const normalizedLevels = Array.isArray(levels)
      ? Array.from(new Set(levels.map((level) => Number(level))))
        .filter((level) => supportedSet.has(level))
        .sort((first, second) => first - second)
      : [];

    return normalizedLevels.length ? normalizedLevels : defaultEnabledLevelsForPlatform(platformKey);
  }

  function normalizeEnabledLevelsByPlatform(config) {
    const source = config && config.enabledLevelsByPlatform;
    return PLATFORM_KEYS.reduce((result, platformKey) => {
      result[platformKey] = normalizeEnabledLevels(source && source[platformKey], platformKey);
      return result;
    }, {});
  }

  function normalizeUnorderedListByPlatform(config) {
    const source = config && config.enabledUnorderedListByPlatform;
    return PLATFORM_KEYS.reduce((result, platformKey) => {
      result[platformKey] = source && Object.prototype.hasOwnProperty.call(source, platformKey)
        ? Boolean(source[platformKey])
        : DEFAULT_UNORDERED_LIST_BY_PLATFORM[platformKey];
      return result;
    }, {});
  }

  function normalizeEnabledStrongByPlatform(config) {
    const source = config && config.enabledStrongByPlatform;
    return PLATFORM_KEYS.reduce((result, platformKey) => {
      result[platformKey] = source && Object.prototype.hasOwnProperty.call(source, platformKey)
        ? Boolean(source[platformKey])
        : DEFAULT_ENABLED_STRONG_BY_PLATFORM[platformKey];
      return result;
    }, {});
  }

  function normalizeEnabledOrderedListByPlatform(config) {
    const source = config && config.enabledOrderedListByPlatform;
    return PLATFORM_KEYS.reduce((result, platformKey) => {
      result[platformKey] = source && Object.prototype.hasOwnProperty.call(source, platformKey)
        ? Boolean(source[platformKey])
        : DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM[platformKey];
      return result;
    }, {});
  }

  function normalizeConfig(config) {
    const result = CONFIG_FIELDS.reduce((normalizedConfig, field) => {
      normalizedConfig[field.key] = normalizeNumber(
        config && config[field.key],
        DEFAULT_CONFIG[field.key],
        field.min,
        field.max
      );
      return normalizedConfig;
    }, {});
    result.enabledLevelsByPlatform = normalizeEnabledLevelsByPlatform(config);
    result.enabledOrderedListByPlatform = normalizeEnabledOrderedListByPlatform(config);
    result.enabledStrongByPlatform = normalizeEnabledStrongByPlatform(config);
    result.enabledUnorderedListByPlatform = normalizeUnorderedListByPlatform(config);
    result.controlPosition = normalizeControlPosition(config && config.controlPosition);
    result.isControlMinimized = Boolean(config && config.isControlMinimized);
    result.chatgptHistoryMode = config?.chatgptHistoryMode === "complete" ? "complete" : "default";
    if ((Number(config && config.configVersion) || 1) < 2) {
      result.enabledLevelsByPlatform.xiaohongshu = normalizeEnabledLevels(
        [...result.enabledLevelsByPlatform.xiaohongshu, 4],
        "xiaohongshu"
      );
    }
    result.configVersion = CONFIG_SCHEMA_VERSION;
    return result;
  }

  function enabledLevelsByPlatformEqual(first, second) {
    return PLATFORM_KEYS.every((platformKey) => {
      const firstLevels = normalizeEnabledLevels(first && first[platformKey], platformKey);
      const secondLevels = normalizeEnabledLevels(second && second[platformKey], platformKey);
      return firstLevels.length === secondLevels.length
      && firstLevels.every((level, index) => level === secondLevels[index]);
    });
  }

  function enabledUnorderedListByPlatformEqual(first, second) {
    return PLATFORM_KEYS.every((platformKey) => {
      const firstEnabled = first && Object.prototype.hasOwnProperty.call(first, platformKey)
        ? Boolean(first[platformKey])
        : DEFAULT_UNORDERED_LIST_BY_PLATFORM[platformKey];
      const secondEnabled = second && Object.prototype.hasOwnProperty.call(second, platformKey)
        ? Boolean(second[platformKey])
        : DEFAULT_UNORDERED_LIST_BY_PLATFORM[platformKey];
      return firstEnabled === secondEnabled;
    });
  }

  function enabledStrongByPlatformEqual(first, second) {
    return PLATFORM_KEYS.every((platformKey) => {
      const firstEnabled = first && Object.prototype.hasOwnProperty.call(first, platformKey)
        ? Boolean(first[platformKey])
        : DEFAULT_ENABLED_STRONG_BY_PLATFORM[platformKey];
      const secondEnabled = second && Object.prototype.hasOwnProperty.call(second, platformKey)
        ? Boolean(second[platformKey])
        : DEFAULT_ENABLED_STRONG_BY_PLATFORM[platformKey];
      return firstEnabled === secondEnabled;
    });
  }

  function enabledOrderedListByPlatformEqual(first, second) {
    return PLATFORM_KEYS.every((platformKey) => {
      const firstEnabled = first && Object.prototype.hasOwnProperty.call(first, platformKey)
        ? Boolean(first[platformKey])
        : DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM[platformKey];
      const secondEnabled = second && Object.prototype.hasOwnProperty.call(second, platformKey)
        ? Boolean(second[platformKey])
        : DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM[platformKey];
      return firstEnabled === secondEnabled;
    });
  }

  function configsEqual(first, second) {
    return CONFIG_FIELDS.every((field) => first[field.key] === second[field.key])
      && enabledLevelsByPlatformEqual(first.enabledLevelsByPlatform, second.enabledLevelsByPlatform)
      && enabledOrderedListByPlatformEqual(first.enabledOrderedListByPlatform, second.enabledOrderedListByPlatform)
      && enabledStrongByPlatformEqual(first.enabledStrongByPlatform, second.enabledStrongByPlatform)
      && enabledUnorderedListByPlatformEqual(first.enabledUnorderedListByPlatform, second.enabledUnorderedListByPlatform)
      && first.controlPosition?.top === second.controlPosition?.top
      && first.controlPosition?.right === second.controlPosition?.right
      && first.isControlMinimized === second.isControlMinimized
      && first.chatgptHistoryMode === second.chatgptHistoryMode;
  }

  function hasSyncStorage() {
    try {
      return isExtensionContextValid() && Boolean(chrome.storage && chrome.storage.sync);
    } catch {
      return false;
    }
  }

  function hasLocalStorage() {
    try {
      return isExtensionContextValid() && Boolean(chrome.storage && chrome.storage.local);
    } catch {
      return false;
    }
  }

  function readRatingDismissedUntil() {
    if (!hasLocalStorage()) {
      return Promise.resolve(0);
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(RATING_DISMISSAL_STORAGE_KEY, (result) => {
          if (!isExtensionContextValid()) {
            disposeInvalidExtensionContext();
            resolve(0);
            return;
          }
          const error = runtimeLastError();
          if (error) {
            console.warn("[Polaris: AI Chat Navigator] rating dismissal read failed", error);
            resolve(0);
            return;
          }
          const dismissedUntil = Number(result[RATING_DISMISSAL_STORAGE_KEY]);
          resolve(Number.isFinite(dismissedUntil) && dismissedUntil > Date.now() ? dismissedUntil : 0);
        });
      } catch {
        disposeInvalidExtensionContext();
        resolve(0);
      }
    });
  }

  function dismissRating() {
    const dismissedUntil = Date.now() + RATING_DISMISSAL_DURATION_MS;
    state.ratingDismissedUntil = dismissedUntil;
    render();

    if (!hasLocalStorage()) {
      return;
    }

    try {
      chrome.storage.local.set({ [RATING_DISMISSAL_STORAGE_KEY]: dismissedUntil }, () => {
        if (!isExtensionContextValid()) {
          disposeInvalidExtensionContext();
          return;
        }
        const error = runtimeLastError();
        if (error) {
          console.warn("[Polaris: AI Chat Navigator] rating dismissal write failed", error);
        }
      });
    } catch {
      disposeInvalidExtensionContext();
    }
  }

  function isTopLevelFrame() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  }

  function loadLegacyConfig() {
    try {
      const rawConfig = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      return rawConfig ? normalizeConfig(JSON.parse(rawConfig)) : null;
    } catch {
      return null;
    }
  }

  function readSyncConfig() {
    if (!hasSyncStorage()) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(CONFIG_STORAGE_KEY, (result) => {
          if (!isExtensionContextValid()) {
            disposeInvalidExtensionContext();
            resolve(null);
            return;
          }
        const error = runtimeLastError();
        if (error) {
          console.warn("[Polaris: AI Chat Navigator] config sync read failed", error);
          resolve(null);
          return;
        }

        if (Object.prototype.hasOwnProperty.call(result, CONFIG_STORAGE_KEY)) {
          resolve(normalizeConfig(result[CONFIG_STORAGE_KEY]));
          return;
        }

        resolve(null);
        });
      } catch {
        disposeInvalidExtensionContext();
        resolve(null);
      }
    });
  }

  function writeSyncConfig(config) {
    if (!hasSyncStorage()) {
      return Promise.resolve();
    }

    const nextConfig = normalizeConfig(config);
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.set({ [CONFIG_STORAGE_KEY]: nextConfig }, () => {
          if (!isExtensionContextValid()) {
            disposeInvalidExtensionContext();
            resolve();
            return;
          }
        const error = runtimeLastError();
        if (error) {
          console.warn("[Polaris: AI Chat Navigator] config sync write failed", error);
        }
        resolve();
        });
      } catch {
        disposeInvalidExtensionContext();
        resolve();
      }
    });
  }

  async function loadConfig() {
    const syncConfig = await readSyncConfig();
    if (syncConfig) {
      return syncConfig;
    }

    const legacyConfig = loadLegacyConfig();
    if (legacyConfig) {
      await writeSyncConfig(legacyConfig);
      return legacyConfig;
    }

    return { ...DEFAULT_CONFIG };
  }

  function saveConfig(config) {
    writeSyncConfig(config);
  }

  function resetCollapsedFoldGroups() {
    state.collapsedFoldGroups.clear();
  }

  function resetCollapsedGroups() {
    resetCollapsedFoldGroups();
    state.collapsedUserMarkerKeys.clear();
  }

  function watchConfigChanges() {
    if (!hasSyncStorage() || !chrome.storage.onChanged) {
      return;
    }

    lifecycle.listenChrome(chrome.storage.onChanged, (changes, areaName) => {
      if (areaName !== "sync" || !changes[CONFIG_STORAGE_KEY]) {
        return;
      }

      const nextConfig = normalizeConfig(changes[CONFIG_STORAGE_KEY].newValue);
      if (configsEqual(state.config, nextConfig)) {
        return;
      }

      const userGroupLimitChanged = state.config.maxVisibleUserGroups !== nextConfig.maxVisibleUserGroups;
      const foldThresholdChanged = state.config.foldThreshold !== nextConfig.foldThreshold;
      state.config = nextConfig;
      if (userGroupLimitChanged) {
        state.areEarlierUserGroupsExpanded = false;
      }
      if (foldThresholdChanged) {
        resetCollapsedFoldGroups();
      }
      render();
    });
  }

  function settingsPanelRenderSignature(model) {
    return JSON.stringify({
      appName: model.appName,
      contactLabel: model.contactLabel,
      diagnosticDescription: model.diagnosticDescription,
      diagnosticDownloadLabel: model.diagnosticDownloadLabel,
      diagnosticSendLabel: model.diagnosticSendLabel,
      diagnosticStatus: model.diagnosticStatus,
      diagnosticTitle: model.diagnosticTitle,
      emailLabel: model.emailLabel,
      xLabel: model.xLabel,
      xUrl: model.xUrl,
      fields: model.fields.map(({ key, label, min, max, step, unit, value }) => [key, label, min, max, step, unit, value]),
      issueLabel: model.issueLabel,
      markerLevels: model.markerLevels.map(({ key, label, level, isDisabled, isSelected }) => [key, label, level, isDisabled, isSelected]),
      markerTypesLabel: model.markerTypesLabel,
      releaseNotesLabel: model.releaseNotesLabel,
      resetLabel: model.resetLabel,
      settingsTitle: model.settingsTitle,
      showRating: model.showRating,
      supportedPlatformsLabel: model.supportedPlatformsLabel,
      orderedList: model.orderedList,
      strong: model.strong,
      unorderedList: model.unorderedList,
      version: model.version
    });
  }

  function syncSettingsInputs(settings) {
    const model = createSettingsPanelModel();
    const signature = settingsPanelRenderSignature(model);
    let controller = settingsPanelControllers.get(settings);
    if (!controller) {
      controller = mountSettingsPanel(settings);
      settingsPanelControllers.set(settings, controller);
    }
    if (settingsPanelRenderSignatures.get(settings) === signature) {
      return;
    }
    controller.render(model);
    settingsPanelRenderSignatures.set(settings, signature);
  }

  function enabledLevelsForPlatform(platformKey, config = state.config) {
    return normalizeEnabledLevels(
      config && config.enabledLevelsByPlatform && config.enabledLevelsByPlatform[platformKey],
      platformKey
    );
  }

  function enabledLevelsForCurrentPlatform(config = state.config) {
    return enabledLevelsForPlatform(currentPlatformKey(), config);
  }

  function createSettingsPanelModel() {
    const platformKey = currentPlatformKey();
    const supportedLevels = new Set(supportedMarkerLevelsForPlatform(platformKey));
    const enabledLevels = enabledLevelsForPlatform(platformKey);
    const enabledSet = new Set(enabledLevels);
    return {
      appName: t("settings.appName"),
      contactLabel: t("contact.label"),
      diagnosticDescription: t("settings.diagnostics.description"),
      diagnosticDownloadLabel: t("settings.diagnostics.download"),
      diagnosticSendLabel: t("settings.diagnostics.send"),
      diagnosticStatus: state.diagnosticStatus,
      diagnosticTitle: t("settings.diagnostics.title"),
      emailLabel: t("contact.email"),
      emailUrl: "mailto:jefferyho.build@gmail.com",
      fields: CONFIG_FIELDS.map((field) => ({ ...field, value: state.config[field.key] })),
      iconUrl: extensionMetadata.iconUrl,
      issueLabel: t("contact.issue"),
      issueUrl: "https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues",
      xLabel: t("contact.x"),
      xUrl: X_PROFILE_URL,
      markerLevels: MARKER_LEVEL_OPTIONS
        .filter((level) => supportedLevels.has(level))
        .map((level) => ({
          isDisabled: enabledSet.has(level) && enabledLevels.length <= 1,
          isSelected: enabledSet.has(level),
          key: `h${level}`,
          label: `H${level}`,
          level
        })),
      markerTypesLabel: t("settings.markerTypes"),
      onConfigChange(key, value) {
        const previousFoldThreshold = state.config.foldThreshold;
        state.config = normalizeConfig({ ...state.config, [key]: value });
        if (key === "maxVisibleUserGroups") {
          state.areEarlierUserGroupsExpanded = false;
        }
        if (key === "foldThreshold" && previousFoldThreshold !== state.config.foldThreshold) {
          resetCollapsedFoldGroups();
        }
      },
      onConfigCommit(key) {
        recordDiagnosticEvent("setting_change", { settingKey: key });
        saveConfig(state.config);
        render();
      },
      onDismissRating() {
        dismissRating();
      },
      onMarkerLevelChange(level, isEnabled) {
        updateEnabledLevelForCurrentPlatform(level, isEnabled);
        recordDiagnosticEvent("setting_change", { settingKey: `heading-level-${level}` });
        saveConfig(state.config);
        render();
      },
      onOpenReleaseNotes() {
        state.releaseNotes = releaseNotesForUpdate(null, extensionMetadata.releaseVersion, 1);
        state.releaseNoticePending = false;
        state.isReleaseNoticeOpen = state.releaseNotes.length > 0;
        state.releaseNoticeFocusPending = state.isReleaseNoticeOpen;
        state.shouldMarkReleaseNoticeRead = state.isReleaseNoticeOpen;
        if (state.isReleaseNoticeOpen) {
          state.releaseNoticeReturnControlTab = state.activeControlTab;
          lockPageScroll();
          render();
        }
      },
      onReset() {
        state.config = normalizeConfig(DEFAULT_CONFIG);
        state.areEarlierUserGroupsExpanded = false;
        resetCollapsedGroups();
        recordDiagnosticEvent("setting_change", { settingKey: "reset" });
        saveConfig(state.config);
        render();
      },
      onOrderedListChange(isEnabled) {
        updateEnabledOrderedListForCurrentPlatform(isEnabled);
        recordDiagnosticEvent("setting_change", { settingKey: "ordered-list" });
        saveConfig(state.config);
        render();
      },
      onStrongChange(isEnabled) {
        updateEnabledStrongForCurrentPlatform(isEnabled);
        recordDiagnosticEvent("setting_change", { settingKey: "strong-text" });
        saveConfig(state.config);
        render();
      },
      onUnorderedListChange(isEnabled) {
        updateEnabledUnorderedListForCurrentPlatform(isEnabled);
        recordDiagnosticEvent("setting_change", { settingKey: "unordered-list" });
        saveConfig(state.config);
        render();
      },
      onDownloadDiagnostics: handleDownloadDiagnostics,
      onSendDiagnostics: handleSendDiagnostics,
      resetLabel: t("settings.reset"),
      ratingAction: t("settings.ratingAction"),
      ratingAriaLabel: t("settings.ratingAria"),
      ratingDismissLabel: t("settings.ratingDismiss"),
      ratingPrompt: t("settings.ratingPrompt"),
      ratingUrl: "https://chromewebstore.google.com/detail/polaris-ai-chat-navigator/lkdbbnpcfkjdfnopecpbdaeegncdmajb",
      releaseNotesLabel: t("settings.releaseNotes"),
      settingsTitle: t("settings.title"),
      showRating: state.ratingDismissedUntil <= Date.now(),
      supportLabel: t("support.aria"),
      supportUrl: SUPPORT_URL,
      supportedPlatformsLabel: t("settings.supportedPlatforms"),
      orderedList: {
        isSelected: enabledOrderedListForPlatform(platformKey),
        label: t("settings.orderedList")
      },
      strong: {
        isSelected: enabledStrongForPlatform(platformKey),
        label: t("settings.strong")
      },
      unorderedList: {
        isSelected: enabledUnorderedListForPlatform(platformKey),
        label: t("settings.unorderedList")
      },
      version: extensionMetadata.version
    };
  }

  function updateEnabledLevelForCurrentPlatform(level, isEnabled) {
    const platformKey = currentPlatformKey();
    const supportedLevels = new Set(supportedMarkerLevelsForPlatform(platformKey));
    if (!supportedLevels.has(level)) {
      return;
    }

    const currentLevels = enabledLevelsForPlatform(platformKey);
    const nextLevels = isEnabled
      ? Array.from(new Set([...currentLevels, level]))
      : currentLevels.filter((currentLevel) => currentLevel !== level);
    if (!nextLevels.length) {
      return;
    }

    state.config = normalizeConfig({
      ...state.config,
      enabledLevelsByPlatform: {
        ...state.config.enabledLevelsByPlatform,
        [platformKey]: nextLevels
      }
    });
  }

  function enabledUnorderedListForPlatform(platformKey, config = state.config) {
    const source = config && config.enabledUnorderedListByPlatform;
    return source && Object.prototype.hasOwnProperty.call(source, platformKey)
      ? Boolean(source[platformKey])
      : DEFAULT_UNORDERED_LIST_BY_PLATFORM[platformKey];
  }

  function enabledStrongForPlatform(platformKey, config = state.config) {
    const source = config && config.enabledStrongByPlatform;
    return source && Object.prototype.hasOwnProperty.call(source, platformKey)
      ? Boolean(source[platformKey])
      : DEFAULT_ENABLED_STRONG_BY_PLATFORM[platformKey];
  }

  function enabledOrderedListForPlatform(platformKey, config = state.config) {
    const source = config && config.enabledOrderedListByPlatform;
    return source && Object.prototype.hasOwnProperty.call(source, platformKey)
      ? Boolean(source[platformKey])
      : DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM[platformKey];
  }

  function updateEnabledOrderedListForCurrentPlatform(isEnabled) {
    const platformKey = currentPlatformKey();
    state.config = normalizeConfig({
      ...state.config,
      enabledOrderedListByPlatform: {
        ...state.config.enabledOrderedListByPlatform,
        [platformKey]: Boolean(isEnabled)
      }
    });
  }

  function updateEnabledStrongForCurrentPlatform(isEnabled) {
    const platformKey = currentPlatformKey();
    state.config = normalizeConfig({
      ...state.config,
      enabledStrongByPlatform: {
        ...state.config.enabledStrongByPlatform,
        [platformKey]: Boolean(isEnabled)
      }
    });
  }

  function updateEnabledUnorderedListForCurrentPlatform(isEnabled) {
    const platformKey = currentPlatformKey();
    state.config = normalizeConfig({
      ...state.config,
      enabledUnorderedListByPlatform: {
        ...state.config.enabledUnorderedListByPlatform,
        [platformKey]: Boolean(isEnabled)
      }
    });
  }

  function activeControlPosition() {
    return state.pointerDrag?.kind === "controls"
      ? state.pointerDrag.controlPosition
      : state.config.controlPosition;
  }

  function clampedControlPosition(position, controls) {
    const rect = controls.getBoundingClientRect();
    const maxTop = Math.max(0, window.innerHeight - rect.height - 16);
    const maxRight = Math.max(0, window.innerWidth - rect.width - 8);
    return {
      top: Math.max(0, Math.min(position.top, maxTop)),
      right: Math.max(0, Math.min(position.right, maxRight))
    };
  }

  function applyConfig(root, controlPosition = activeControlPosition()) {
    const controls = root.querySelector(`.${CONTROLS_CLASS}`);
    const position = controlPosition && controls instanceof HTMLElement
      ? clampedControlPosition(controlPosition, controls)
      : null;
    root.style.setProperty("--gpt-nav-top", position
      ? `${position.top}px`
      : `calc(var(--gpt-conversation-header-height, ${DEFAULT_HEADER_HEIGHT}px) + ${DEFAULT_TOP_GAP}px)`);
    root.style.setProperty("--gpt-nav-right", position ? `${position.right}px` : `${DEFAULT_RIGHT_OFFSET}px`);
    root.style.setProperty("--gpt-nav-width", position
      ? `calc(100vw - ${position.right}px)`
      : `calc(100vw - ${DEFAULT_RIGHT_OFFSET * 2}px)`);
    root.style.setProperty("--gpt-nav-tooltip-max-width", `${state.config.tooltipMaxWidth}px`);
  }

  function isVisible(element, scanContext = null) {
    if (scanContext) {
      return scanContext.isVisible(element);
    }
    const style = window.getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") {
      return false;
    }
    if (style.display === "contents") {
      return Array.from(element.children || []).some((child) => child instanceof Element && isVisible(child));
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function elementFromNode(node) {
    if (node instanceof HTMLElement) {
      return node;
    }
    return node && node.parentElement instanceof HTMLElement ? node.parentElement : null;
  }

  function isExplosionOpen() {
    return state.isExplosionOpen;
  }

  function isEditableElement(element) {
    return element instanceof HTMLElement && Boolean(element.closest(USER_INPUT_SELECTOR));
  }

  function isShortcutTargetEditable() {
    const activeElement = document.activeElement;
    return isEditableElement(activeElement);
  }

  function normalizeExplosionText(text) {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isDecorativeExplosionText(text) {
    return !text || /^[\-–—_*#>|=\s]+$/.test(text);
  }

  function isExplosionBlockElement(element, container) {
    if (!(element instanceof HTMLElement) || !isVisible(element) || !container.contains(element)) {
      return false;
    }

    if (isInsideNavigationRoot(element) || isUserInputContext(element)) {
      return false;
    }

    if (element.matches("li li")) {
      return false;
    }

    const nestedBlock = element.parentElement && element.parentElement.closest(EXPLOSION_BLOCK_SELECTOR);
    return !(nestedBlock instanceof HTMLElement && container.contains(nestedBlock));
  }

  function tableTextFromElement(table) {
    const rows = Array.from(table.querySelectorAll("tr"))
      .map((row) => Array.from(row.children)
        .filter((cell) => cell instanceof HTMLTableCellElement)
        .map((cell) => normalizeExplosionText(cell.innerText || cell.textContent || "").replace(/\|/g, "\\|"))
        .filter(Boolean));

    if (!rows.length) {
      return normalizeExplosionText(table.innerText || table.textContent || "");
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    return [
      `| ${rows[0].join(" | ")} |`,
      `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
      ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`)
    ].join("\n");
  }

  function explosionBlockFromElement(element) {
    const tagName = element.tagName.toLowerCase();
    const text = tagName === "table"
      ? tableTextFromElement(element)
      : normalizeExplosionText(element.innerText || element.textContent || "");
    const hasImage = tagName === "img" || Boolean(element.querySelector("img"));
    return { element, tagName, text, hasImage };
  }

  function collectExplosionBlocksFromContainer(container) {
    const blocks = [];
    container.querySelectorAll(EXPLOSION_BLOCK_SELECTOR).forEach((block) => {
      if (!(block instanceof HTMLElement) || !isExplosionBlockElement(block, container)) {
        return;
      }

      const explosionBlock = explosionBlockFromElement(block);
      if ((!explosionBlock.text && !explosionBlock.hasImage) || (explosionBlock.text && isDecorativeExplosionText(explosionBlock.text))) {
        return;
      }

      blocks.push(explosionBlock);
    });

    if (blocks.length) {
      return blocks;
    }

    return normalizeExplosionText(container.innerText || container.textContent || "")
      .split(/\n{2,}/)
      .map((segment) => normalizeExplosionText(segment))
      .filter((segment) => segment && !isDecorativeExplosionText(segment))
      .map((text) => ({ element: null, tagName: "p", text }));
  }

  function collectExplosionBlocks(containers = getAssistantContainers()) {
    return containers
      .filter((container) => container instanceof HTMLElement && !isInsideNavigationRoot(container))
      .flatMap((container) => collectExplosionBlocksFromContainer(container));
  }

  function collectExplosionParagraphsFromContainer(container) {
    return collectExplosionBlocksFromContainer(container).map((block) => block.text);
  }

  function collectExplosionParagraphs(containers = getAssistantContainers()) {
    return containers
      .filter((container) => container instanceof HTMLElement && !isInsideNavigationRoot(container))
      .flatMap((container) => collectExplosionParagraphsFromContainer(container));
  }

  function containerForHeading(headings, containers) {
    const headingToContainer = new Map();
    containers.forEach((container) => {
      headings.forEach((heading) => {
        if (container.contains(heading.element)) {
          headingToContainer.set(heading.element, container);
        }
      });
    });
    return headingToContainer;
  }

  function nextHeadingItemInContainer(headings, currentHeading, headingToContainer) {
    const container = headingToContainer.get(currentHeading.element);
    if (!container) {
      return null;
    }

    const currentIndex = headings.findIndex((heading) => heading.element === currentHeading.element);
    if (currentIndex < 0) {
      return null;
    }

    for (let index = currentIndex + 1; index < headings.length; index += 1) {
      const nextHeading = headings[index];
      if (headingToContainer.get(nextHeading.element) === container) {
        return nextHeading;
      }
    }

    return null;
  }

  function nodesBetweenHeadingBounds(container, startHeading, endHeading) {
    const blocks = Array.from(container.querySelectorAll(EXPLOSION_BLOCK_SELECTOR))
      .filter((block) => block instanceof HTMLElement && isExplosionBlockElement(block, container));

    return blocks.filter((block) => {
      if (!(block instanceof HTMLElement)) {
        return false;
      }
      const startsAtOrAfterHeading = startHeading === block || Boolean(startHeading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING);
      const beforeNextHeading = !endHeading || Boolean(block.compareDocumentPosition(endHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
      return startsAtOrAfterHeading && beforeNextHeading;
    });
  }

  function sectionBlocksFromHeading(container, heading, nextHeading) {
    const blocks = nodesBetweenHeadingBounds(container, heading, nextHeading);
    const sectionBlocks = blocks
      .map((block) => explosionBlockFromElement(block))
      .filter((block) => (block.text || block.hasImage) && (!block.text || !isDecorativeExplosionText(block.text)));

    const headingText = normalizeExplosionText(heading.innerText || heading.textContent || "");
    return sectionBlocks.filter((block, index) => !(index === 0 && block.text === headingText));
  }

  function fallbackExplosionSection(blocks = collectExplosionBlocks()) {
    return {
      id: "explosion-fallback-section",
      title: t("chapters.fullText"),
      markerKey: "",
      startElement: null,
      endElement: null,
      blocks,
      paragraphs: blocks.map((block) => block.text)
    };
  }

  function collectExplosionSections(headings = state.headings, containers = getAssistantContainers()) {
    const boundHeadings = headings
      .map((heading) => {
        const element = currentElementForHeading(heading);
        return element ? { ...heading, element } : null;
      })
      .filter(Boolean);
    if (!boundHeadings.length) {
      return [fallbackExplosionSection()];
    }

    const headingToContainer = containerForHeading(boundHeadings, containers);

    return boundHeadings.map((heading) => {
      const container = headingToContainer.get(heading.element);
      const nextHeading = nextHeadingItemInContainer(boundHeadings, heading, headingToContainer);
      const blocks = container ? sectionBlocksFromHeading(container, heading.element, nextHeading?.element || null) : [];
      return {
        id: heading.id,
        title: heading.title,
        markerKey: markerKeyForHeading(heading),
        startElement: heading.element,
        endElement: nextHeading?.element || null,
        blocks,
        paragraphs: blocks.map((block) => block.text)
      };
    });
  }

  function closestWindowChapterSourceElement(container, headingElement) {
    if (!(container instanceof HTMLElement) || !(headingElement instanceof HTMLElement)) {
      return null;
    }
    const listItem = headingElement.closest("li");
    if (listItem instanceof HTMLElement && container.contains(listItem)) {
      return listItem;
    }
    let source = headingElement.matches(EXPLOSION_BLOCK_SELECTOR)
      ? headingElement
      : headingElement.closest(EXPLOSION_BLOCK_SELECTOR);
    if (!(source instanceof HTMLElement) || !container.contains(source)) {
      return headingElement;
    }
    while (source.parentElement instanceof HTMLElement
      && source.parentElement !== container
      && source.parentElement.matches(EXPLOSION_BLOCK_SELECTOR)
      && container.contains(source.parentElement)) {
      source = source.parentElement;
    }
    return source;
  }

  function windowChapterBlocksFromRange(container, heading, nextHeading) {
    const sourceElement = closestWindowChapterSourceElement(container, heading.element);
    const sourceListItem = sourceElement?.closest?.("li");
    if (sourceListItem instanceof HTMLElement && container.contains(sourceListItem)) {
      const block = explosionBlockFromElement(sourceListItem);
      const normalizedTitle = normalizeExplosionText(heading.title || "");
      return (block.text || block.hasImage)
        && block.text !== normalizedTitle
        && (!block.text || !isDecorativeExplosionText(block.text))
        ? [{ ...block, tagName: "p" }]
        : [];
    }

    const blocks = collectExplosionBlocksFromContainer(container);
    const startIndex = blocks.findIndex((block) => block.element === sourceElement
      || block.element?.contains?.(heading.element));
    if (startIndex < 0) {
      const fallback = sourceElement instanceof HTMLElement ? explosionBlockFromElement(sourceElement) : null;
      return fallback && fallback.text && fallback.text !== heading.title ? [fallback] : [];
    }
    const nextSource = nextHeading
      ? closestWindowChapterSourceElement(container, nextHeading.element)
      : null;
    const nextIndex = nextSource
      ? blocks.findIndex((block, index) => index > startIndex
        && (block.element === nextSource || block.element?.contains?.(nextHeading.element)))
      : -1;
    const range = blocks.slice(startIndex, nextIndex > startIndex ? nextIndex : blocks.length);
    const headingText = normalizeExplosionText(heading.element.innerText || heading.element.textContent || "");
    return range.filter((block, index) => !(index === 0 && block.text === headingText));
  }

  function collectWindowChapterSections(treeResult = null) {
    const snapshot = collectMarkerRenderSnapshot();
    const boundHeadings = snapshot.headings
      .map((heading) => {
        const element = currentElementForHeading(heading);
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        const containerIndex = snapshot.assistantContainers.findIndex((container) => container.contains(element));
        return containerIndex >= 0
          ? {
              ...heading,
              element,
              isListItem: Boolean(element.closest("li")),
              containerKey: `assistant-${containerIndex}`,
              markerKey: markerKeyForHeading({ ...heading, element })
            }
          : null;
      })
      .filter(Boolean);
    if (treeResult) treeResult.push(...collectSidepanelChapters(snapshot.assistantContainers, buildWindowChapterOutline(boundHeadings), {
      baseUrl: location.href,
      fullTextTitle: t("chapters.fullText"),
      userMessages: isChatGPTPage() || isDoubaoPage() || isDeepSeekPage() || isQianwenPage() || isGeminiPage() || isGrokPage() || isXiaohongshuPage()
        ? snapshot.markerGroups.flatMap((group) => group.user ? [group.user] : []) : [],
      assistantToUser: snapshot.assistantToUser
    }));
    if (!boundHeadings.length) {
      return snapshot.assistantContainers.length
        ? [fallbackExplosionSection(collectExplosionBlocks(snapshot.assistantContainers))]
        : [];
    }

    const outline = buildWindowChapterOutline(boundHeadings);
    return outline.map((heading) => {
      const containerIndex = Number(heading.containerKey.replace("assistant-", ""));
      const container = snapshot.assistantContainers[containerIndex];
      const nextHeading = heading.endIndex < outline.length
        && outline[heading.endIndex].containerKey === heading.containerKey
        ? outline[heading.endIndex]
        : null;
      const blocks = container
        ? windowChapterBlocksFromRange(container, heading, nextHeading)
        : [];
      return {
        id: heading.id,
        title: heading.title,
        markerKey: heading.markerKey,
        depth: heading.depth,
        parentKey: heading.parentKey,
        startElement: heading.element,
        endElement: nextHeading?.element || null,
        blocks,
        paragraphs: blocks.map((block) => block.text)
      };
    });
  }

  function activeExplosionSectionIndexFromState(sections = state.explosionSections) {
    if (!sections.length) {
      return 0;
    }

    if (!state.isExplosionOpen && state.activeMarkerKey) {
      const sectionIndex = sections.findIndex((section) => section.markerKey === state.activeMarkerKey);
      if (sectionIndex >= 0) {
        return sectionIndex;
      }
    }

    return Math.min(Math.max(state.activeExplosionSectionIndex, 0), sections.length - 1);
  }

  function appendExplosionContent(target, source) {
    appendSanitizedChapterContent(target, source, document, location.href);
  }

  function appendExplosionTable(container, table) {
    const wrapper = document.createElement("div");
    wrapper.className = "gpt-paragraph-nav__explosion-table-wrap";
    wrapper.appendChild(table);
    container.appendChild(wrapper);
    return true;
  }

  function renderExplosionTable(container, source) {
    if (!source.querySelector("tr")) {
      return false;
    }

    const table = document.createElement("table");
    table.className = "gpt-paragraph-nav__explosion-table";
    appendExplosionContent(table, source);
    return appendExplosionTable(container, table);
  }

  function renderParsedMarkdownExplosionTable(container, markdownTable) {
    const table = document.createElement("table");
    table.className = "gpt-paragraph-nav__explosion-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    markdownTable.headers.forEach((header) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      appendParsedMarkdownInline(cell, header, document, location.href);
      headerRow.appendChild(cell);
    });
    head.appendChild(headerRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    markdownTable.rows.forEach((row) => {
      const tableRow = document.createElement("tr");
      row.forEach((value) => {
        const cell = document.createElement("td");
        appendParsedMarkdownInline(cell, value, document, location.href);
        tableRow.appendChild(cell);
      });
      body.appendChild(tableRow);
    });
    table.appendChild(body);
    return appendExplosionTable(container, table);
  }

  function appendParsedMarkdownList(target, list) {
    const element = document.createElement(list.ordered ? "ol" : "ul");
    element.className = "gpt-paragraph-nav__explosion-list";
    list.items.forEach((item) => {
      const listItem = document.createElement("li");
      if (typeof item.checked === "boolean") {
        listItem.className = "gpt-paragraph-nav__explosion-task-item";
        const checkbox = document.createElement("input");
        checkbox.className = "gpt-paragraph-nav__explosion-task-checkbox";
        checkbox.type = "checkbox";
        checkbox.checked = item.checked;
        checkbox.disabled = true;
        checkbox.setAttribute("aria-hidden", "true");
        listItem.appendChild(checkbox);
      }
      appendParsedMarkdownInline(listItem, item.inline, document, location.href);
      item.children.forEach((child) => appendParsedMarkdownList(listItem, child));
      element.appendChild(listItem);
    });
    target.appendChild(element);
  }

  function renderParsedMarkdownBlocks(container, blocks, sectionRole, paragraphIndex) {
    blocks.forEach((block) => {
      if (block.type === "table") {
        renderParsedMarkdownExplosionTable(container, block);
        return;
      }
      if (block.type === "list") {
        appendParsedMarkdownList(container, block);
        return;
      }
      if (block.type === "codeBlock") {
        const pre = document.createElement("pre");
        pre.className = "gpt-paragraph-nav__explosion-code";
        const code = document.createElement("code");
        code.textContent = block.value;
        pre.appendChild(code);
        container.appendChild(pre);
        return;
      }
      if (block.type === "rule") {
        const rule = document.createElement("hr");
        rule.className = "gpt-paragraph-nav__explosion-rule";
        container.appendChild(rule);
        return;
      }
      const isHeading = block.type === "heading";
      const element = document.createElement(isHeading ? `h${block.level}` : block.type === "quote" ? "blockquote" : "p");
      element.className = isHeading
        ? "gpt-paragraph-nav__explosion-heading"
        : block.type === "quote" ? "gpt-paragraph-nav__explosion-quote" : "gpt-paragraph-nav__explosion-paragraph";
      element.dataset.explosionParagraphIndex = String(paragraphIndex);
      element.dataset.explosionSectionRole = sectionRole;
      if (block.type === "quote") {
        renderParsedMarkdownBlocks(element, block.blocks, sectionRole, paragraphIndex);
      } else {
        appendParsedMarkdownInline(element, block.children, document, location.href);
      }
      container.appendChild(element);
    });
  }

  function parsedMarkdownBlocksForExplosionBlock(block) {
    if (block.tagName !== "p") {
      return null;
    }
    if (block.element instanceof HTMLElement && Array.from(block.element.children).some((child) => child.tagName !== "BR")) {
      return null;
    }
    return parseChapterMarkdown(block.text);
  }

  function renderExplosionSectionBlocks(container, blocks, sectionRole, section = null) {
    if (!blocks.length) {
      const empty = document.createElement("p");
      empty.className = "gpt-paragraph-nav__explosion-empty";
      empty.textContent = EXPLOSION_EMPTY_TEXT;
      container.appendChild(empty);
      if (section?.startElement instanceof HTMLElement && section.startElement.isConnected) {
        const jumpButton = document.createElement("button");
        jumpButton.type = "button";
        jumpButton.className = "gpt-paragraph-nav__explosion-action gpt-paragraph-nav__explosion-jump-source";
        jumpButton.textContent = t("chapters.jumpToSource");
        jumpButton.setAttribute("aria-label", t("chapters.jumpToSourceAria", { title: section.title }));
        jumpButton.addEventListener("click", () => jumpToExplosionSectionSource(section));
        container.appendChild(jumpButton);
      }
      return;
    }

    blocks.forEach((block, index) => {
      const markdownBlocks = parsedMarkdownBlocksForExplosionBlock(block);
      if (markdownBlocks) {
        renderParsedMarkdownBlocks(container, markdownBlocks, sectionRole, index);
        return;
      }

      if (block.tagName === "table" && block.element instanceof HTMLTableElement && renderExplosionTable(container, block.element)) {
        return;
      }

      if (block.tagName === "pre") {
        const pre = document.createElement("pre");
        pre.className = "gpt-paragraph-nav__explosion-code";
        const code = document.createElement("code");
        code.textContent = block.text;
        pre.appendChild(code);
        container.appendChild(pre);
        return;
      }

      if (block.tagName === "ul" || block.tagName === "ol") {
        const list = document.createElement(block.tagName);
        list.className = "gpt-paragraph-nav__explosion-list";
        if (block.element) {
          appendExplosionContent(list, block.element);
        }
        if (list.childElementCount) {
          container.appendChild(list);
          return;
        }
      }

      if (block.tagName === "img") {
        const figure = document.createElement("figure");
        figure.className = "gpt-paragraph-nav__explosion-figure";
        appendSanitizedChapterNode(figure, block.element, document, location.href);
        if (figure.childElementCount) {
          container.appendChild(figure);
        }
        return;
      }

      const isHeading = /^h[1-6]$/.test(block.tagName);
      const element = document.createElement(isHeading || block.tagName === "blockquote" || block.tagName === "figure" ? block.tagName : "p");
      element.className = isHeading
        ? "gpt-paragraph-nav__explosion-heading"
        : `gpt-paragraph-nav__explosion-${block.tagName === "blockquote" ? "quote" : block.tagName === "figure" ? "figure" : "paragraph"}`;
      element.dataset.explosionParagraphIndex = String(index);
      element.dataset.explosionSectionRole = sectionRole;
      if (block.element) {
        appendExplosionContent(element, block.element);
      } else {
        element.textContent = block.text;
      }
      container.appendChild(element);
    });
  }

  function renderExplosionSections(body, sections = state.explosionSections) {
    body.textContent = "";

    if (!sections.length) {
      const empty = document.createElement("p");
      empty.className = "gpt-paragraph-nav__explosion-empty";
      empty.textContent = EXPLOSION_EMPTY_TEXT;
      body.appendChild(empty);
      return;
    }

    const activeIndex = activeExplosionSectionIndexFromState(sections);
    const section = sections[activeIndex];
    const sectionNode = document.createElement("section");
    sectionNode.className = "gpt-paragraph-nav__explosion-section is-current";
    sectionNode.dataset.explosionSectionIndex = String(activeIndex);

    const title = document.createElement("div");
    title.className = "gpt-paragraph-nav__explosion-section-title";
    title.textContent = section.title;
    sectionNode.appendChild(title);

    renderExplosionSectionBlocks(sectionNode, section.blocks || [], "current", section);
    body.appendChild(sectionNode);
  }

  function renderExplosionChips(container, sections = state.explosionSections) {
    container.textContent = "";
    if (!sections.length || (sections.length === 1 && sections[0].markerKey === "")) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    const activeIndex = activeExplosionSectionIndexFromState(sections);
    filteredExplosionSections(sections).forEach(({ section, index }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "gpt-paragraph-nav__explosion-chip";
      chip.textContent = section.title;
      chip.classList.toggle("is-active", index === activeIndex);
      chip.addEventListener("click", () => {
        activateExplosionSection(index);
      });
      container.appendChild(chip);
    });
  }

  function activateExplosionSection(index) {
    const sections = state.explosionSections;
    if (!sections.length) {
      return;
    }

    state.activeExplosionSectionIndex = ((index % sections.length) + sections.length) % sections.length;
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }

    const overlay = document.querySelector(`#${ROOT_ID} .gpt-paragraph-nav__explosion-overlay`);
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    syncExplosionOverlay(overlay);
    resetExplosionBodyScroll(overlay);
    lifecycle.requestAnimationFrame(() => {
      const activeChip = overlay.querySelector(".gpt-paragraph-nav__explosion-chip.is-active");
      activeChip?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function explosionRenderSignature(sections = state.explosionSections) {
    const activeIndex = activeExplosionSectionIndexFromState(sections);
    return JSON.stringify({
      activeIndex,
      searchQuery: state.explosionSearchQuery,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        markerKey: section.markerKey,
        paragraphs: section.paragraphs
      }))
    });
  }

  function resetExplosionBodyScroll(overlay) {
    const body = overlay.querySelector(".gpt-paragraph-nav__explosion-body");
    if (body instanceof HTMLElement) {
      body.scrollTop = 0;
    }
  }

  function syncExplosionOverlay(overlay) {
    const body = overlay.querySelector(".gpt-paragraph-nav__explosion-body");
    const chips = overlay.querySelector(".gpt-paragraph-nav__explosion-chips");
    const signature = explosionRenderSignature();
    if (body instanceof HTMLElement && signature !== state.lastExplosionRenderSignature) {
      renderExplosionSections(body);
      if (chips instanceof HTMLElement) {
        renderExplosionChips(chips);
      }
      state.lastExplosionRenderSignature = signature;
    }

    overlay.hidden = !state.isExplosionOpen;
    overlay.classList.toggle("is-open", state.isExplosionOpen);
  }

  function lockPageScroll() {
    if (state.scrollLock) {
      return;
    }

    state.scrollLock = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function unlockPageScroll() {
    if (!state.scrollLock) {
      return;
    }

    document.documentElement.style.overflow = state.scrollLock.htmlOverflow;
    document.body.style.overflow = state.scrollLock.bodyOverflow;
    state.scrollLock = null;
  }

  function openExplosionOverlay() {
    state.explosionSections = collectExplosionSections();
    state.activeExplosionSectionIndex = activeExplosionSectionIndexFromState(state.explosionSections);
    state.lastExplosionRenderSignature = "";
    state.isExplosionOpen = true;
    lockPageScroll();
    const overlay = getExplosionOverlay();
    syncExplosionOverlay(overlay);
    lifecycle.requestAnimationFrame(() => {
      resetExplosionBodyScroll(overlay);
    });
  }

  function closeExplosionOverlay() {
    if (!state.isExplosionOpen) {
      return;
    }

    state.isExplosionOpen = false;
    state.explosionSearchQuery = "";
    state.explosionSections = [];
    state.activeExplosionSectionIndex = 0;
    state.lastExplosionRenderSignature = "";
    unlockPageScroll();
    state.activeControlTab = "navigation";
    const root = document.getElementById(ROOT_ID);
    if (root instanceof HTMLElement) {
      syncControlTabs(root);
    }
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    const overlay = document.querySelector(`#${ROOT_ID} .gpt-paragraph-nav__explosion-overlay`);
    if (overlay instanceof HTMLElement) {
      syncExplosionOverlay(overlay);
    }
  }

  function jumpToExplosionSectionSource(section) {
    const source = section?.startElement;
    if (!(source instanceof HTMLElement) || !source.isConnected) {
      return;
    }

    if (section.markerKey) {
      state.activeMarkerKey = section.markerKey;
    }
    closeExplosionOverlay();
    lifecycle.requestAnimationFrame(() => {
      const activeMarker = syncActiveMarker();
      updateFloatingActiveMarker(activeMarker);
      jumpToHeading({ element: source });
    });
  }

  function toggleExplosionOverlay() {
    if (isExplosionOpen()) {
      closeExplosionOverlay();
      return;
    }
    state.activeControlTab = "chapters";
    openExplosionOverlay();
    const root = document.getElementById(ROOT_ID);
    if (root instanceof HTMLElement) {
      syncControlTabs(root);
    }
  }

  async function writeTextToClipboard(text) {
    if (!text) {
      return false;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return isExtensionContextValid();
      } catch {}
    }

    if (!isExtensionContextValid()) return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  function currentExplosionSectionText() {
    const section = state.explosionSections[activeExplosionSectionIndexFromState()];
    if (!section) {
      return "";
    }
    const parts = section.markerKey ? [section.title, ...section.paragraphs] : section.paragraphs;
    return normalizeExplosionText(parts.filter(Boolean).join("\n\n"));
  }

  function fullExplosionText() {
    return normalizeExplosionText(collectExplosionParagraphs().join("\n\n"));
  }

  function showCopyToast(message) {
    if (!isExtensionContextValid()) return;
    const overlay = document.querySelector(`#${ROOT_ID} .gpt-paragraph-nav__explosion-overlay`);
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    overlay.querySelectorAll(".gpt-paragraph-nav__copy-toast").forEach((toast) => toast.remove());
    const toast = document.createElement("div");
    toast.className = "gpt-paragraph-nav__copy-toast";
    toast.textContent = message;
    overlay.appendChild(toast);
    lifecycle.requestAnimationFrame(() => toast.classList.add("is-visible"));
    lifecycle.setTimeout(() => {
      toast.classList.remove("is-visible");
      lifecycle.setTimeout(() => toast.remove(), 180);
    }, 1400);
  }

  async function copyCurrentExplosionSection() {
    const copied = await writeTextToClipboard(currentExplosionSectionText());
    if (copied) {
      showCopyToast(t("chapters.copySuccess"));
    }
    return copied;
  }

  async function copyFullExplosionText() {
    const copied = await writeTextToClipboard(fullExplosionText());
    if (copied) {
      showCopyToast(t("chapters.copySuccess"));
    }
    return copied;
  }

  function isInsideNavigationRoot(node) {
    const root = document.getElementById(ROOT_ID);
    return root instanceof HTMLElement && node instanceof Node && root.contains(node);
  }

  function isUserInputContext(node) {
    const element = elementFromNode(node);
    return element instanceof HTMLElement && Boolean(element.closest(USER_INPUT_SELECTOR));
  }

  function getConversationHeaderHeight() {
    if (isManusPage()) {
      const chatBox = document.getElementById("manus-chat-box");
      const height = chatBox && Number.parseFloat(window.getComputedStyle(chatBox).getPropertyValue("--chat-box-header-occupied-height"));
      return height > 0 ? Math.round(height) : DEFAULT_HEADER_HEIGHT;
    }
    const headers = Array.from(document.querySelectorAll(CONVERSATION_HEADER_SELECTOR))
      .filter((header) => header instanceof HTMLElement && isVisible(header))
      .map((header) => header.getBoundingClientRect())
      .filter((rect) => rect.top <= 4 && rect.bottom > 0);

    if (!headers.length) {
      return DEFAULT_HEADER_HEIGHT;
    }

    return Math.round(Math.max(...headers.map((rect) => rect.height)));
  }

  function updateHeaderOffset(root) {
    root.style.setProperty("--gpt-conversation-header-height", `${getConversationHeaderHeight()}px`);
  }

  function isDoubaoPage() {
    return window.location.hostname === "www.doubao.com" || window.location.hostname.endsWith(".doubao.com");
  }

  function isKimiPage() {
    return window.location.hostname === "kimi.com" || window.location.hostname.endsWith(".kimi.com");
  }

  function isQianwenPage() {
    return window.location.hostname === "qianwen.com" || window.location.hostname.endsWith(".qianwen.com");
  }

  function isYuanbaoPage() {
    return window.location.hostname === "yb.tencent.com"
      || window.location.hostname.endsWith(".yb.tencent.com")
      || window.location.hostname === "yuanbao.tencent.com"
      || window.location.hostname.endsWith(".yuanbao.tencent.com");
  }

  function isXiaohongshuPage() {
    return window.location.hostname === "diandian.xiaohongshu.com"
      || window.location.hostname.endsWith(".diandian.xiaohongshu.com")
      || (window.location.hostname === "www.xiaohongshu.com" && window.location.pathname.startsWith("/ai_chat"))
      || window.location.hostname === "www.askdiandian.com"
      || window.location.hostname.endsWith(".askdiandian.com")
      || window.location.hostname === "www.diandianlife.top"
      || window.location.hostname.endsWith(".diandianlife.top");
  }

  function isXiaohongshuMainChatPage() {
    return window.location.hostname === "www.xiaohongshu.com" && window.location.pathname.startsWith("/ai_chat");
  }

  function isUnsupportedXiaohongshuMainPage() {
    return window.location.hostname === "www.xiaohongshu.com" && !window.location.pathname.startsWith("/ai_chat");
  }

  function isSupportedRoute() {
    return !isUnsupportedXiaohongshuMainPage();
  }

  function currentRouteKey() {
    const { origin, pathname, search } = window.location;
    return `${origin}${pathname}${search}`;
  }

  function isChatGPTPage() {
    return window.location.hostname === "chatgpt.com"
      || window.location.hostname.endsWith(".chatgpt.com")
      || window.location.hostname === "chat.openai.com"
      || window.location.hostname.endsWith(".chat.openai.com");
  }

  function isClaudePage() {
    return window.location.hostname === "claude.ai";
  }

  function isGeminiPage() {
    return window.location.hostname === "gemini.google.com";
  }

  function isGrokPage() {
    return window.location.hostname === "grok.com";
  }

  function isManusPage() {
    return window.location.hostname === "manus.im";
  }

  function isDeepSeekPage() {
    return window.location.hostname === "chat.deepseek.com";
  }

  function currentPlatformKey() {
    if (isChatGPTPage()) {
      return "chatgpt";
    }
    if (isClaudePage()) {
      return "claude";
    }
    if (isGeminiPage()) {
      return "gemini";
    }
    if (isGrokPage()) {
      return "grok";
    }
    if (isManusPage()) {
      return "manus";
    }
    if (isDeepSeekPage()) {
      return "deepseek";
    }
    if (isDoubaoPage()) {
      return "doubao";
    }
    if (isKimiPage()) {
      return "kimi";
    }
    if (isQianwenPage()) {
      return "qianwen";
    }
    if (isYuanbaoPage()) {
      return "yuanbao";
    }
    if (isXiaohongshuPage()) {
      return "xiaohongshu";
    }
    return "default";
  }

  function currentModelLabel() {
    if (!isChatGPTPage()) {
      return "";
    }
    const control = document.querySelector(CHATGPT_MODEL_SELECTOR);
    if (!(control instanceof HTMLElement)) {
      return "";
    }
    const text = normalizeTitle(control.innerText || control.textContent || "");
    const ariaLabel = normalizeTitle(control.getAttribute("aria-label") || "");
    if (!text || text.toLowerCase() === ariaLabel.toLowerCase() || /^(select|选择).*?(model|模型)$/i.test(text)) {
      return "";
    }
    return text.slice(0, 80);
  }

  function withHashedMarkdownSelectors(selectors) {
    return [...selectors, HASHED_MARKDOWN_ROOT_SELECTOR, MARKDOWN_FALLBACK_SELECTOR];
  }

  function getAssistantContainerSelectors() {
    if (isDeepSeekPage()) {
      return [DEEPSEEK_ASSISTANT_SELECTOR];
    }
    if (isManusPage()) {
      return [MANUS_ASSISTANT_SELECTOR];
    }
    if (isUnsupportedXiaohongshuMainPage()) {
      return [];
    }

    if (isChatGPTPage()) {
      return [
        CHATGPT_LEGACY_ASSISTANT_SELECTOR,
        HASHED_MARKDOWN_ROOT_SELECTOR,
        CHATGPT_PROSE_SELECTOR,
        MARKDOWN_FALLBACK_SELECTOR
      ];
    }

    if (isXiaohongshuPage()) {
      return withHashedMarkdownSelectors([
        XIAOHONGSHU_ASSISTANT_MESSAGE_SELECTOR,
        XIAOHONGSHU_ASSISTANT_MARKDOWN_SELECTOR,
        XIAOHONGSHU_ASSISTANT_FALLBACK_SELECTOR,
        ASSISTANT_MESSAGE_SELECTOR
      ]);
    }

    if (isClaudePage()) {
      return withHashedMarkdownSelectors([CLAUDE_ASSISTANT_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]);
    }

    if (isGeminiPage()) {
      return withHashedMarkdownSelectors([GEMINI_ASSISTANT_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]);
    }

    if (isGrokPage()) {
      return withHashedMarkdownSelectors([GROK_ASSISTANT_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]);
    }

    if (isYuanbaoPage()) {
      return withHashedMarkdownSelectors([YUANBAO_ASSISTANT_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]);
    }

    if (isKimiPage()) {
      return withHashedMarkdownSelectors([KIMI_ASSISTANT_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]);
    }

    if (isQianwenPage()) {
      return withHashedMarkdownSelectors([QIANWEN_ASSISTANT_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]);
    }

    if (isDoubaoPage()) {
      return withHashedMarkdownSelectors([DOUBAO_ASSISTANT_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]);
    }

    return withHashedMarkdownSelectors([ASSISTANT_MESSAGE_SELECTOR]);
  }

  let discardedConversationWarningRoute = "";

  function logDiscardedConversationNodes(matched) {
    console.info(`[Polaris] Assistant message nodes matched but are currently hidden; skipping this scan. matched=${matched}`);
  }

  function getChatGptUserContainers(scanContext = null) {
    const candidates = Array.from(document.querySelectorAll(CHATGPT_USER_SELECTOR))
      .filter((node) => node instanceof HTMLElement
        && isChatGptUserTurnNode(node)
        && !isInsideNavigationRoot(node)
        && !isUserInputContext(node)
        && isVisible(node, scanContext));
    const candidateSet = new Set(candidates);
    return candidates.filter((candidate) => {
      for (let parent = candidate.parentElement; parent instanceof HTMLElement; parent = parent.parentElement) {
        if (candidateSet.has(parent)) {
          return false;
        }
      }
      return true;
    });
  }

  function getChatGptAssistantContainers(scanContext = null) {
    const selectors = getAssistantContainerSelectors();
    let matched = 0;
    const visible = {};
    selectors.forEach((selector) => {
      const nodes = Array.from(document.querySelectorAll(selector))
        .filter((node) => node instanceof HTMLElement
          && !isInsideNavigationRoot(node)
          && !isUserInputContext(node));
      matched += nodes.length;
      visible[selector] = nodes.filter((node) => isVisible(node, scanContext));
    });
    const merged = mergeChatGptAssistantNodes({
      legacy: visible[CHATGPT_LEGACY_ASSISTANT_SELECTOR] || [],
      hashed: visible[HASHED_MARKDOWN_ROOT_SELECTOR] || [],
      prose: visible[CHATGPT_PROSE_SELECTOR] || [],
      users: getChatGptUserContainers(scanContext)
    });
    if (merged.length > 0) {
      return merged.map((item) => item.node);
    }
    const fallback = visible[MARKDOWN_FALLBACK_SELECTOR] || [];
    if (fallback.length > 0) {
      return fallback;
    }
    const routeKey = currentRouteKey();
    if (matched > 0 && discardedConversationWarningRoute !== routeKey) {
      discardedConversationWarningRoute = routeKey;
      logDiscardedConversationNodes(matched);
    }
    return [];
  }

  function getManusConversation(scanContext = null) {
    return collectManusConversation(document, {
      acceptNode: (node) => node instanceof HTMLElement
        && !isInsideNavigationRoot(node)
        && !isUserInputContext(node)
        && isVisible(node, scanContext)
    });
  }

  function getDeepSeekConversation(scanContext = null) {
    return collectDeepSeekConversation(document, {
      acceptNode: (node) => node instanceof HTMLElement
        && !isInsideNavigationRoot(node)
        && !isUserInputContext(node)
        && isVisible(node, scanContext)
    });
  }

  function getAssistantContainers(scanContext = null) {
    if (isDeepSeekPage()) {
      return getDeepSeekConversation(scanContext).assistantContainers;
    }
    if (isManusPage()) {
      return getManusConversation(scanContext).assistantContainers;
    }
    if (isChatGPTPage()) {
      return getChatGptAssistantContainers(scanContext);
    }
    const userSelector = isGrokPage() || isXiaohongshuPage()
      ? getUserContainerSelectors().join(", ")
      : "";
    let matched = 0;
    for (const selector of getAssistantContainerSelectors()) {
      const nodes = Array.from(document.querySelectorAll(selector))
        .filter((node) => node instanceof HTMLElement
          && !isInsideNavigationRoot(node)
          && !isUserInputContext(node)
          && (!userSelector || (!node.closest(userSelector) && !node.querySelector(userSelector))));
      matched += nodes.length;
      const visibleNodes = nodes.filter((node) => isVisible(node, scanContext));
      const containers = selector === HASHED_MARKDOWN_ROOT_SELECTOR
        ? visibleNodes.filter((node) => !visibleNodes.some((other) => other !== node && other.contains(node)))
        : visibleNodes;
      if (containers.length > 0) {
        return containers;
      }
    }

    const routeKey = currentRouteKey();
    if (matched > 0 && discardedConversationWarningRoute !== routeKey) {
      discardedConversationWarningRoute = routeKey;
      logDiscardedConversationNodes(matched);
    }

    return [];
  }

  function getUserContainerSelectors() {
    if (isDeepSeekPage()) {
      return [DEEPSEEK_USER_CONTAINER_SELECTOR];
    }
    if (isManusPage()) {
      return [MANUS_USER_CONTAINER_SELECTOR];
    }
    if (isUnsupportedXiaohongshuMainPage()) {
      return [];
    }

    if (isXiaohongshuPage()) {
      return [
        XIAOHONGSHU_USER_MESSAGE_ROOT_SELECTOR,
        XIAOHONGSHU_USER_MESSAGE_SELECTOR,
        USER_MESSAGE_SELECTOR
      ];
    }

    if (isClaudePage()) {
      return [CLAUDE_USER_MESSAGE_SELECTOR];
    }

    if (isGeminiPage()) {
      return [GEMINI_USER_MESSAGE_SELECTOR, GEMINI_USER_MESSAGE_FALLBACK_SELECTOR, USER_MESSAGE_SELECTOR];
    }

    if (isGrokPage()) {
      return [GROK_USER_MESSAGE_SELECTOR, USER_MESSAGE_SELECTOR];
    }

    if (isYuanbaoPage()) {
      return [YUANBAO_USER_MESSAGE_SELECTOR, USER_MESSAGE_SELECTOR];
    }

    if (isKimiPage()) {
      return [KIMI_USER_MESSAGE_SELECTOR, USER_MESSAGE_SELECTOR];
    }

    if (isQianwenPage()) {
      return [QIANWEN_USER_MESSAGE_SELECTOR, USER_MESSAGE_SELECTOR];
    }

    if (isDoubaoPage()) {
      return [DOUBAO_USER_MESSAGE_SELECTOR, USER_MESSAGE_SELECTOR];
    }

    if (isChatGPTPage()) {
      return [CHATGPT_USER_SELECTOR, USER_MESSAGE_SELECTOR];
    }

    return [USER_MESSAGE_SELECTOR];
  }

  function doubaoMessageRoleForContainer(container) {
    if (!(container instanceof HTMLElement)) {
      return "";
    }
    if (doubaoMessageRoleFromClassNames(container.classList) === "user") {
      return "user";
    }
    return container.matches(USER_MESSAGE_SELECTOR) ? "user" : "";
  }

  function getUserContainers(scanContext = null) {
    if (isDeepSeekPage()) {
      return getDeepSeekConversation(scanContext).userContainers;
    }
    if (isManusPage()) {
      return getManusConversation(scanContext).userContainers;
    }
    if (isChatGPTPage()) {
      return getChatGptUserContainers(scanContext);
    }
    for (const selector of getUserContainerSelectors()) {
      const containers = Array.from(document.querySelectorAll(selector))
        .filter((node) => node instanceof HTMLElement
          && isVisible(node, scanContext)
          && !isInsideNavigationRoot(node)
          && !isUserInputContext(node)
          && (!isDoubaoPage() || doubaoMessageRoleForContainer(node) === "user"));
      if (containers.length > 0) {
        return containers;
      }
    }

    if (isXiaohongshuMainChatPage()) {
      return getXiaohongshuUserFallbackContainers(scanContext);
    }

    return [];
  }

  function getXiaohongshuUserFallbackContainers(scanContext = null) {
    const candidates = Array.from(document.querySelectorAll(XIAOHONGSHU_MESSAGE_ITEM_SELECTOR))
      .filter((node) => node instanceof HTMLElement
        && isVisible(node, scanContext)
        && !isInsideNavigationRoot(node)
        && !isUserInputContext(node)
        && !node.matches(XIAOHONGSHU_ASSISTANT_MARKDOWN_SELECTOR)
        && !node.querySelector(XIAOHONGSHU_ASSISTANT_MARKDOWN_SELECTOR)
        && Boolean(normalizeTitle(node.innerText || node.textContent || "")));
    return candidates.filter((candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)));
  }

  function normalizeTitle(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function firstLineMarkerTitle(text) {
    const firstLine = text.split(/\r?\n/)
      .map((line) => normalizeTitle(line))
      .find(Boolean) || "";
    return firstLine.slice(0, MAX_USER_PREVIEW_LENGTH);
  }

  function userMessageText(element) {
    if (isDeepSeekPage()) {
      return deepseekUserMessageText(element);
    }
    if (isManusPage()) {
      return manusUserMessageText(element);
    }
    if (isGeminiPage()) {
      for (const selector of GEMINI_USER_TEXT_SELECTOR.split(", ")) {
        const textElements = Array.from(element.querySelectorAll(selector))
          .filter((candidate) => candidate instanceof HTMLElement);
        if (textElements.length === 0) {
          continue;
        }
        const text = textElements
          .map((textElement) => textElement.innerText || textElement.textContent || "")
          .join("\n");
        if (text.trim()) {
          return text.replace(GEMINI_USER_ROLE_PREFIX_PATTERN, "");
        }
      }
    }
    const text = element.innerText || element.textContent || "";
    if (isChatGPTPage()) {
      return stripChatGptUserRolePrefix(text);
    }
    return text.replace(GEMINI_USER_ROLE_PREFIX_PATTERN, "");
  }

  function userMessageImageSelector() {
    return userMessageImageSelectorForPlatform(currentPlatformKey());
  }

  function matchingUserContainerSelector(messageElement) {
    for (const selectorGroup of getUserContainerSelectors()) {
      for (const selector of selectorGroup.split(",")) {
        const candidate = selector.trim();
        if (candidate && messageElement.matches(candidate)) {
          return candidate;
        }
      }
    }
    return "";
  }

  function isUserMessageImage(image, messageElement) {
    if (!(image instanceof HTMLImageElement) || isInsideNavigationRoot(image)) {
      return false;
    }
    let excluded = false;
    for (let node = image; node && node !== messageElement; node = node.parentElement) {
      if (node.matches?.(USER_MESSAGE_AVATAR_SELECTOR)) {
        excluded = true;
        break;
      }
    }
    const platform = currentPlatformKey();
    const imageSelector = userMessageImageSelector();
    const ownerSelector = matchingUserContainerSelector(messageElement);
    return isOwnedUserAttachmentCandidate({
      platform,
      ownerMatches: Boolean(ownerSelector) && image.closest(ownerSelector) === messageElement,
      inAttachmentRegion: Boolean(imageSelector) && image.matches(imageSelector),
      excluded
    });
  }

  function firstImageSrcsetUrl(image) {
    const srcset = image.getAttribute("srcset") || "";
    return srcset
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/)[0] || "")
      .find(Boolean) || "";
  }

  function userMessageImageSource(image) {
    const candidates = [
      image.getAttribute("src"),
      firstImageSrcsetUrl(image),
      image.getAttribute("data-src"),
      image.getAttribute("data-original"),
      image.getAttribute("data-url")
    ];
    return candidates.find((candidate) => safeUserMessageImageUrl(candidate, window.location.href)) || "";
  }

  function userMessageThumbnail(element) {
    const selector = userMessageImageSelector();
    const sources = selector ? Array.from(element.querySelectorAll(selector))
      .filter((image) => isUserMessageImage(image, element))
      .map(userMessageImageSource) : [];
    return userMessageThumbnailForSources(sources, window.location.href);
  }

  function compareDocumentOrder(left, right) {
    if (left === right) {
      return 0;
    }
    return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  function compareConversationPosition(left, right, scanContext = null) {
    const leftTop = scanContext ? scanContext.topFor(left) : left.getBoundingClientRect().top + window.scrollY;
    const rightTop = scanContext ? scanContext.topFor(right) : right.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(leftTop - rightTop) > 1) {
      return leftTop - rightTop;
    }
    return compareDocumentOrder(left, right);
  }

  function makeUserMarkerItem(element) {
    const text = userMessageText(element);
    const textTitle = normalizeTitle(text);
    const { imageUrls, thumbnailSrc, imageCount } = userMessageThumbnail(element);
    const isImageOnly = !textTitle && Boolean(thumbnailSrc);
    const title = textTitle || (isImageOnly ? t("userMarker.imageOnly") : "");
    return {
      element,
      title,
      previewTitle: isImageOnly ? "" : firstLineMarkerTitle(text) || title,
      imageUrls,
      thumbnailSrc,
      imageCount,
      isImageOnly,
      markerKey: markerKeyFor(element)
    };
  }

  function assistantContainerForHeading(heading, assistantContainerSet) {
    for (let element = heading.element; element instanceof HTMLElement; element = element.parentElement) {
      if (assistantContainerSet.has(element)) {
        return element;
      }
    }
    return null;
  }

  function collectMarkerGroups(userContainers, assistantContainers, headings, scanContext = null, assistantUserElements = null) {
    const userItems = userContainers
      .map((element) => makeUserMarkerItem(element))
      .filter((user) => Boolean(user.title))
      .sort((left, right) => compareConversationPosition(left.element, right.element, scanContext));
    const userItemByElement = new Map(userItems.map((user) => [user.element, user]));
    const assistantContainerSet = new Set(assistantContainers);
    const headingToAssistant = new Map();
    headings.forEach((heading) => {
      const container = assistantContainerForHeading(heading, assistantContainerSet);
      if (container) {
        headingToAssistant.set(heading, container);
      }
    });
    const entries = [
      ...userContainers.map((element) => ({ type: "user", element })),
      ...assistantContainers.map((element) => ({ type: "assistant", element }))
    ].sort((left, right) => compareConversationPosition(left.element, right.element, scanContext));
    const groupsByKey = new Map(userItems.map((user) => [user.markerKey, {
      key: user.markerKey,
      user,
      headings: [],
      hasAssistantMessage: false
    }]));
    const orphanGroup = { key: "orphan", user: null, headings: [] };
    const assistantToUser = new Map();
    let currentUser = null;

    entries.forEach((entry) => {
      if (entry.type === "user") {
        const user = userItemByElement.get(entry.element);
        if (!user) {
          return;
        }
        currentUser = user;
        return;
      }

      if (assistantUserElements) {
        currentUser = userItemByElement.get(assistantUserElements.get(entry.element)) || null;
      }
      assistantToUser.set(entry.element, currentUser);
      if (currentUser) {
        groupsByKey.get(currentUser.markerKey).hasAssistantMessage = true;
      }
    });

    headings.forEach((heading) => {
      const assistantContainer = headingToAssistant.get(heading);
      let user = assistantToUser.get(assistantContainer);
      if (!user && isXiaohongshuMainChatPage()) {
        user = userItems
          .filter((item) => compareConversationPosition(item.element, heading.element, scanContext) <= 0)
          .pop() || null;
      }
      const group = user ? groupsByKey.get(user.markerKey) : orphanGroup;
      group.headings.push(heading);
    });

    const rawGroups = [...groupsByKey.values(), orphanGroup]
      .filter((group) => group.user || group.headings.length)
      .sort((left, right) => {
        const leftElement = left.user ? left.user.element : left.headings[0].element;
        const rightElement = right.user ? right.user.element : right.headings[0].element;
        return compareConversationPosition(leftElement, rightElement, scanContext);
      });
    return rawGroups;
  }

  function dedupeAdjacentGroupHeadings(groups) {
    return groups.map((group) => ({
      ...group,
      headings: dedupeAdjacentTextHeadings(group.headings, () => group.user?.element || null)
    }));
  }

  function syncUserMarkerExpansion(groups) {
    state.latestUserMarkerKey = latestUserMarkerKey(groups);
  }

  function clampLevel(level, max = 4) {
    if (Number.isNaN(level)) {
      return 2;
    }
    return Math.min(Math.max(level, 1), max);
  }

  function headingLevelFor(element) {
    if (/^H[1-6]$/.test(element.tagName)) {
      return Number(element.tagName.slice(1));
    }
    return clampLevel(Number(element.getAttribute("aria-level")));
  }

  function makeHeadingItem(element, index, level, sourceType = "heading") {
    return {
      element,
      level: clampLevel(level, sourceType === "hashed-markdown" ? 6 : 4),
      title: normalizeTitle(element.textContent || ""),
      id: element.id || `gpt-paragraph-heading-${index + 1}`,
      sourceType
    };
  }

  function tableMarkerCandidates(containers, scanContext = null) {
    return containers.flatMap((container) => Array.from(container.querySelectorAll("table"))
      .filter((table) => table instanceof HTMLTableElement && isVisible(table, scanContext))
      .map((table) => ({
        element: table,
        fingerprint: normalizeTitle(table.innerText || table.textContent || ""),
        cells: table.rows.length
          ? Array.from(table.rows[0].cells).map((cell) => cell.innerText || cell.textContent || "")
          : []
      })));
  }

  function collectTableHeadings(containers, seen, headings, scanContext = null) {
    const tables = tableMarkerCandidates(containers, scanContext);

    tableMarkerEntries(tables).forEach(({ element, title, fingerprint }, tableMarkerIndex) => {
      if (seen.has(element)) {
        return;
      }
      seen.add(element);
      headings.push({
        element,
        level: TABLE_MARKER_LEVEL,
        title,
        id: element.id || `gpt-paragraph-heading-${headings.length + 1}`,
        sourceType: "table",
        tableMarkerIndex,
        tableMarkerFingerprint: fingerprint
      });
    });
  }

  function markdownLevelFromText(text) {
    const match = text.match(/^(#{1,4})\s+\S/);
    return match ? match[1].length : null;
  }

  function numberedHeadingLevelFromText(text) {
    if (/^(?:第)?[一二三四五六七八九十百千万]+[、.．]\s*\S/.test(text)) {
      return 1;
    }

    return null;
  }

  function getLeadingStrong(element) {
    const firstElement = Array.from(element.childNodes)
      .find((node) => node.nodeType === Node.ELEMENT_NODE);

    if (!(firstElement instanceof HTMLElement)) {
      return null;
    }

    if (firstElement.matches("strong, b")) {
      return firstElement;
    }

    return null;
  }

  function isStandaloneStrongHeading(element) {
    const titleElement = getLeadingStrong(element);
    if (!titleElement) {
      return false;
    }

    const blockText = normalizeTitle(element.textContent || "");
    const titleText = normalizeTitle(titleElement.textContent || "");
    if (!titleText || titleText.length > 160) {
      return false;
    }

    const markdownLevel = markdownLevelFromText(blockText);
    if (markdownLevel) {
      return true;
    }

    if (/^\d{1,2}[.．、]\s+\S/.test(blockText)) {
      return false;
    }

    return blockText === titleText;
  }

  function isStandaloneNumberedHeading(element) {
    const text = normalizeTitle(element.textContent || "");
    if (!text || text.length > 180) {
      return false;
    }

    if (!numberedHeadingLevelFromText(text)) {
      return false;
    }

    const nestedBlocks = element.querySelectorAll("p, div, ul, ol, table, pre, blockquote");
    return nestedBlocks.length === 0;
  }

  function isUnorderedListItem(element) {
    const parentList = element.parentElement;
    return parentList instanceof HTMLElement && parentList.tagName === "UL";
  }

  function firstListItemBlock(element) {
    return Array.from(element.children)
      .find((child) => child instanceof HTMLElement
        && !child.matches("ul, ol, table, pre, blockquote")
        && normalizeTitle(child.textContent || ""));
  }

  function isTopLevelUnorderedListItem(element, container) {
    const parentList = element.parentElement;
    if (!(parentList instanceof HTMLElement) || parentList.tagName !== "UL") {
      return false;
    }

    return !parentList.parentElement
      || parentList.parentElement === container
      || !parentList.parentElement.closest("li");
  }

  function isTopLevelOrderedListItem(element, container) {
    const parentList = element.parentElement;
    if (!(parentList instanceof HTMLElement) || parentList.tagName !== "OL") {
      return false;
    }

    return !parentList.parentElement
      || parentList.parentElement === container
      || !parentList.parentElement.closest("li");
  }

  function titleFromListItemStrong(element) {
    const titleElement = getLeadingStrong(element) || (firstListItemBlock(element) && getLeadingStrong(firstListItemBlock(element)));
    if (!titleElement) {
      return "";
    }

    const title = normalizeTitle(titleElement.textContent || "");
    return title && title.length <= 80 ? title : "";
  }

  function titleFromListItemText(element) {
    const sourceElement = firstListItemBlock(element) || element;
    const text = normalizeTitle(sourceElement.textContent || element.textContent || "");
    if (!text || text.length > 180) {
      return "";
    }

    const separatedTitle = text.match(/^([^:：]{2,80})[:：]\s*\S/);
    if (separatedTitle) {
      return normalizeTitle(separatedTitle[1]);
    }

    if (text.length <= 48 && !/[。！？.!?；;，,]\s*\S/.test(text)) {
      return text;
    }

    return "";
  }

  function unorderedListHeading(element, container) {
    if (!isTopLevelUnorderedListItem(element, container)) {
      return null;
    }

    if (element.querySelector("ul, ol, table, pre, blockquote")) {
      return null;
    }

    const strongTitle = titleFromListItemStrong(element);
    if (strongTitle) {
      return { sourceType: "strong", title: strongTitle };
    }

    const title = titleFromListItemText(element);
    return title ? { sourceType: "unordered-list", title } : null;
  }

  function orderedListHeading(element, container) {
    if (!isTopLevelOrderedListItem(element, container)) {
      return null;
    }

    if (element.querySelector("ul, ol, table, pre, blockquote")) {
      return null;
    }

    const strongTitle = titleFromListItemStrong(element);
    if (strongTitle) {
      return { sourceType: "strong", title: strongTitle };
    }

    const title = titleFromListItemText(element);
    return title ? { sourceType: "ordered-list", title } : null;
  }

  function titleFromAttribute(element) {
    return normalizeTitle(element.getAttribute("data-title") || element.getAttribute("title") || element.getAttribute("aria-label") || "");
  }

  function firstLineTitle(element) {
    return normalizeTitle((element.textContent || "").split(/\n/)[0] || "");
  }

  function isLikelyVideoTitle(element, title) {
    if (!title || title.length > 160) {
      return false;
    }

    if (/^(播放|暂停|更多|关闭|分享|重播)$/.test(title)) {
      return false;
    }

    const className = String(element.className || "");
    return !/(sub.?title|desc|time|duration|button|icon|play|cover)/i.test(className);
  }

  function titleForYuanbaoVideoCard(card) {
    for (const selector of YUANBAO_VIDEO_TITLE_SELECTORS) {
      const candidates = Array.from(card.querySelectorAll(selector))
        .filter((node) => node instanceof HTMLElement && isVisible(node));

      for (const candidate of candidates) {
        const title = titleFromAttribute(candidate) || firstLineTitle(candidate);
        if (isLikelyVideoTitle(candidate, title)) {
          return { element: candidate, title };
        }
      }
    }

    const fallbackTitle = titleFromAttribute(card) || firstLineTitle(card);
    if (fallbackTitle && fallbackTitle.length <= 160) {
      return { element: card, title: fallbackTitle };
    }

    return null;
  }

  function collectYuanbaoVideoCardHeadings(seen, headings, scanContext = null) {
    if (!isYuanbaoPage()) {
      return;
    }

    document.querySelectorAll(YUANBAO_VIDEO_CARD_SELECTOR).forEach((card) => {
      if (!(card instanceof HTMLElement) || !isVisible(card, scanContext) || seen.has(card)) {
        return;
      }

      const title = titleForYuanbaoVideoCard(card);
      if (!title || seen.has(title.element)) {
        return;
      }

      seen.add(card);
      seen.add(title.element);
      headings.push({
        element: title.element,
        level: 2,
        title: title.title,
        id: title.element.id || `gpt-paragraph-heading-${headings.length + 1}`,
        sourceType: "video"
      });
    });
  }

  function collectQianwenVideoListHeadings(seen, headings, scanContext = null) {
    if (!isQianwenPage()) {
      return;
    }

    document.querySelectorAll(QIANWEN_VIDEO_LIST_SELECTOR).forEach((card) => {
      if (!(card instanceof HTMLElement) || !isVisible(card, scanContext) || seen.has(card)) {
        return;
      }

      const titleElement = Array.from(card.querySelectorAll(QIANWEN_VIDEO_TITLE_SELECTOR))
        .find((node) => node instanceof HTMLElement && isVisible(node, scanContext) && normalizeTitle(node.textContent || ""));
      if (!(titleElement instanceof HTMLElement) || seen.has(titleElement)) {
        return;
      }

      const title = normalizeTitle(titleElement.textContent || "");
      if (!title || title.length > 160) {
        return;
      }

      seen.add(card);
      seen.add(titleElement);
      headings.push({
        element: titleElement,
        level: 2,
        title,
        id: titleElement.id || `gpt-paragraph-heading-${headings.length + 1}`,
        sourceType: "video"
      });
    });
  }

  function collectHeadings(containers = getAssistantContainers(), { applyConfig = true, scanContext = null } = {}) {
    const seen = new Set();
    const headings = [];

    containers.forEach((container) => {
      const hashedMarkdownRoot = container.matches(HASHED_MARKDOWN_ROOT_SELECTOR)
        || Boolean(container.querySelector(HASHED_MARKDOWN_ROOT_SELECTOR));
      const candidateSelector = hashedMarkdownRoot
        ? `${MARKER_CANDIDATE_SELECTOR}, h5, h6, ${HASHED_HEADING_SELECTOR}`
        : MARKER_CANDIDATE_SELECTOR;
      container.querySelectorAll(candidateSelector).forEach((heading) => {
        if (!(heading instanceof HTMLElement) || !isVisible(heading, scanContext) || seen.has(heading)) {
          return;
        }

        if (hashedMarkdownRoot && (heading.matches("h1, h2, h3, h4, h5, h6") || heading.matches(HASHED_HEADING_SELECTOR))) {
          const level = hashedMarkdownHeadingLevel(heading);
          if (level) {
            seen.add(heading);
            headings.push(makeHeadingItem(heading, headings.length, level, "hashed-markdown"));
            return;
          }
        }

        if (heading.matches(`${HEADING_SELECTOR}, ${ROLE_HEADING_SELECTOR}`)) {
          seen.add(heading);
          headings.push(makeHeadingItem(heading, headings.length, headingLevelFor(heading)));
          return;
        }

        if (heading.matches(STRONG_HEADING_SELECTOR)
          && !(heading.tagName === "LI" && isUnorderedListItem(heading))
          && isStandaloneStrongHeading(heading)) {
          seen.add(heading);
          const markdownLevel = markdownLevelFromText(normalizeTitle(heading.textContent || ""));
          headings.push(makeHeadingItem(heading, headings.length, markdownLevel || 2, "strong"));
          return;
        }

        if (heading.matches(NUMBERED_HEADING_SELECTOR) && isStandaloneNumberedHeading(heading)) {
          seen.add(heading);
          const level = numberedHeadingLevelFromText(normalizeTitle(heading.textContent || ""));
          headings.push(makeHeadingItem(heading, headings.length, level || 2));
          return;
        }

        if (heading.matches("ul > li")) {
          const marker = unorderedListHeading(heading, container);
          if (!marker) {
            return;
          }

          seen.add(heading);
          headings.push({
            element: heading,
            level: 3,
            title: marker.title,
            id: heading.id || `gpt-paragraph-heading-${headings.length + 1}`,
            sourceType: marker.sourceType
          });
          return;
        }

        if (heading.matches("ol > li")) {
          const marker = orderedListHeading(heading, container);
          if (!marker) {
            return;
          }

          seen.add(heading);
          headings.push({
            element: heading,
            level: 3,
            title: marker.title,
            id: heading.id || `gpt-paragraph-heading-${headings.length + 1}`,
            sourceType: marker.sourceType
          });
        }
      });
    });

    collectTableHeadings(containers, seen, headings, scanContext);
    collectYuanbaoVideoCardHeadings(seen, headings, scanContext);
    collectQianwenVideoListHeadings(seen, headings, scanContext);
    const platformKey = currentPlatformKey();
    const maxHeadingLevel = maxHeadingLevelForPlatform(platformKey);
    const enabledLevels = new Set(enabledLevelsForCurrentPlatform());
    const strongEnabled = enabledStrongForPlatform(platformKey);
    const orderedListEnabled = enabledOrderedListForPlatform(platformKey);
    const unorderedListEnabled = enabledUnorderedListForPlatform(platformKey);
    const usableHeadings = headings.filter((item) => {
      if (item.title.length <= 0) {
        return false;
      }
      if (item.sourceType === "hashed-markdown") {
        return item.level >= 1 && item.level <= 6;
      }
      if (!applyConfig) {
        return item.level <= maxHeadingLevel;
      }
      if (item.sourceType === "unordered-list") {
        return unorderedListEnabled;
      }
      if (item.sourceType === "ordered-list") {
        return orderedListEnabled;
      }
      if (item.sourceType === "strong") {
        return strongEnabled;
      }
      return item.level <= maxHeadingLevel && enabledLevels.has(item.level);
    });
    return usableHeadings.sort((left, right) => compareConversationPosition(left.element, right.element, scanContext));
  }

  function debugCollection(containers, headings, metrics) {
    const signature = [
      containers.length,
      headings.length,
      Math.round(metrics.length)
    ].join(":");

    if (signature === state.lastDebugSignature) {
      return;
    }

    state.lastDebugSignature = signature;
    recordDiagnosticEvent("scan_summary", {
      assistantContainers: containers.length,
      usableHeadings: headings.length,
      conversationLength: Math.round(metrics.length)
    });
    console.info("[Polaris: AI Chat Navigator] scan", {
      assistantContainers: containers.length,
      usableHeadings: headings.length,
      conversationLength: Math.round(metrics.length),
      titles: headings.slice(0, 8).map((heading) => heading.title)
    });
  }

  function ensureHeadingIds(headings) {
    headings.forEach((item) => {
      if (item.element instanceof HTMLElement && !item.element.id) {
        item.element.id = item.id;
      }
    });
  }

  function getConversationMetrics(containers, scanContext = null) {
    const visibleContainers = containers.filter((container) => isVisible(container, scanContext));
    if (!visibleContainers.length) {
      return getDocumentMetrics();
    }

    const positions = visibleContainers.map((container) => {
      const rect = scanContext ? scanContext.rectFor(container) : container.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY
      };
    });

    const top = Math.min(...positions.map((position) => position.top));
    const bottom = Math.max(...positions.map((position) => position.bottom));
    if (bottom <= top) {
      return getDocumentMetrics();
    }

    return {
      top,
      bottom,
      length: bottom - top
    };
  }

  function getDocumentMetrics() {
    const documentHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight
    );
    return {
      top: 0,
      bottom: documentHeight,
      length: documentHeight
    };
  }

  function normalizeSearchQuery(query) {
    return Array.from(query || "")
      .filter((char) => char.trim().length > 0)
      .join("")
      .toLocaleLowerCase();
  }

  function matchesSearch(query, title) {
    const needle = Array.from(normalizeSearchQuery(query));
    if (!needle.length) {
      return true;
    }

    const haystack = Array.from(normalizeSearchQuery(title));
    let needleIndex = 0;
    for (const char of haystack) {
      if (char === needle[needleIndex]) {
        needleIndex += 1;
        if (needleIndex === needle.length) {
          return true;
        }
      }
    }
    return false;
  }

  function isHeadingEnabledForCurrentConfig(heading) {
    const platformKey = currentPlatformKey();
    if (heading.sourceType === "hashed-markdown") {
      return heading.level >= 1 && heading.level <= 6;
    }
    if (heading.sourceType === "unordered-list") {
      return enabledUnorderedListForPlatform(platformKey);
    }
    if (heading.sourceType === "ordered-list") {
      return enabledOrderedListForPlatform(platformKey);
    }
    if (heading.sourceType === "strong") {
      return enabledStrongForPlatform(platformKey);
    }
    return heading.level <= maxHeadingLevelForPlatform(platformKey)
      && enabledLevelsForCurrentPlatform().includes(heading.level);
  }

  function filteredHeadings(headings = state.headings) {
    if (!normalizeSearchQuery(state.markerSearchQuery)) {
      return headings;
    }
    return headings.filter((heading) => matchesSearch(state.markerSearchQuery, heading.title));
  }

  function filteredMarkerGroups(groups = state.markerGroups) {
    const hasQuery = Boolean(normalizeSearchQuery(state.markerSearchQuery));
    if (!hasQuery) {
      return groups.map((group) => ({
        ...group,
        visibleHeadings: group.headings.filter(isHeadingEnabledForCurrentConfig)
      }));
    }

    return groups
      .map((group) => {
        const userMatches = group.user && matchesSearch(state.markerSearchQuery, group.user.title);
        const enabledHeadings = group.headings.filter(isHeadingEnabledForCurrentConfig);
        const visibleHeadings = userMatches
          ? enabledHeadings
          : enabledHeadings.filter((heading) => matchesSearch(state.markerSearchQuery, heading.title));
        return { ...group, visibleHeadings, userMatches };
      })
      .filter((group) => group.userMatches || group.visibleHeadings.length > 0);
  }

  function limitedMarkerGroups(groups = state.markerGroups) {
    return limitMarkerGroups({
      groups,
      maxVisibleUserGroups: state.config.maxVisibleUserGroups,
      areEarlierUserGroupsExpanded: state.areEarlierUserGroupsExpanded,
      hasSearchQuery: Boolean(normalizeSearchQuery(state.markerSearchQuery))
    });
  }

  function filteredExplosionSections(sections = state.explosionSections) {
    return sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => matchesSearch(state.explosionSearchQuery, section.title));
  }

  function foldEnabledFor(headings = state.headings) {
    return !state.markerSearchQuery && headings.length >= state.config.foldThreshold;
  }

  function fullFoldGroups(headings = state.headings) {
    if (!foldEnabledFor(headings)) {
      return [];
    }

    const size = state.config.foldThreshold;
    const fullGroupCount = Math.floor(headings.length / size);
    return Array.from({ length: fullGroupCount }, (_, index) => ({
      index,
      group: headings.slice(index * size, (index + 1) * size)
    }));
  }

  function trailingHeadings(headings = state.headings) {
    if (!foldEnabledFor(headings)) {
      return headings;
    }
    const size = state.config.foldThreshold;
    return headings.slice(Math.floor(headings.length / size) * size);
  }

  function foldKeyFor(group, index) {
    return `${group.key}:${index}`;
  }

  function markerWidthFor(title) {
    const characterCount = Array.from(title).length;
    return Math.max(24, Math.ceil((characterCount / 50) * 24));
  }

  function markerPreviewFor(title) {
    return title;
  }

  function markerKeyFor(element) {
    return runtimeMarkerKeySequence.keyFor(element);
  }

  function markerKeyForHeading(heading) {
    return existingMakerKeyForHeading(heading) || markerKeyFor(heading.element);
  }

  function existingMakerKeyForHeading(heading) {
    return heading.makerKey || heading.markerKey || "";
  }

  function nearestVerticalScrollContainer(element) {
    for (let parent = element.parentElement; parent instanceof HTMLElement; parent = parent.parentElement) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (parent.scrollHeight > parent.clientHeight && /^(auto|scroll|overlay)$/.test(overflowY)) {
        return parent;
      }
    }
    return null;
  }

  function jumpToMarker(heading, behavior) {
    const scrollContainer = nearestVerticalScrollContainer(heading.element);
    const scrollContainerStyle = scrollContainer ? window.getComputedStyle(scrollContainer) : null;
    return scrollMarkerIntoView({
      element: heading.element,
      scrollContainer,
      reverseFlow: scrollContainerStyle?.display === "flex" && scrollContainerStyle.flexDirection === "column-reverse",
      headerHeight: getConversationHeaderHeight(),
      gap: TABLE_MARKER_SCROLL_GAP,
      behavior
    });
  }

  function currentElementForHeading(heading) {
    if (heading.element instanceof HTMLElement && heading.element.isConnected) {
      return heading.element;
    }
    const element = document.getElementById(heading.id);
    if (element instanceof HTMLElement && element.isConnected && heading.sourceType !== "table") {
      return element;
    }
    if (heading.sourceType !== "table") {
      return null;
    }
    const currentTable = tableMarkerEntryForTarget(
      tableMarkerCandidates(getAssistantContainers()),
      heading.tableMarkerIndex,
      heading.title,
      heading.tableMarkerFingerprint
    );
    return currentTable && currentTable.element instanceof HTMLElement && currentTable.element.isConnected
      ? currentTable.element
      : null;
  }

  function jumpToHeading(heading, behavior = "smooth") {
    const element = currentElementForHeading(heading);
    if (!element) {
      return false;
    }
    const currentHeading = element === heading.element ? heading : { ...heading, element };
    const didJump = jumpToMarker(currentHeading, behavior);
    if (!didJump) {
      return false;
    }
    window.history.replaceState(null, "", `#${encodeURIComponent(element.id)}`);
    return true;
  }

  function scrollMarkerIntoListView(marker) {
    const list = getList();
    const markerRect = marker.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const topOverflow = listRect.top - markerRect.top;
    const bottomOverflow = markerRect.bottom - listRect.bottom;

    if (topOverflow > 0) {
      list.scrollTop -= topOverflow + 8;
    } else if (bottomOverflow > 0) {
      list.scrollTop += bottomOverflow + 8;
    }
  }

  function getLiquidGlassDisplacementMap({ height, width, radius, depth }) {
    const yStart = Math.ceil((radius / height) * 15);
    const yEnd = Math.floor(100 - (radius / height) * 15);
    const xStart = Math.ceil((radius / width) * 15);
    const xEnd = Math.floor(100 - (radius / width) * 15);
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>.mix { mix-blend-mode: screen; }</style>
  <defs>
    <linearGradient id="Y" x1="0" x2="0" y1="${yStart}%" y2="${yEnd}%">
      <stop offset="0%" stop-color="#0F0" />
      <stop offset="100%" stop-color="#000" />
    </linearGradient>
    <linearGradient id="X" x1="${xStart}%" x2="${xEnd}%" y1="0" y2="0">
      <stop offset="0%" stop-color="#F00" />
      <stop offset="100%" stop-color="#000" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" height="${height}" width="${width}" fill="#808080" />
  <g filter="blur(2px)">
    <rect x="0" y="0" height="${height}" width="${width}" fill="#000080" />
    <rect x="0" y="0" height="${height}" width="${width}" fill="url(#Y)" class="mix" />
    <rect x="0" y="0" height="${height}" width="${width}" fill="url(#X)" class="mix" />
    <rect x="${depth}" y="${depth}" height="${Math.max(1, height - 2 * depth)}" width="${Math.max(1, width - 2 * depth)}" fill="#808080" rx="${radius}" ry="${radius}" filter="blur(${depth}px)" />
  </g>
</svg>`);
  }

  function getLiquidGlassDisplacementFilter({ height, width, radius, depth, strength, chromaticAberration }) {
    const displacementMap = getLiquidGlassDisplacementMap({ height, width, radius, depth });
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="displace" color-interpolation-filters="sRGB">
      <feImage x="0" y="0" height="${height}" width="${width}" href="${displacementMap}" result="displacementMap" />
      <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength + chromaticAberration * 2}" xChannelSelector="R" yChannelSelector="G" />
      <feColorMatrix type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedR" />
      <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength + chromaticAberration}" xChannelSelector="R" yChannelSelector="G" />
      <feColorMatrix type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedG" />
      <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength}" xChannelSelector="R" yChannelSelector="G" />
      <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="displacedB" />
      <feBlend in="displacedR" in2="displacedG" mode="screen" />
      <feBlend in2="displacedB" mode="screen" />
    </filter>
  </defs>
</svg>`) + "#displace";
  }

  function getLiquidGlassObserver() {
    if (typeof ResizeObserver === "undefined") {
      return null;
    }
    if (!state.liquidGlassObserver) {
      state.liquidGlassObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.target instanceof HTMLElement) {
            updateLiquidGlassFilter(entry.target);
          }
        });
      });
    }
    return state.liquidGlassObserver;
  }

  function syncLiquidGlassElements(root = getRoot()) {
    state.liquidGlassElements.forEach((element) => {
      if (!element.isConnected || !root.contains(element)) {
        const observer = getLiquidGlassObserver();
        if (observer) {
          observer.unobserve(element);
        }
        state.liquidGlassElements.delete(element);
        liquidGlassSignatures.delete(element);
      }
    });
    root.querySelectorAll(LIQUID_GLASS_SELECTOR).forEach((element) => {
      if (element instanceof HTMLElement) {
        observeLiquidGlassElement(element);
      }
    });
  }

  function observeLiquidGlassElement(element) {
    if (state.liquidGlassElements.has(element)) {
      return;
    }
    state.liquidGlassElements.add(element);
    const observer = getLiquidGlassObserver();
    if (observer) {
      observer.observe(element);
    }
    updateLiquidGlassFilter(element);
  }

  function updateLiquidGlassFilter(element) {
    // Displacement glass is disabled. Registration stays so scans do not rebuild
    // SVG filters; surfaces use the flat token palette instead.
    if (element instanceof HTMLElement) {
      element.style.setProperty("--gpt-liquid-glass-filter", "none");
    }
    liquidGlassSignatures.delete(element);
    return;
    const rect = element.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width <= 0 || height <= 0) {
      element.style.removeProperty("--gpt-liquid-glass-filter");
      liquidGlassSignatures.delete(element);
      return;
    }

    const style = window.getComputedStyle(element);
    const radius = Math.max(0, Math.round(parseFloat(style.borderTopLeftRadius) || 0));
    const depth = Math.max(3, Math.min(10, Math.round(Math.min(width, height) / 4)));
    const strength = Math.max(18, Math.min(42, Math.round(Math.min(width, height) * 1.2)));
    const chromaticAberration = 1;
    const signature = `${width}:${height}:${radius}:${depth}:${strength}:${chromaticAberration}`;
    if (liquidGlassSignatures.get(element) === signature) {
      return;
    }

    const filterUrl = getLiquidGlassDisplacementFilter({
      height,
      width,
      radius,
      depth,
      strength,
      chromaticAberration
    });
    element.style.setProperty("--gpt-liquid-glass-filter", `url("${filterUrl}")`);
    liquidGlassSignatures.set(element, signature);
  }

  function requestActiveMarkerListScrollPersistence() {
    markerListScrollPersistence.request();
  }

  function markerRenderSignature(values) {
    return JSON.stringify(values);
  }

  function aiMarkerRenderItem(heading) {
    const markerKey = markerKeyForHeading(heading);
    const title = heading.title;
    return {
      key: `ai:${markerKey}`,
      type: "ai",
      markerKey,
      level: heading.level,
      title,
      preview: markerPreviewFor(title),
      width: markerWidthFor(title),
      signature: markerRenderSignature(["ai", heading.level, title])
    };
  }

  function foldMarkerRenderItem(headings, foldKey) {
    const first = headings[0];
    const remainingCount = headings.length - 1;
    const isExpanded = isFoldGroupExpanded({
      foldKey,
      collapsedKeys: state.collapsedFoldGroups
    });
    const ariaLabel = isExpanded
      ? t("fold.collapseAria", { title: first.title, count: remainingCount })
      : t("fold.expandAria", { title: first.title, count: remainingCount });
    const remainder = t("fold.remainder", { count: remainingCount });
    return {
      key: `fold:${foldKey}`,
      type: "fold",
      foldKey,
      isExpanded,
      ariaLabel,
      title: first.title,
      preview: markerPreviewFor(first.title),
      remainder,
      signature: markerRenderSignature(["fold", isExpanded, ariaLabel, first.title, headings.length, remainder])
    };
  }

  function showMarkerNotice(message) {
    const root = getRoot();
    root.querySelectorAll(".gpt-paragraph-nav__marker-notice").forEach((notice) => notice.remove());
    const notice = document.createElement("div");
    notice.className = "gpt-paragraph-nav__marker-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.textContent = message;
    root.appendChild(notice);
    lifecycle.requestAnimationFrame(() => notice.classList.add("is-visible"));
    lifecycle.clearTimeout(state.markerNoticeTimer);
    state.markerNoticeTimer = lifecycle.setTimeout(() => {
      notice.classList.remove("is-visible");
      lifecycle.setTimeout(() => notice.remove(), 180);
    }, 2200);
  }

  function userMarkerRenderItem(group, isExpanded) {
    const { user } = group;
    const baseAriaLabel = isExpanded
      ? t("userMarker.collapseAria", { title: user.title })
      : t("userMarker.expandAria", { title: user.title });
    const imageCountAria = user.isImageOnly && user.imageCount > 0
      ? `, ${t("userMarker.imageCountAria", { count: user.imageCount })}`
      : "";
    const ariaLabel = `${baseAriaLabel}${imageCountAria}`;
    const preview = markerPreviewFor(user.previewTitle);
    return {
      key: `user:${group.key}`,
      type: "user",
      groupKey: group.key,
      isExpanded,
      ariaLabel,
      title: user.title,
      preview,
      thumbnailSrc: user.thumbnailSrc,
      imageCount: user.imageCount,
      imageUrls: user.imageUrls,
      isImageOnly: user.isImageOnly,
      width: markerWidthFor(user.previewTitle),
      signature: markerRenderSignature(["user", isExpanded, ariaLabel, user.title, preview, user.imageUrls, user.thumbnailSrc, user.imageCount, user.isImageOnly])
    };
  }

  function earlierUserGroupsRenderItem(count) {
    const isExpanded = state.areEarlierUserGroupsExpanded;
    const label = t("userMarker.earlierGroups", { count });
    const ariaLabel = isExpanded
      ? t("userMarker.collapseEarlierAria", { count })
      : t("userMarker.expandEarlierAria", { count });
    return {
      key: "earlier-user-groups",
      type: "earlier",
      isExpanded,
      ariaLabel,
      preview: label,
      width: markerWidthFor(label),
      signature: markerRenderSignature(["earlier", isExpanded, ariaLabel, label])
    };
  }

  function createMarkerRenderRow(item) {
    if (item.type === "empty") {
      const empty = document.createElement("div");
      empty.className = "gpt-paragraph-nav__search-empty";
      empty.dataset.markerRenderKey = item.key;
      empty.textContent = item.message;
      return empty;
    }

    const row = document.createElement("div");
    const markerShell = document.createElement("div");
    markerShell.className = "gpt-paragraph-nav__marker-shell";
    const marker = document.createElement("button");
    marker.type = "button";
    marker.dataset.markerItemType = item.type;
    markerShell.appendChild(marker);
    row.appendChild(markerShell);

    if (item.type === "fold") {
      const label = document.createElement("span");
      label.className = "gpt-paragraph-nav__fold-label";
      marker.appendChild(label);

      const remainder = document.createElement("span");
      remainder.className = "gpt-paragraph-nav__fold-remainder";
      marker.appendChild(remainder);

      const chevron = document.createElement("span");
      chevron.className = "gpt-paragraph-nav__fold-chevron";
      chevron.setAttribute("aria-hidden", "true");
      marker.appendChild(chevron);
    } else {
      if (item.type === "user") {
        const thumbnail = document.createElement("img");
        thumbnail.className = "gpt-paragraph-nav__user-thumbnail";
        thumbnail.alt = "";
        thumbnail.loading = "lazy";
        thumbnail.decoding = "async";
        thumbnail.addEventListener("error", () => {
          const failedSrc = thumbnail.getAttribute("src") || "";
          if (failedSrc) {
            thumbnail.dataset.failedSrc = failedSrc;
          }
          thumbnail.hidden = true;
          thumbnail.nextElementSibling.hidden = true;
        });
        marker.appendChild(thumbnail);

        const imageCount = document.createElement("span");
        imageCount.className = "gpt-paragraph-nav__user-image-count";
        imageCount.setAttribute("aria-hidden", "true");
        marker.appendChild(imageCount);
      }

      if (item.type === "ai") {
        const streamingLoader = document.createElement("img");
        streamingLoader.className = "gpt-paragraph-nav__streaming-loader";
        streamingLoader.src = chrome.runtime.getURL("icons/loader-2.svg");
        streamingLoader.alt = "";
        streamingLoader.setAttribute("aria-hidden", "true");
        marker.appendChild(streamingLoader);
      }

      const preview = document.createElement("span");
      preview.className = "gpt-paragraph-nav__preview";
      marker.appendChild(preview);

      if (item.type === "user" || item.type === "earlier") {
        const chevron = document.createElement("span");
        chevron.className = "gpt-paragraph-nav__user-chevron";
        chevron.setAttribute("aria-hidden", "true");
        marker.appendChild(chevron);
      }

      if (item.type !== "earlier") {
        const label = document.createElement("span");
        label.className = `gpt-paragraph-nav__label${item.type === "user" ? " gpt-paragraph-nav__label--user" : ""}`;
        if (item.type === "user") {
          const labelThumbnailWrap = document.createElement("span");
          labelThumbnailWrap.className = "gpt-paragraph-nav__label-thumbnail-wrap";

          const labelThumbnail = document.createElement("img");
          labelThumbnail.className = "gpt-paragraph-nav__label-thumbnail";
          labelThumbnail.alt = "";
          labelThumbnail.loading = "lazy";
          labelThumbnail.decoding = "async";
          labelThumbnail.tabIndex = -1;
          labelThumbnail.setAttribute("role", "button");
          labelThumbnail.setAttribute("aria-label", t("userMarker.openImage"));
          labelThumbnail.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openImagePreview(userImagePreviewSources.get(labelThumbnail) || [], labelThumbnail);
          });
          labelThumbnail.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            openImagePreview(userImagePreviewSources.get(labelThumbnail) || [], labelThumbnail);
          });
          labelThumbnail.addEventListener("error", () => {
            const failedSrc = labelThumbnail.getAttribute("src") || "";
            if (failedSrc) {
              labelThumbnail.dataset.failedSrc = failedSrc;
            }
            labelThumbnail.hidden = true;
            labelThumbnail.tabIndex = -1;
            labelThumbnailWrap.hidden = true;
          });
          const zoomIcon = document.createElement("span");
          zoomIcon.className = "gpt-paragraph-nav__label-thumbnail-zoom";
          zoomIcon.setAttribute("aria-hidden", "true");
          zoomIcon.appendChild(createImagePreviewZoomIcon());
          labelThumbnailWrap.append(labelThumbnail, zoomIcon);
          label.appendChild(labelThumbnailWrap);

          const labelText = document.createElement("span");
          labelText.className = "gpt-paragraph-nav__label-text";
          label.appendChild(labelText);
        }
        markerShell.appendChild(label);
      }
    }

    updateMarkerRenderRow(row, item);
    return row;
  }

  function updateMarkerRenderRow(row, item) {
    if (item.type === "empty") {
      row.textContent = item.message;
      return;
    }

    row.className = `gpt-paragraph-nav__marker-row gpt-paragraph-nav__marker-row--${item.type === "user" || item.type === "earlier" ? "user" : "ai"}`;
    row.dataset.markerRenderKey = item.key;
    const marker = row.firstElementChild?.firstElementChild;
    if (!(marker instanceof HTMLButtonElement)) {
      return;
    }
    marker.dataset.markerItemType = item.type;

    if (item.type === "fold") {
      marker.className = "gpt-paragraph-nav__fold";
      marker.classList.toggle("is-expanded", item.isExpanded);
      marker.dataset.foldKey = item.foldKey;
      marker.setAttribute("aria-expanded", String(item.isExpanded));
      marker.setAttribute("aria-label", item.ariaLabel);
      marker.title = item.title;
      marker.querySelector(".gpt-paragraph-nav__fold-label").textContent = item.preview;
      marker.querySelector(".gpt-paragraph-nav__fold-remainder").textContent = item.remainder;
      return;
    }

    const wasActive = marker.classList.contains("is-active");
    marker.className = item.type === "ai"
      ? `gpt-paragraph-nav__marker gpt-paragraph-nav__marker--ai level-${item.level}`
      : "gpt-paragraph-nav__marker gpt-paragraph-nav__marker--user";
    marker.classList.toggle("is-active", wasActive);
    marker.style.setProperty("--marker-width", `${item.width}px`);
    marker.setAttribute("aria-label", item.ariaLabel || item.title);
    marker.querySelector(".gpt-paragraph-nav__preview").textContent = item.preview;

    if (item.type === "ai") {
      marker.dataset.markerKey = item.markerKey;
      row.querySelector(".gpt-paragraph-nav__label").textContent = item.title;
      return;
    }

    marker.setAttribute("aria-expanded", String(item.isExpanded));
    if (item.type === "user") {
      marker.dataset.userMarkerKey = item.groupKey;
      const label = row.querySelector(".gpt-paragraph-nav__label");
      const labelText = label.querySelector(".gpt-paragraph-nav__label-text");
      labelText.textContent = item.title;
      label.classList.toggle("is-image-only", item.isImageOnly);
      const labelThumbnail = label.querySelector(".gpt-paragraph-nav__label-thumbnail");
      const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
      userImagePreviewSources.set(labelThumbnail, imageUrls);
      labelThumbnail.tabIndex = imageUrls.length ? 0 : -1;
      labelThumbnail.setAttribute(
        "aria-label",
        imageUrls.length > 0
          ? `${t("userMarker.openImage")}, ${t("userMarker.imageCountAria", { count: imageUrls.length })}`
          : t("userMarker.openImage")
      );
      const previousLabelSrc = labelThumbnail.getAttribute("src") || "";
      if (previousLabelSrc !== item.thumbnailSrc) {
        delete labelThumbnail.dataset.failedSrc;
      }
      labelThumbnail.hidden = !item.thumbnailSrc || labelThumbnail.dataset.failedSrc === item.thumbnailSrc;
      const labelThumbnailWrap = labelThumbnail.closest(".gpt-paragraph-nav__label-thumbnail-wrap");
      if (labelThumbnailWrap instanceof HTMLElement) {
        labelThumbnailWrap.hidden = labelThumbnail.hidden;
      }
      if (item.thumbnailSrc && previousLabelSrc !== item.thumbnailSrc) {
        labelThumbnail.src = item.thumbnailSrc;
      } else if (!item.thumbnailSrc && previousLabelSrc) {
        labelThumbnail.removeAttribute("src");
      }
      marker.classList.toggle("is-image-only", item.isImageOnly);
      const thumbnail = marker.querySelector(".gpt-paragraph-nav__user-thumbnail");
      const previousSrc = thumbnail.getAttribute("src") || "";
      if (previousSrc !== item.thumbnailSrc) {
        delete thumbnail.dataset.failedSrc;
      }
      thumbnail.hidden = !item.thumbnailSrc || thumbnail.dataset.failedSrc === item.thumbnailSrc;
      if (item.thumbnailSrc && thumbnail.getAttribute("src") !== item.thumbnailSrc) {
        thumbnail.src = item.thumbnailSrc;
      } else if (!item.thumbnailSrc && previousSrc) {
        thumbnail.removeAttribute("src");
      }
      const imageCount = marker.querySelector(".gpt-paragraph-nav__user-image-count");
      imageCount.hidden = item.imageCount < 2;
      imageCount.textContent = item.imageCount > 1 ? `+${item.imageCount - 1}` : "";
      syncOpenImagePreviewForThumbnail(labelThumbnail);
    }
  }

  async function handleMarkerListClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const marker = event.target.closest("[data-marker-item-type]");
    const list = event.currentTarget;
    if (!(marker instanceof HTMLButtonElement) || !(list instanceof HTMLElement) || !list.contains(marker)) {
      return;
    }

    if (marker.dataset.markerItemType === "ai") {
      const markerKey = marker.dataset.markerKey || "";
      const heading = state.headings.find((item) => markerKeyForHeading(item) === markerKey);
      if (!heading || !jumpToHeading(heading)) {
        if (heading) {
          showMarkerNotice(t("userMarker.replyNotLoaded"));
        }
        return;
      }
      state.activeMarkerKey = markerKey;
      const activeMarker = syncActiveMarker(state.activeMarkerKey);
      requestActiveMarkerListScrollPersistence();
      updateFloatingActiveMarker(activeMarker);
      return;
    }

    if (marker.dataset.markerItemType === "fold") {
      const foldKey = marker.dataset.foldKey || "";
      toggleFoldGroupExpansion({
        foldKey,
        collapsedKeys: state.collapsedFoldGroups
      });
      render();
      return;
    }

    if (marker.dataset.markerItemType === "earlier") {
      state.areEarlierUserGroupsExpanded = !state.areEarlierUserGroupsExpanded;
      render();
      return;
    }

    const groupKey = marker.dataset.userMarkerKey || "";
    const group = state.markerGroups.find((item) => item.key === groupKey);
    if (!group) {
      return;
    }
    if (shouldShowUserMarkerNotLoadedNotice({
      isChatGPT: isChatGPTPage(),
      hasAssistantMessage: group.hasAssistantMessage,
      hasMarkers: group.headings.length > 0,
      groupKey,
      latestGroupKey: state.latestUserMarkerKey
    })) {
      showMarkerNotice(t("userMarker.replyNotLoaded"));
      return;
    }
    if (state.collapsedUserMarkerKeys.has(groupKey)) {
      state.collapsedUserMarkerKeys.delete(groupKey);
    } else {
      state.collapsedUserMarkerKeys.add(groupKey);
    }
    render();
  }

  function displayedHeadingCount(group, headings) {
    if (!headings.length) {
      return 0;
    }
    if (!foldEnabledFor(headings)) {
      return headings.length;
    }

    const groups = fullFoldGroups(headings);
    const trailing = trailingHeadings(headings);
    return groups.reduce((count, { index, group: foldedHeadings }) => (
      count + 1 + (isFoldGroupExpanded({
        foldKey: foldKeyFor(group, index),
        collapsedKeys: state.collapsedFoldGroups
      }) ? foldedHeadings.length : 0)
    ), trailing.length);
  }

  function markerRenderItemsForGroup(group) {
    const isSearchActive = Boolean(normalizeSearchQuery(state.markerSearchQuery));
    const isExpanded = isUserMarkerExpanded({
      groupKey: group.key,
      hasUser: Boolean(group.user),
      isSearchActive,
      collapsedKeys: state.collapsedUserMarkerKeys
    });
    const items = [];

    if (group.user) {
      items.push(userMarkerRenderItem(group, isExpanded));
    }

    if (isExpanded && group.visibleHeadings.length) {
      const foldEnabled = foldEnabledFor(group.visibleHeadings);
      const groups = foldEnabled ? fullFoldGroups(group.visibleHeadings) : [];
      const trailing = foldEnabled ? trailingHeadings(group.visibleHeadings) : group.visibleHeadings;
      groups.forEach(({ group: foldedHeadings, index }) => {
        const foldKey = foldKeyFor(group, index);
        items.push(foldMarkerRenderItem(foldedHeadings, foldKey));
        if (isFoldGroupExpanded({ foldKey, collapsedKeys: state.collapsedFoldGroups })) {
          foldedHeadings.forEach((heading) => items.push(aiMarkerRenderItem(heading)));
        }
      });
      trailing.forEach((heading) => items.push(aiMarkerRenderItem(heading)));
    }
    return items;
  }

  function markerRenderItems(visibleGroups, earlierUserGroupCount) {
    const items = [];
    if (!visibleGroups.length && state.markerSearchQuery) {
      const message = t("search.empty");
      items.push({
        key: "search-empty",
        type: "empty",
        message,
        signature: markerRenderSignature(["empty", message])
      });
      return items;
    }

    let isEarlierUserGroupsControlAppended = false;
    visibleGroups.forEach((group) => {
      if (earlierUserGroupCount && !isEarlierUserGroupsControlAppended && group.user) {
        items.push(earlierUserGroupsRenderItem(earlierUserGroupCount));
        isEarlierUserGroupsControlAppended = true;
      }
      items.push(...markerRenderItemsForGroup(group));
    });
    if (earlierUserGroupCount && !isEarlierUserGroupsControlAppended) {
      items.push(earlierUserGroupsRenderItem(earlierUserGroupCount));
    }
    return items;
  }

  function serializableWindowMarkerItem(item) {
    return {
      key: item.key,
      type: item.type,
      markerKey: item.markerKey || "",
      groupKey: item.groupKey || "",
      foldKey: item.foldKey || "",
      title: item.title || "",
      preview: item.preview || "",
      remainder: item.remainder || "",
      ariaLabel: item.ariaLabel || "",
      isExpanded: Boolean(item.isExpanded),
      level: item.level || 0,
      thumbnailSrc: standaloneWindowImageSource(item.thumbnailSrc),
      imageUrls: [],
      imageCount: Number(item.imageCount) || 0,
      isImageOnly: Boolean(item.isImageOnly)
    };
  }

  function standaloneWindowImageSource(source) {
    const value = safeUserMessageImageUrl(source, window.location.href);
    if (!value) {
      return "";
    }
    if (standaloneWindowImageCache.has(value)) {
      return standaloneWindowImageCache.get(value) || "";
    }
    if (!standaloneWindowImagePromises.has(value)) {
      const promise = inlineUserMessageImageSource(value, { pageUrl: window.location.href }).then((dataUrl) => {
        const resolved = dataUrl || (value.startsWith("blob:") ? "" : value);
        standaloneWindowImageCache.set(value, resolved);
        return resolved;
      }).catch(() => {
        const resolved = value.startsWith("blob:") ? "" : value;
        standaloneWindowImageCache.set(value, resolved);
        return resolved;
      }).finally(() => {
        standaloneWindowImagePromises.delete(value);
      });
      standaloneWindowImagePromises.set(value, promise);
      void promise.then((resolved) => {
        if (resolved) {
          publishWindowSnapshot();
        }
      });
    }
    return "";
  }

  async function standaloneWindowImageUrlsForSources(sources) {
    const values = Array.from(new Set(Array.isArray(sources) ? sources : []))
      .map((source) => safeUserMessageImageUrl(source, window.location.href))
      .filter(Boolean)
      .slice(0, 8);
    const result = {
      imageUrls: await Promise.all(values.map((value) => {
        if (standaloneWindowImageCache.has(value)) {
          return standaloneWindowImageCache.get(value) || "";
        }
        return standaloneWindowImagePromises.get(value)
          || inlineUserMessageImageSource(value, { pageUrl: window.location.href }).then((dataUrl) => {
            const resolved = dataUrl || (value.startsWith("blob:") ? "" : value);
            standaloneWindowImageCache.set(value, resolved);
            return resolved;
          }).catch(() => {
            const resolved = value.startsWith("blob:") ? "" : value;
            standaloneWindowImageCache.set(value, resolved);
            return resolved;
          });
      }))
    };
    return result.imageUrls.filter(Boolean);
  }

  function windowSnapshot() {
    const filteredGroups = filteredMarkerGroups(state.markerGroups);
    const { groups, earlierUserGroupCount } = limitedMarkerGroups(filteredGroups);
    let items = markerRenderItems(groups, earlierUserGroupCount)
      .map(serializableWindowMarkerItem);
    const indexed = conversationIndex.enabled() ? conversationIndex.outline(state.config) : null;
    let allMarkerItems = null;
    if (indexed?.items.length) {
      const indexedGroups = [];
      for (const item of indexed.items) {
        if (item.type === "user") indexedGroups.push({ key: item.groupKey, user: { ...item, previewTitle: item.title }, headings: [], visibleHeadings: [], hasAssistantMessage: true });
        else {
          let group = indexedGroups.at(-1);
          if (!group) { group = { key: "index:orphan", headings: [], visibleHeadings: [], hasAssistantMessage: true }; indexedGroups.push(group); }
          group.headings.push(item); group.visibleHeadings.push(item);
        }
      }
      const limited = limitedMarkerGroups(indexedGroups);
      items = markerRenderItems(limited.groups, limited.earlierUserGroupCount).map(serializableWindowMarkerItem);
      allMarkerItems = indexed.items;
    }
    const root = document.getElementById(ROOT_ID);
    const fallbackTheme = window.matchMedia(PAGE_THEME_MEDIA_QUERY).matches ? "dark" : "light";
    return {
      activeMarkerKey: state.activeMarkerKey,
      config: JSON.parse(JSON.stringify(state.config)),
      hasConversation: Boolean(indexed?.items.length || state.markerSourceContainers.length > 0),
      conversationIndex: conversationIndex.snapshot(),
      conversationLoading: conversationReading(),
      conversationStalled: conversationCover.isStalled(),
      conversationTitle: conversationIndex.snapshot()?.title || conversationIndex.title(),
      allMarkerItems,
      headings: state.headings.map((heading) => ({
        id: heading.id,
        markerKey: markerKeyForHeading(heading),
        title: heading.title,
        level: heading.level
      })),
      markerItems: items,
      model: currentModelLabel(),
      platform: currentPlatformKey(),
      revision: Date.now(),
      releaseNotes: releaseNotesForUpdate(null, extensionMetadata.releaseVersion, 1).map((note) => ({
        changes: note[locale]?.changes || [],
        title: note[locale]?.title || "",
        version: note.version
      })),
      routeKey: currentRouteKey(),
      supportedRoute: isSupportedRoute(),
      theme: root?.dataset.pageTheme || fallbackTheme,
      version: extensionMetadata.version || ""
    };
  }

  let reportNextSnapshotDelivery = false;
  let lastRouteFallbackDiagnosticKey = "";

  function routeFallbackDetails(snapshot, response, error) {
    return {
      routeKey: currentRouteKey(),
      hostname: window.location.hostname,
      messageNodes: state.markerSourceContainers.length,
      hashedMarkdownRoots: document.querySelectorAll(HASHED_MARKDOWN_ROOT_SELECTOR).length,
      sections: Array.isArray(snapshot?.headings) ? snapshot.headings.length : 0,
      markerCount: Array.isArray(snapshot?.markerItems) ? snapshot.markerItems.length : 0,
      sentToBackground: !error,
      acceptedBySidePanel: Boolean(response?.acceptedBySidePanel),
      reason: error ? (error?.message || String(error)) : (response?.reason || "")
    };
  }

  function logRouteFallbackDelivery(snapshot, response, error) {
    const details = routeFallbackDetails(snapshot, response, error);
    const diagnostic = routeFallbackDiagnosticDecision(lastRouteFallbackDiagnosticKey, details);
    if (!diagnostic.shouldLog) {
      return;
    }
    lastRouteFallbackDiagnosticKey = diagnostic.key;
    const level = routeFallbackLogLevel(details);
    console.info(`${routeFallbackLogMessage(details)} level=${level}`);
  }

  function publishWindowSnapshot() {
    if (!isTopLevelFrame() || !isExtensionContextValid()) {
      reportNextSnapshotDelivery = false;
      return;
    }
    const reportDelivery = reportNextSnapshotDelivery;
    reportNextSnapshotDelivery = false;
    lifecycle.clearTimeout(state.windowSnapshotTimer);
    state.windowSnapshotTimer = lifecycle.setTimeout(() => {
      state.windowSnapshotTimer = 0;
      const snapshot = windowSnapshot();
      const message = {
        type: "POLARIS_CONTENT_STATE",
        snapshot,
        reportDelivery
      };
      if (!reportDelivery) {
        sendRuntimeMessage(chrome, message);
        return;
      }
      let pending = null;
      try {
        pending = chrome.runtime.sendMessage(message);
      } catch (error) {
        logRouteFallbackDelivery(snapshot, null, error);
        return;
      }
      Promise.resolve(pending).then((response) => {
        logRouteFallbackDelivery(snapshot, response, null);
      }).catch((error) => {
        logRouteFallbackDelivery(snapshot, null, error);
      });
    }, 0);
  }

  let chapterContentRevision = 0;
  let lastChapterPublication = "";
  function publishWindowChapters({ onlyIfChanged = false } = {}) {
    if (!isTopLevelFrame() || !isExtensionContextValid()) {
      return;
    }
    const publicationKey = JSON.stringify([currentRouteKey(), chapterContentRevision, state.config]);
    if (onlyIfChanged && publicationKey === lastChapterPublication) return;
    lastChapterPublication = publicationKey;
    if (conversationIndex.enabled() && conversationIndex.snapshot()?.count) {
      const outline = conversationIndex.outline(state.config);
      sendRuntimeMessage(chrome, { type: "POLARIS_WINDOW_CHAPTERS", routeKey: currentRouteKey(),
        generation: conversationIndex.snapshot().generation, chapters: [],
        treeChapters: outline.chapters.map((node) => ({ ...node,
          title: node.title || (locale === "zh" ? "全文" : "Full text"),
          contents: node.contents.map((part) => part.type === "child" ? part : { type: "block", lazy: true }) })) });
      return;
    }
    const treeChapters = [];
    const sections = collectWindowChapterSections(treeChapters).map((section) => ({
      id: section.id,
      markerKey: section.markerKey,
      depth: section.depth || 0,
      parentKey: section.parentKey || "",
      blocks: (section.blocks || []).map((block) => ({
        hasImage: Boolean(block.hasImage),
        tagName: ["ul", "ol"].includes(block.tagName) ? "p" : (block.tagName || "p"),
        text: ["ul", "ol"].includes(block.tagName) && block.element instanceof HTMLElement
          ? Array.from(block.element.children)
            .filter((item) => item instanceof HTMLLIElement)
            .map((item, index) => `${block.tagName === "ol" ? `${index + 1}.` : "-"} ${normalizeExplosionText(item.innerText || item.textContent || "")}`)
            .join("\n")
          : (block.text || "")
      })),
      paragraphs: (section.paragraphs || []).filter(Boolean).slice(0, 240),
      title: section.title
    }));
    sendRuntimeMessage(chrome, {
      type: "POLARIS_WINDOW_CHAPTERS",
      routeKey: currentRouteKey(),
      treeChapters,
      chapters: sections
    });
  }

  function mergeWindowConfigPatch(patch) {
    const nextPatch = { ...(patch || {}) };
    [
      "enabledLevelsByPlatform",
      "enabledOrderedListByPlatform",
      "enabledStrongByPlatform",
      "enabledUnorderedListByPlatform"
    ].forEach((key) => {
      if (nextPatch[key] && typeof nextPatch[key] === "object") {
        nextPatch[key] = { ...state.config[key], ...nextPatch[key] };
      }
    });
    state.config = normalizeConfig({ ...state.config, ...nextPatch });
    saveConfig(state.config);
    render();
  }

  function handleWindowCommand(message) {
    if (!message || typeof message.command !== "string") {
      return;
    }
    if (message.expectedRouteKey && message.expectedRouteKey !== currentRouteKey()) return { ok: false, reason: "source-changed" };
    if (message.generation && message.generation !== conversationIndex.snapshot()?.generation) return { ok: false, reason: "source-changed" };
    if (message.command === "search-conversation") return conversationIndex.search(String(message.query || ""), { offset: Number(message.offset) || 0 });
    if (message.command === "get-index-chapter") {
      if (!conversationIndex.enabled()) return { ok: false };
      const chapters = conversationIndex.outline(state.config).chapters;
      if (message.format === "text") return { ok: true, text: chapterTreeText(chapters, String(message.markerKey || "")) };
      const node = chapters.find((item) => item.markerKey === message.markerKey);
      return node ? { ok: true, contents: node.contents, revision: conversationIndex.snapshot().revision } : { ok: false };
    }
    if (message.command === "retry-conversation-index") { conversationIndex.retry(); return { ok: true }; }
    if ((message.command === "jump-to-marker" || message.command === "jump-to-chapter") && String(message.markerKey || "").startsWith("index:")) {
      const route = currentRouteKey(); const generation = conversationIndex.snapshot()?.generation;
      // Sidepanel jumps land instantly, then highlight the target at once.
      return conversationIndex.ensureLocation(message.markerKey, state.config, { instant: true }).then(({ element, reason, fallback }) => {
        if (route !== currentRouteKey() || generation !== conversationIndex.snapshot()?.generation) return { ok: false, reason: "source-changed" };
        if (!element) { recordDiagnosticEvent("locate_request", { kind: "index", outcome: "not-found", reason }); return { ok: false, reason }; }
        const moved = jumpToMarker({ element }, "instant");
        recordDiagnosticEvent("locate_request", { kind: "index", outcome: moved ? "moved" : "scroll-failed", reason: fallback ? "message-fallback" : "" });
        if (moved) {
          flashLocated(element, () => conversationIndex.resolveTarget(message.markerKey, state.config));
          state.activeMarkerKey = message.markerKey; publishWindowSnapshot();
        }
        return { ok: Boolean(moved), reason: moved ? "" : "scroll-failed" };
      });
    }
    if (message.command === "request-state") {
      conversationIndex.configure(state.config.chatgptHistoryMode === "complete" && isTopLevelFrame());
      publishWindowSnapshot();
      return;
    }
    if (message.command === "request-chapters") {
      publishWindowChapters({ onlyIfChanged: Boolean(message.onlyIfChanged) });
      return;
    }
    if (message.command === "request-image-preview") {
      const group = state.markerGroups.find((item) => item.key === String(message.groupKey || ""));
      void standaloneWindowImageUrlsForSources(group?.user?.imageUrls?.slice(0, 8) || [])
        .then((imageUrls) => {
          if (!isExtensionContextValid()) return;
          sendRuntimeMessage(chrome, {
            type: "POLARIS_WINDOW_IMAGE",
            imageUrls
          });
        });
      return;
    }
    if (message.command === "update-config") {
      mergeWindowConfigPatch(message.patch);
      return;
    }
    if (message.command === "reset-config") {
      state.config = normalizeConfig(DEFAULT_CONFIG);
      resetCollapsedGroups();
      saveConfig(state.config);
      render();
      return;
    }
    if (message.command === "download-diagnostics") {
      return handleDownloadDiagnostics();
    }
    if (message.command === "send-diagnostics") {
      return handleSendDiagnostics();
    }
    if (message.command === "toggle-user-group") {
      const groupKey = String(message.groupKey || "");
      if (state.collapsedUserMarkerKeys.has(groupKey)) {
        state.collapsedUserMarkerKeys.delete(groupKey);
      } else if (groupKey) {
        state.collapsedUserMarkerKeys.add(groupKey);
      }
      render();
      return;
    }
    if (message.command === "toggle-fold-group") {
      toggleFoldGroupExpansion({
        foldKey: String(message.foldKey || ""),
        collapsedKeys: state.collapsedFoldGroups
      });
      render();
      return;
    }
    if (message.command === "toggle-earlier-groups") {
      state.areEarlierUserGroupsExpanded = !state.areEarlierUserGroupsExpanded;
      render();
      return;
    }
    if (message.command === "jump-to-marker" || message.command === "jump-to-chapter") {
      if (message.expectedRouteKey && message.expectedRouteKey !== currentRouteKey()) return { ok: false };
      const markerKey = String(message.markerKey || "");
      const heading = state.headings.find((item) => markerKeyForHeading(item) === markerKey);
      if (heading && jumpToHeading(heading, "instant")) {
        recordDiagnosticEvent("locate_request", { kind: "heading", outcome: "moved" });
        flashLocated(currentElementForHeading(heading), () => currentElementForHeading(heading));
        state.activeMarkerKey = markerKey;
        updateActiveMarker();
        publishWindowSnapshot();
        return { ok: true };
      }
      const user = state.markerGroups.find((group) => group.user?.markerKey === markerKey)?.user;
      if (user?.element?.isConnected && jumpToMarker(user, "instant")) {
        recordDiagnosticEvent("locate_request", { kind: "user", outcome: "moved" });
        flashLocated(user.element, () => state.markerGroups.find((group) => group.user?.markerKey === markerKey)?.user?.element);
        return { ok: true };
      }
      recordDiagnosticEvent("locate_request", { kind: heading ? "heading" : user ? "user" : "unknown", outcome: "not-found" });
      return { ok: false };
    }
  }

  function registerWindowBridge() {
    if (!isTopLevelFrame() || !isExtensionContextValid()) {
      return;
    }
    lifecycle.listenChrome(chrome.runtime.onMessage, (message, _sender, sendResponse) => {
      if (message?.type === "POLARIS_WINDOW_REQUEST_STATE") {
        conversationIndex.configure(state.config.chatgptHistoryMode === "complete" && isTopLevelFrame());
        if (!state.awaitingRouteDom && state.markerSourceContainers.length === 0) {
          render();
          return;
        }
        publishWindowSnapshot();
      } else if (message?.type === "POLARIS_WINDOW_COMMAND") {
        const result = handleWindowCommand(message);
        if (message.expectResult) {
          if (result && typeof result.then === "function") {
            void result.then((value) => sendResponse(value || { ok: false })).catch(() => sendResponse({ ok: false }));
            return true;
          }
          sendResponse(result || { ok: false });
        }
      }
    });
  }

  function collectMarkerRenderSnapshot() {
    if (state.awaitingRouteDom) {
      return {
        assistantContainers: [],
        userContainers: [],
        hasConversation: false,
        headings: [],
        markerGroups: [],
        metrics: null
      };
    }
    const scanContext = createMarkerScanContext({
      getComputedStyle: (element) => window.getComputedStyle(element),
      scrollY: window.scrollY
    });
    const manus = isManusPage() ? getManusConversation(scanContext) : null;
    const conversation = manus || (isDeepSeekPage() ? getDeepSeekConversation(scanContext) : null);
    const assistantContainers = conversation ? conversation.assistantContainers : getAssistantContainers(scanContext);
    const userContainers = conversation ? conversation.userContainers : getUserContainers(scanContext);
    const hasConversation = assistantContainers.length > 0
      || userContainers.length > 0;
    if (!hasConversation) {
      return {
        assistantContainers,
        userContainers,
        hasConversation,
        headings: [],
        markerGroups: [],
        metrics: null
      };
    }

    const headings = collectHeadings(assistantContainers, { applyConfig: false, scanContext });
    const markerGroups = dedupeAdjacentGroupHeadings(
      collectMarkerGroups(userContainers, assistantContainers, headings, scanContext, conversation?.assistantToUser)
    );
    const renderHeadings = markerGroups
      .flatMap((group) => group.headings)
      .filter(isHeadingEnabledForCurrentConfig);
    const metrics = getConversationMetrics([...assistantContainers, ...userContainers], scanContext);
    debugCollection(assistantContainers, renderHeadings, metrics);
    return {
      assistantContainers,
      userContainers,
      hasConversation,
      headings: renderHeadings,
      markerGroups,
      assistantToUser: conversation?.assistantToUser,
      metrics
    };
  }

  function render(snapshot = null, { suppressMarkerMotion = false } = {}) {
    if (!isExtensionContextValid()) {
      disposeInvalidExtensionContext();
      return;
    }

    conversationIndex.configure(state.config.chatgptHistoryMode === "complete" && isTopLevelFrame() && document.visibilityState !== "hidden");
    syncConversationCover();

    if (!isSupportedRoute()) {
      clearNonConversationPageState();
      publishWindowSnapshot();
      return;
    }

    const renderSnapshot = snapshot || collectMarkerRenderSnapshot();
    state.markerSourceContainers = [
      ...renderSnapshot.assistantContainers,
      ...renderSnapshot.userContainers
    ];

    if (!renderSnapshot.hasConversation) {
      clearNonConversationPageState();
      publishWindowSnapshot();
      return;
    }

    const {
      headings,
      markerGroups,
      metrics
    } = renderSnapshot;
    syncUserMarkerExpansion(markerGroups);
    const filteredGroups = filteredMarkerGroups(markerGroups);
    const { groups: visibleGroups, earlierUserGroupCount } = limitedMarkerGroups(filteredGroups);

    const root = getRoot();
    updatePageTheme(root);
    getReleaseNoticeOverlay(root);

    updateHeaderOffset(root);
    getControlCapsule(root);
    getSettings(root);
    const controls = getControls(root);
    const controlWidth = controls.getBoundingClientRect().width;
    const markerContentWidth = controlWidth;
    root.style.setProperty("--gpt-nav-control-column-width", `${Math.round(controlWidth)}px`);
    root.style.setProperty("--gpt-nav-controls-width", `${Math.round(markerContentWidth)}px`);
    applyConfig(root);
    const list = getList(root);
    getMarkerSearchInput(root);
    const searchInput = root.querySelector(".gpt-paragraph-nav__search-input");
    const searchWrapper = searchInput instanceof HTMLElement
      ? searchInput.closest(".gpt-paragraph-nav__search")
      : null;
    if (searchWrapper instanceof HTMLElement) {
      searchWrapper.hidden = state.isCollapsed;
    }
    getExplosionOverlay(root);
    ensureHeadingIds(headings);
    state.headings = headings;
    state.markerGroups = markerGroups;
    state.conversationMetrics = metrics;
    if (state.lastRenderedHeadingCount !== headings.length) {
      recordDiagnosticEvent("render_summary", {
        usableHeadings: headings.length,
        userContainers: renderSnapshot.userContainers.length,
        activeControlTab: state.activeControlTab
      });
    }
    document.documentElement.setAttribute(DEBUG_ATTR, `loaded:${headings.length}:${Math.round(metrics.length)}`);
    const displayedCount = visibleGroups.reduce((count, group) => {
      const isSearchActive = Boolean(normalizeSearchQuery(state.markerSearchQuery));
      const isExpanded = isUserMarkerExpanded({
        groupKey: group.key,
        hasUser: Boolean(group.user),
        isSearchActive,
        collapsedKeys: state.collapsedUserMarkerKeys
      });
      return count + (group.user ? 1 : 0) + (isExpanded ? displayedHeadingCount(group, group.visibleHeadings) : 0);
    }, earlierUserGroupCount ? 1 : 0);
    const hasMarkers = markerGroups.length > 0;
    root.style.setProperty("--queue-visible-count", String(Math.min(displayedCount + 1, state.config.maxVisible + 1)));
    root.classList.toggle("is-empty", !hasMarkers);
    root.classList.toggle("is-collapsed", state.isCollapsed && hasMarkers);
    list.style.height = state.isCollapsed && state.collapsedListHeight > 0 ? `${state.collapsedListHeight}px` : "";
    list.setAttribute("aria-hidden", String(state.isCollapsed));

    if (state.isCollapsed) {
      updateFloatingActiveMarker(null);
      state.lastRenderedHeadingCount = headings.length;
      publishWindowSnapshot();
      return;
    }

    const renderItems = markerRenderItems(visibleGroups, earlierUserGroupCount);
    const {
      changed: didChangeMarkerList,
      changedKeys,
      scrollDelta: markerListScrollDelta
    } = markerListReconciler.reconcile(
      list,
      renderItems,
      {
        shouldUpdate: (item) => !(suppressMarkerMotion && item.type === "user")
      }
    );
    if (didChangeMarkerList) {
      preserveMarkerListDragPosition({
        drag: state.pointerDrag,
        list,
        maxScrollTop: markerListMaxScrollTop(list),
        scrollDelta: markerListScrollDelta
      });
    }
    if (didChangeMarkerList && suppressMarkerMotion) {
      markerMotionSuppressor.suppress();
      const changedKeySet = new Set(changedKeys);
      const streamingItem = renderItems.findLast((item) => item.type === "ai" && changedKeySet.has(item.key));
      const streamingRow = streamingItem
        ? Array.from(list.children).find((row) => row.dataset.markerRenderKey === streamingItem.key)
        : null;
      const streamingMarker = streamingRow?.querySelector(".gpt-paragraph-nav__marker--ai") || null;
      markerStreamingIndicator.pulse(streamingMarker);
    }
    syncLiquidGlassElements(root);

    if (didChangeMarkerList || snapshot === null) {
      lifecycle.requestAnimationFrame(() => {
        state.collapsedListHeight = list.offsetHeight;
      });
    }
    state.lastRenderedHeadingCount = headings.length;
    updateActiveMarker();
    publishWindowSnapshot();
  }

  function scheduleRender({ suppressMarkerMotion = false } = {}) {
    state.scheduledRenderSuppressesMarkerMotion ||= suppressMarkerMotion;
    lifecycle.clearTimeout(state.scheduled);
    state.scheduled = lifecycle.setTimeout(() => {
      state.scheduled = 0;
      const shouldSuppressMarkerMotion = state.scheduledRenderSuppressesMarkerMotion;
      state.scheduledRenderSuppressesMarkerMotion = false;
      render(null, { suppressMarkerMotion: shouldSuppressMarkerMotion });
    }, 120);
  }

  function resetRouteState() {
    lifecycle.clearTimeout(state.scheduled);
    state.scheduledRenderSuppressesMarkerMotion = false;
    markerMotionSuppressor.reset();
    markerStreamingIndicator.reset();
    markerRenderStateMachine.reset();
    markerListReconciler.reset();
    markerListActiveTracker.reset();
    markerListScrollPersistence.reset();
    runtimeMarkerKeySequence.reset();
    lifecycle.clearTimeout(state.markerNoticeTimer);
    state.markerNoticeTimer = 0;
    cancelPointerDrag("route-change");
    document.documentElement.classList.remove("gpt-paragraph-nav--dragging");
    state.suppressNextClick = false;
    lifecycle.clearTimeout(state.suppressNextClickTimer);
    state.suppressNextClickTimer = 0;
    state.headings = [];
    state.markerGroups = [];
    state.conversationMetrics = null;
    state.activeHeading = null;
    state.activeMarkerKey = "";
    state.isCollapsed = false;
    state.collapsedListHeight = 0;
    state.activeControlTab = "navigation";
    state.releaseNoticeReturnControlTab = null;
    state.explosionSections = [];
    state.activeExplosionSectionIndex = 0;
    state.lastExplosionRenderSignature = "";
    closeImagePreviewOverlay();
    state.isImagePreviewOpen = false;
    state.imagePreviewUrls = [];
    state.activeImagePreviewIndex = 0;
    state.imagePreviewReturnElement = null;
    state.lastRenderedHeadingCount = 0;
    state.markerSearchQuery = "";
    state.explosionSearchQuery = "";
    resetCollapsedGroups();
    state.latestUserMarkerKey = "";
    state.areEarlierUserGroupsExpanded = false;
    state.markerSourceContainers = [];
  }

  function removeNavigationRoot() {
    cancelPointerDrag("navigation-root-removed");
    const root = document.getElementById(ROOT_ID);
    if (root) {
      const settings = root.querySelector(`.${SETTINGS_CLASS}`);
      const controller = settings && settingsPanelControllers.get(settings);
      if (controller) {
        controller.unmount();
        settingsPanelControllers.delete(settings);
        settingsPanelRenderSignatures.delete(settings);
      }
      root.remove();
    }
    document.documentElement.removeAttribute(DEBUG_ATTR);
  }

  let routeDomFallbackTimer = 0;

  function scheduleRouteDomFallback() {
    lifecycle.clearTimeout(routeDomFallbackTimer);
    routeDomFallbackTimer = lifecycle.setTimeout(() => {
      routeDomFallbackTimer = 0;
      if (!state.awaitingRouteDom) {
        return;
      }
      state.awaitingRouteDom = false;
      reportNextSnapshotDelivery = true;
      render();
    }, 400);
  }

  function handleRouteChange() {
    const nextRouteKey = currentRouteKey();
    if (nextRouteKey === state.routeKey) {
      return;
    }

    state.routeKey = nextRouteKey;
    recordDiagnosticEvent("route_change", { source: "route-bridge" });
    if (!isSupportedRoute()) {
      clearNonConversationPageState();
      state.awaitingRouteDom = true;
      return;
    }
    closeExplosionOverlay();
    closeImagePreviewOverlay();
    state.awaitingRouteDom = true;
    scheduleRouteDomFallback();
    render();
  }

  function watchRouteChanges() {
    if (!isExtensionContextValid()) {
      disposeInvalidExtensionContext();
      return;
    }

    lifecycle.listen(window, ROUTE_CHANGE_EVENT, handleRouteChange);
    if (document.querySelector("script[data-polaris-route-bridge]")) {
      return;
    }

    const bridge = document.createElement("script");
    bridge.src = extensionMetadata.routeBridgeUrl;
    bridge.dataset.polarisRouteBridge = "true";
    bridge.addEventListener("error", () => {
      console.warn("[Polaris] Route bridge script did not load. Startup DOM can still be read, but later SPA navigations may not refresh the side panel.", bridge.src);
    });
    (document.head || document.documentElement).appendChild(bridge);
  }

  function isPolarisOwnedMutationNode(node) {
    if (!(node instanceof Node)) {
      return false;
    }
    if (node instanceof HTMLElement && node.id === ROOT_ID) {
      return true;
    }
    return node.parentElement?.closest(`#${ROOT_ID}`) instanceof HTMLElement;
  }

  function shouldIgnoreMutation(mutation) {
    if (isInsideNavigationRoot(mutation.target) || isUserInputContext(mutation.target)) {
      return true;
    }
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return changedNodes.length > 0 && changedNodes.every(isPolarisOwnedMutationNode);
  }

  function handleDocumentMutations(mutations) {
    if (mutations.every(shouldIgnoreMutation)) {
      return;
    }
    conversationIndex.syncMounted();
    const hasDeepSeekMutation = isDeepSeekPage() && mutations.some(isDeepSeekConversationMutation);
    if (!hasDeepSeekMutation && !hasRelevantMarkerMutation({
      mutations,
      knownContainers: state.markerSourceContainers,
      sourceSelectors: [
        ...getAssistantContainerSelectors(),
        ...getUserContainerSelectors()
      ]
    })) {
      return;
    }
    chapterContentRevision += 1;
    lifecycle.clearTimeout(routeDomFallbackTimer);
    routeDomFallbackTimer = 0;
    state.awaitingRouteDom = false;
    markerRenderStateMachine.request();
  }

  function getSelectedHeading() {
    if (!state.activeMarkerKey) {
      return null;
    }
    if (conversationIndex.enabled() && state.activeMarkerKey.startsWith("index:")) {
      const target = conversationIndex.outline(state.config).targets.get(state.activeMarkerKey);
      return target ? { markerKey: state.activeMarkerKey, id: "", title: target.title,
        element: conversationIndex.resolveTarget(state.activeMarkerKey, state.config) } : null;
    }
    return state.headings.find((item) => markerKeyForHeading(item) === state.activeMarkerKey) || null;
  }

  function getActiveHeading() {
    const heading = getSelectedHeading();
    return heading && currentElementForHeading(heading) ? heading : null;
  }

  function getActiveMarker() {
    const trackedMarker = markerListActiveTracker.current();
    if (trackedMarker?.dataset.markerKey === state.activeMarkerKey) {
      return trackedMarker;
    }
    const list = getList();
    if (!state.activeMarkerKey) {
      return markerListActiveTracker.sync(null);
    }
    const activeMarker = list.querySelector(`[data-marker-key="${CSS.escape(state.activeMarkerKey)}"]`);
    return markerListActiveTracker.sync(activeMarker instanceof HTMLElement ? activeMarker : null);
  }

  function clearActiveMarker() {
    state.activeHeading = null;
    state.activeMarkerKey = "";
    updateFloatingActiveMarker(syncActiveMarker(""));
  }

  function syncActiveMarker(activeMarkerKey = state.activeMarkerKey) {
    const list = getList();
    const nextMarker = activeMarkerKey
      ? list.querySelector(`[data-marker-key="${CSS.escape(activeMarkerKey)}"]`)
      : null;
    return markerListActiveTracker.sync(nextMarker instanceof HTMLElement ? nextMarker : null);
  }

  function updateActiveMarker() {
    if (!state.activeMarkerKey) {
      clearActiveMarker();
      return;
    }

    const selected = getSelectedHeading();
    if (!selected) {
      clearActiveMarker();
      return;
    }

    const activeElement = currentElementForHeading(selected);
    if (!activeElement) {
      state.activeHeading = null;
      updateFloatingActiveMarker(syncActiveMarker(markerKeyForHeading(selected)));
      return;
    }

    state.activeHeading = activeElement;
    updateFloatingActiveMarker(syncActiveMarker(markerKeyForHeading(selected)));
  }

  function isMarkerVisibleInViewport(marker) {
    const rect = marker.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

  function updateFloatingActiveMarker(activeMarker) {
    const root = document.getElementById(ROOT_ID);
    if (!(root instanceof HTMLElement)) {
      return;
    }
    const floating = getFloatingActive(root);
    if (!(activeMarker instanceof HTMLElement)
      || state.isCollapsed
      || state.activeControlTab === "settings") {
      floating.hidden = true;
      floating.querySelector(".gpt-paragraph-nav__floating-active-preview").textContent = "";
      return;
    }

    const list = getList(root);
    if (isMarkerVisibleInViewport(activeMarker)) {
      floating.hidden = true;
      floating.querySelector(".gpt-paragraph-nav__floating-active-preview").textContent = "";
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const preview = activeMarker.querySelector(".gpt-paragraph-nav__preview");
    const title = preview ? preview.textContent : activeMarker.getAttribute("aria-label") || "";
    floating.querySelector(".gpt-paragraph-nav__floating-active-preview").textContent = title;
    floating.title = title;
    floating.style.setProperty("--marker-width", activeMarker.style.getPropertyValue("--marker-width") || "24px");
    floating.style.setProperty("--floating-active-bottom", `calc(${Math.max(0, rootRect.bottom - listRect.bottom)}px + 20pt)`);
    floating.hidden = false;
  }

  function scheduleFloatingActiveUpdate() {
    if (state.floatingScheduled) {
      return;
    }
    state.floatingScheduled = lifecycle.requestAnimationFrame(() => {
      state.floatingScheduled = 0;
      updateFloatingActiveMarker(markerListActiveTracker.current());
    });
  }

  function handleManusConversationScroll(event) {
    if (state.isExtensionContextInvalidated || isInsideNavigationRoot(event.target)
      || !isManusConversationScrollTarget(event.target)) return;
    scheduleScrollWork();
  }

  function handleDeepSeekConversationScroll(event) {
    if (state.isExtensionContextInvalidated || isInsideNavigationRoot(event.target)
      || !isDeepSeekConversationScrollTarget(event.target)) return;
    scheduleScrollWork();
  }

  function scheduleScrollWork() {
    if (state.scrollScheduled) {
      return;
    }
    state.scrollScheduled = lifecycle.requestAnimationFrame(() => {
      state.scrollScheduled = 0;
      updateActiveMarker();
    });
  }

  function markerListMaxScrollTop(list) {
    return Math.max(0, list.scrollHeight - list.clientHeight);
  }

  function markerListDragTarget(event, root) {
    const list = root.querySelector(`#${LIST_ID}`);
    if (!(list instanceof HTMLElement) || !root.contains(list)) {
      return null;
    }

    const maxScrollTop = markerListMaxScrollTop(list);
    if (maxScrollTop <= 0) {
      return null;
    }
    const captureTarget = markerListCardForTarget(event.target, list);
    if (!captureTarget) {
      return null;
    }
    return { root, list, maxScrollTop, captureTarget };
  }

  function isPrimaryPointer(event) {
    return event.isPrimary && (event.pointerType !== "mouse" || event.button === 0);
  }

  function suppressNextClick() {
    state.suppressNextClick = true;
    lifecycle.clearTimeout(state.suppressNextClickTimer);
    state.suppressNextClickTimer = lifecycle.setTimeout(() => {
      state.suppressNextClick = false;
      state.suppressNextClickTimer = 0;
    }, 0);
  }

  function handlePointerDragClick(event) {
    if (!state.suppressNextClick) {
      return;
    }

    state.suppressNextClick = false;
    lifecycle.clearTimeout(state.suppressNextClickTimer);
    state.suppressNextClickTimer = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function capturePointerForDrag(drag, pointerId) {
    const target = drag?.captureTarget;
    if (!(target instanceof HTMLElement) || typeof target.setPointerCapture !== "function") {
      return false;
    }
    try {
      target.setPointerCapture(pointerId);
      return typeof target.hasPointerCapture === "function" ? target.hasPointerCapture(pointerId) : true;
    } catch {
      return false;
    }
  }

  function releasePointerForDrag(drag) {
    const target = drag?.captureTarget;
    if (!(target instanceof HTMLElement) || typeof target.releasePointerCapture !== "function") {
      return;
    }
    try {
      if (typeof target.hasPointerCapture !== "function" || target.hasPointerCapture(drag.pointerId)) {
        target.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The browser may already have released capture during a route or page transition.
    }
  }

  function handlePointerDown(event) {
    if (state.pointerDrag || state.isExplosionOpen || state.isImagePreviewOpen || !isPrimaryPointer(event)) {
      return;
    }

    const root = document.getElementById(ROOT_ID);
    if (!(root instanceof HTMLElement)) {
      return;
    }

    const capsule = root.querySelector(`.${CONTROL_CAPSULE_CLASS}`);
    if (capsule instanceof HTMLElement && event.target instanceof Node && capsule.contains(event.target)) {
      const controls = root.querySelector(`.${CONTROLS_CLASS}`);
      const rect = controls instanceof HTMLElement ? controls.getBoundingClientRect() : capsule.getBoundingClientRect();
      const drag = pointerDragLifecycle.begin({
        kind: "controls",
        pointerId: event.pointerId,
        root,
        captureTarget: pointerCaptureTargetForEvent({ target: event.target, capsule }),
        startX: event.clientX,
        startY: event.clientY,
        controlPosition: {
          top: rect.top,
          right: Math.max(0, window.innerWidth - rect.right)
        },
      });
      if (!drag) {
        return;
      }
      state.pointerDrag = drag;
      const hasPointerCapture = capturePointerForDrag(drag, event.pointerId);
      recordDiagnosticEvent("drag_pointerdown", {
        kind: drag.kind,
        pointerType: event.pointerType,
        hasPointerCapture
      });
      return;
    }

    const target = markerListDragTarget(event, root);
    if (!target) {
      return;
    }

    const drag = pointerDragLifecycle.begin({
      kind: "list",
      pointerId: event.pointerId,
      root: target.root,
      list: target.list,
      captureTarget: target.captureTarget,
      maxScrollTop: target.maxScrollTop,
      startX: event.clientX,
      startY: event.clientY,
      startScrollTop: target.list.scrollTop,
    });
    if (!drag) {
      return;
    }
    state.pointerDrag = drag;
    const hasPointerCapture = capturePointerForDrag(drag, event.pointerId);
    recordDiagnosticEvent("drag_pointerdown", {
      kind: drag.kind,
      pointerType: event.pointerType,
      hasPointerCapture,
      scrollable: true
    });
  }

  function handlePointerMove(event) {
    const drag = state.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const movement = pointerDragLifecycle.move(event);
    if (!movement) {
      return;
    }
    const { deltaX, deltaY, didStart } = movement;
    if (!drag.didDrag && !hasExceededMarkerListDragThreshold({
      deltaX,
      deltaY,
      threshold: POINTER_DRAG_THRESHOLD
    })) {
      return;
    }

    if (didStart) {
      drag.didDrag = true;
      drag.root.classList.add("is-dragging");
      drag.root.classList.add("has-custom-control-position");
      document.documentElement.classList.add("gpt-paragraph-nav--dragging");
      recordDiagnosticEvent("drag_activated", {
        kind: drag.kind,
        deltaX: Math.round(deltaX),
        deltaY: Math.round(deltaY)
      });
      if (drag.kind === "list") {
        markerListScrollPersistence.cancel();
      }
    }

    if (drag.kind === "controls") {
      const controls = drag.root.querySelector(`.${CONTROLS_CLASS}`);
      if (controls instanceof HTMLElement) {
        drag.controlPosition = clampedControlPosition({
          top: drag.controlPosition.top + deltaY,
          right: drag.controlPosition.right - deltaX
        }, controls);
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        applyConfig(drag.root, drag.controlPosition);
      }
    } else {
      drag.list.scrollTop = Math.min(
        drag.maxScrollTop,
        Math.max(0, drag.startScrollTop - deltaY)
      );
      scheduleFloatingActiveUpdate();
    }

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function completePointerDrag(result) {
    if (!result) {
      return;
    }

    const { drag, persistPosition, reason } = result;
    state.pointerDrag = null;
    releasePointerForDrag(drag);
    drag.root.classList.remove("is-dragging");
    document.documentElement.classList.remove("gpt-paragraph-nav--dragging");
    recordDiagnosticEvent("drag_end", {
      kind: drag.kind,
      reason,
      didDrag: drag.didDrag,
      persisted: persistPosition
    });
    if (!drag.didDrag) {
      return;
    }

    if (drag.kind === "controls") {
      if (persistPosition) {
        state.config = normalizeConfig({
          ...state.config,
          controlPosition: drag.controlPosition
        });
        saveConfig(state.config);
      }
      drag.root.classList.toggle("has-custom-control-position", Boolean(state.config.controlPosition));
      applyConfig(drag.root);
    }
  }

  function finishPointerDrag(pointerId, persistPosition, reason) {
    const drag = pointerDragLifecycle.active;
    const shouldSuppressClick = Boolean(drag && drag.didDrag && persistPosition);
    const result = pointerDragLifecycle.finish({
      pointerId,
      persistPosition,
      reason
    });
    completePointerDrag(result);
    if (result && drag && drag.didDrag && shouldSuppressClick) {
      suppressNextClick();
    }
  }

  function cancelPointerDrag(reason, pointerId) {
    const result = pointerId === undefined
      ? pointerDragLifecycle.cancel(reason)
      : pointerDragLifecycle.finish({ pointerId, persistPosition: false, reason });
    completePointerDrag(result);
  }

  function handlePointerUp(event) {
    finishPointerDrag(event.pointerId, true, "pointerup");
  }

  function handlePointerCancel(event) {
    finishPointerDrag(event.pointerId, false, "pointercancel");
  }

  function handleLostPointerCapture(event) {
    cancelPointerDrag("lostpointercapture", event.pointerId);
  }

  function handleWindowBlur() {
    cancelPointerDrag("window-blur");
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      cancelPointerDrag("document-hidden");
      conversationIndex.configure(false);
    } else if (state.config.chatgptHistoryMode === "complete" && isTopLevelFrame()) {
      conversationIndex.configure(true);
    }
  }

  function handlePageHide() {
    cancelPointerDrag("pagehide");
    conversationIndex.configure(false);
  }

  function handleKeydown(event) {
    const managedRoot = document.getElementById(ROOT_ID);
    if (managedRoot?.classList.contains("is-window-managed")) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Escape" && state.isReleaseNoticeOpen) {
      event.preventDefault();
      closeReleaseNotice();
      return;
    }

    if (state.isReleaseNoticeOpen) {
      return;
    }

    if (state.isImagePreviewOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImagePreviewOverlay();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        event.stopPropagation();
        stepImagePreview(event.key === "ArrowLeft" ? -1 : 1);
      }
      return;
    }

    if (event.key === "Escape" && state.isExplosionOpen) {
      const copyMenu = document.querySelector(`#${ROOT_ID} .gpt-paragraph-nav__explosion-copy-menu`);
      if (copyMenu instanceof HTMLDetailsElement && copyMenu.open) {
        event.preventDefault();
        copyMenu.open = false;
        return;
      }
      event.preventDefault();
      closeExplosionOverlay();
      return;
    }

    if (state.isExplosionOpen && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      if (isShortcutTargetEditable()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      activateExplosionSection(state.activeExplosionSectionIndex + (event.key === "ArrowLeft" ? -1 : 1));
      return;
    }

    if (event.key === "Escape" && state.activeControlTab === "settings") {
      event.preventDefault();
      state.activeControlTab = "navigation";
      render();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.matches(".gpt-paragraph-nav__search-input, .gpt-paragraph-nav__explosion-search-input")) {
        event.preventDefault();
        activeElement.select();
        return;
      }
      if (isShortcutTargetEditable()) {
        return;
      }

      event.preventDefault();
      if (state.isExplosionOpen) {
        const overlay = document.querySelector(`#${ROOT_ID} .gpt-paragraph-nav__explosion-overlay`);
        const input = overlay && overlay.querySelector(".gpt-paragraph-nav__explosion-search-input");
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
      } else {
        if (state.activeControlTab !== "navigation") {
          state.activeControlTab = "navigation";
          const root = document.getElementById(ROOT_ID);
          if (root instanceof HTMLElement) {
            syncControlTabs(root);
          }
        }
        const input = getMarkerSearchInput();
        input.focus();
        input.select();
      }
      return;
    }

    if (isShortcutTargetEditable()) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleExplosionOverlay();
    }
  }

  function handleDocumentClick(event) {
    if (state.activeControlTab !== "settings" || !(event.target instanceof Node)) {
      return;
    }

    const root = document.getElementById(ROOT_ID);
    const releaseNotice = root && root.querySelector(".gpt-paragraph-nav__release-notice-overlay");
    if (releaseNotice instanceof HTMLElement && releaseNotice.contains(event.target)) {
      return;
    }
    const controls = root && root.querySelector(`.${CONTROLS_CLASS}`);
    if (controls instanceof HTMLElement && controls.contains(event.target)) {
      return;
    }

    state.activeControlTab = "navigation";
    render();
  }

  async function start() {
    if (!cacheExtensionMetadata()) {
      return;
    }

    document.documentElement.setAttribute(DEBUG_ATTR, "loaded:0");
    const config = await loadConfig();
    if (state.isExtensionContextInvalidated) return;
    state.config = config;
    state.ratingDismissedUntil = await readRatingDismissedUntil();
    if (state.isExtensionContextInvalidated) return;
    watchConfigChanges();
    registerWindowBridge();
    state.routeKey = currentRouteKey();
    try {
      await cleanupLegacyMakerSnapshots({ storage: chrome.storage.local });
    } catch (error) {
      console.warn("[Polaris: AI Chat Navigator] Legacy Maker snapshot cleanup unavailable", error);
    }
    if (state.isExtensionContextInvalidated) return;
    watchRouteChanges();
    state.pageThemeWatcher = createPageThemeWatcher({
      document,
      onChange() {
        if (!isExtensionContextValid()) {
          disposeInvalidExtensionContext();
          return;
        }

        const root = document.getElementById(ROOT_ID);
        if (root instanceof HTMLElement) {
          updatePageTheme(root);
        }
      },
      window
    });
    render();

    state.observer = new MutationObserver(handleDocumentMutations);
    state.observer.observe(document.body, {
      attributes: true,
      attributeFilter: isDeepSeekPage()
        ? [...USER_MESSAGE_IMAGE_ATTRIBUTE_FILTER, ...DEEPSEEK_OBSERVED_ATTRIBUTES]
        : USER_MESSAGE_IMAGE_ATTRIBUTE_FILTER,
      childList: true,
      subtree: true,
      characterData: true
    });

    lifecycle.listen(window, "scroll", scheduleScrollWork, { passive: true });
    if (isManusPage()) {
      lifecycle.listen(document, "scroll", handleManusConversationScroll, { capture: true, passive: true });
    }
    if (isDeepSeekPage()) {
      lifecycle.listen(document, "scroll", handleDeepSeekConversationScroll, { capture: true, passive: true });
    }
    lifecycle.listen(window, "pointerdown", handlePointerDown, { capture: true });
    lifecycle.listen(window, "pointermove", handlePointerMove, { passive: false, capture: true });
    lifecycle.listen(window, "pointerup", handlePointerUp, { capture: true });
    lifecycle.listen(window, "pointercancel", handlePointerCancel, { capture: true });
    lifecycle.listen(window, "lostpointercapture", handleLostPointerCapture, { capture: true });
    lifecycle.listen(window, "blur", handleWindowBlur);
    lifecycle.listen(window, "pagehide", handlePageHide);
    lifecycle.listen(document, "visibilitychange", handleVisibilityChange);
    lifecycle.listen(window, "click", handlePointerDragClick, { capture: true });
    lifecycle.listen(window, "resize", () => scheduleRender(), { passive: true });
    lifecycle.listen(window, "keydown", handleKeydown, { capture: true });
    lifecycle.listen(document, "click", handleDocumentClick);
    registerDiagnosticErrorListeners();
    recordDiagnosticEvent("extension_loaded");
    console.info("[Polaris: AI Chat Navigator] loaded");
  }

  if (document.readyState === "loading") {
    lifecycle.listen(document, "DOMContentLoaded", start, { once: true });
  } else {
    void start();
  }
  return disposeInvalidExtensionContext;
}
