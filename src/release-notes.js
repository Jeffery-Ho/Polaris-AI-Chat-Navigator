const RELEASE_NOTES = Object.freeze([
  {
    version: "0.78.0",
    en: {
      title: "Open complete conversations",
      changes: ["A loading screen shows your chat title and messages read while the conversation gets ready. Retry if needed, or open the messages already available. Table of Contents and search results stay in the ChatGPT conversation."]
    },
    zh: {
      title: "打开完整对话",
      changes: ["加载页显示你的会话标题和已读取消息数，等待对话准备好后自动退出。也可以重试，或先打开已加载内容。目录和搜索结果始终定位 ChatGPT 会话正文。"]
    }
  },
  {
    version: "0.77.0",
    en: {
      title: "Complete conversation data and independent reading",
      changes: ["Table of Contents and search results locate the source in the ChatGPT conversation. Outline remains a separate reading mode. Native navigation to older messages that ChatGPT has not displayed is still being added."]
    },
    zh: {
      title: "完整对话数据与独立阅读",
      changes: ["目录与搜索结果定位 ChatGPT 会话正文，Outline 保持独立阅读。ChatGPT 尚未显示的历史消息，仍在完善会话内定位支持。"]
    }
  },
  {
    version: "0.76.0",
    en: {
      title: "Complete ChatGPT outlines and full-text search",
      changes: ["Choose Read the whole conversation in Preferences to read all messages, see a complete outline, and search the entire chat. Settings shows the real chat title and reading progress. If a message cannot be located yet, scroll up in ChatGPT and try again."]
    },
    zh: {
      title: "ChatGPT 完整对话目录与搜索",
      changes: ["在偏好设置中选择「读取完整对话」，即可自动读取全部历史消息，查看完整目录并搜索所有消息。设置中可查看真实对话标题和读取进度。暂时无法定位的消息，可在 ChatGPT 中向上滚动后重试。"]
    }
  },
  {
    version: "0.75.0",
    en: {
      title: "Return to your AI conversations",
      changes: ["Platform shortcuts return to an existing conversation tab, preferring the current window. A new tab opens only if the platform is not already open. A visible Last used badge marks your last-used platform, remembered locally."]
    },
    zh: {
      title: "回到已打开的 AI 会话",
      changes: ["平台入口优先切回当前窗口中已打开的对应会话，也可切换到其他窗口；尚未打开该平台时才新建标签页。最近使用的平台会保存在本地，对应入口右上角常驻显示“上次使用”标签，无需悬停。"]
    }
  },
  {
    version: "0.74.0",
    en: {
      title: "A guided tour of Polaris",
      changes: ["A seven-step guide in the sidepanel walks through supported platforms, opening the panel, picking a conversation, Maker jumps, outline reading, search, and chapter copy, with a short animated demo on each card. Reopen it any time from Help and diagnostics. Platform shortcuts on the empty state open each site in a new tab."]
    },
    zh: {
      title: "Polaris 新手引导",
      changes: ["侧栏新增 7 步引导，依次介绍支持的平台、打开侧栏、选中会话、Maker 跳转、大纲阅读、搜索与复制章节，每张卡片附带操作动画演示。可在「帮助与诊断」中随时重新查看。空状态的平台入口可直接在新标签页打开对应网站。"]
    }
  },
  {
    version: "0.72.0",
    en: {
      title: "More ways to get in touch",
      changes: ["Feedback now includes personal X and Xiaohongshu profiles as horizontal icon shortcuts, while GitHub Issues and developer email keep their text entries. Profile links open in a new tab."]
    },
    zh: {
      title: "更多联系入口",
      changes: ["反馈页新增 X 与小红书个人主页的横排图标入口，GitHub Issues 和开发者邮件保留文字入口。个人主页链接在新标签页打开。"]
    }
  },
  {
    version: "0.70.0",
    en: {
      title: "Settings organized into dedicated pages",
      changes: ["Settings now opens separate icon cards for Preferences, Help and diagnostics, Feedback, What's New, About, and Privacy Policy. Illustrated diagnostic steps explain how to attach logs manually; About introduces Polaris and shows supported platform icons. Returning preserves the previous reading position and search focus."]
    },
    zh: {
      title: "设置分层为独立页面",
      changes: ["设置现在提供偏好设置、帮助与诊断、反馈、更新内容、关于和隐私政策六张独立图标卡片。日志步骤配图说明手动添加附件；关于页介绍 Polaris 并展示支持平台图标。逐级返回时保留原阅读位置和搜索焦点。"]
    }
  },
  {
    version: "0.68.0",
    en: {
      title: "A single sidepanel experience",
      changes: ["Polaris now uses the browser sidepanel exclusively. Update notes appear inside the panel after a feature upgrade, and can be reopened from Settings. Standalone windows are no longer supported."]
    },
    zh: {
      title: "统一使用浏览器侧栏",
      changes: ["Polaris 统一使用浏览器侧栏，移除独立窗口。功能版本升级后，更新说明会在侧栏内展示，也可随时从设置页再次查看。"]
    }
  },
  {
    version: "0.67.0",
    en: {
      title: "Smoother navigation and chapter reading",
      changes: ["Navigation and Chapters switch with a lightweight transition that preserves reading positions. User prompts remain chapter roots on ChatGPT, Doubao, DeepSeek, and Qwen; navigation cards follow the panel width and settings keep the active group controls."]
    },
    zh: {
      title: "更顺畅的导航与章节阅读",
      changes: ["导航与章节使用轻量转场并保留阅读位置；ChatGPT、豆包、DeepSeek 和千问的用户提问作为章节入口，导航卡片跟随侧栏宽度，设置保留有效的分组控制。"]
    }
  },
  {
    version: "0.66.0",
    en: {
      title: "Read chapters as an outline",
      changes: ["Sidepanel chapters expand inline. Open a bullet menu to focus a chapter, locate its source, or copy content. Return through the chapter path and keep your reading position."]
    },
    zh: {
      title: "在层级列表中阅读章节",
      changes: ["侧栏章节可直接展开正文；点击圆点进入章节、定位原文或复制内容，通过顶部路径返回并保留阅读位置。"]
    }
  },
  {
    version: "0.65.0",
    en: {
      title: "DeepSeek conversation navigation",
      changes: ["DeepSeek now supports user groups, final-answer headings, lists, tables, message image previews, search, and Chapter View. Navigation follows the mounted virtual-list DOM and inner conversation scrolling, while thinking content, disclaimers, and controls stay out."]
    },
    zh: {
      title: "支持 DeepSeek 会话导航",
      changes: ["DeepSeek 现支持用户分组、最终回答中的标题、列表、表格、消息图片预览、搜索与章节视图；导航读取当前挂载的虚拟列表 DOM，适配会话内层滚动，并排除思考过程、免责声明和操作控件。"]
    }
  },
  {
    version: "0.64.0",
    en: {
      title: "Manus conversation navigation",
      changes: ["Manus now supports user groups, headings, lists, tables, message image previews, and Chapter View. Every mounted AI reply belongs to its own user turn, while task controls and unrelated cards stay out of navigation."]
    },
    zh: {
      title: "支持 Manus 会话导航",
      changes: ["Manus 现支持用户分组、标题、列表、表格、消息图片预览与章节视图；已挂载的 AI 回复按同轮用户消息归组，任务控件和非消息卡片不进入导航。"]
    }
  },
  {
    version: "0.62.0",
    en: {
      title: "Maker image thumbnails on every platform",
      changes: ["User Makers can once again show image thumbnails on ChatGPT, Claude, Gemini, Grok, Doubao, Kimi, Qwen, Yuanbao, and Xiaohongshu while keeping avatars, empty sources, and unrelated images out."]
    },
    zh: {
      title: "全平台 Maker 图片缩略图",
      changes: ["ChatGPT、Claude、Gemini、Grok、豆包、Kimi、千问、元宝和小红书点点的用户 Maker 现在都能显示图片缩略图，同时继续排除头像、空地址和非当前消息图片。"]
    }
  },
  {
    version: "0.61.0",
    en: {
      title: "Chapter outlines that match their source",
      changes: ["Chapter hierarchy and reading content now come from the same source nodes. Parent chapters include nested content, child items show their own source row, and the selected chapter stays stable while a reply updates."]
    },
    zh: {
      title: "目录与原文保持对应",
      changes: ["章节层级与阅读正文现在来自同一组来源节点；父章节包含下属内容，子项展示对应原文，并在回复更新时保持当前章节选择。"]
    }
  },
  {
    version: "0.60.0",
    en: {
      title: "A clearer chapter reading view",
      changes: ["Browse the full chapter list beside the reading area, then expand the directory in place without moving the article. Chapter text renders supported Markdown formatting."]
    },
    zh: {
      title: "更清晰的章节阅读",
      changes: ["在正文旁浏览章节列表，或在原位置展开完整目录而不移动正文；章节内容支持 Markdown 格式渲染。"]
    }
  },
  {
    version: "0.59.0",
    en: {
      title: "Settings with a native page header",
      changes: ["The settings entry now uses a cleaner gear icon, and the settings view switches the Polaris header to a focused back-navigation bar instead of repeating the brand controls."]
    },
    zh: {
      title: "设置页采用独立页面导航",
      changes: ["设置入口现在使用更简洁的齿轮图标；进入设置后，Polaris 标题栏切换为专注的返回导航，不再重复品牌和平台控件。"]
    }
  },
  {
    version: "0.58.0",
    en: {
      title: "A quieter Polaris title bar",
      changes: ["The active platform is now represented by a centered floating favicon, settings use a circular icon button, and model labels are removed from the window header so the layout stays consistent across platforms."]
    },
    zh: {
      title: "更克制的 Polaris 标题栏",
      changes: ["当前平台现在用标题栏中央的悬浮 favicon 表达，设置改用圆形图标按钮，窗口头部移除模型文字，让不同平台保持一致的布局。"]
    }
  },
  {
    version: "0.57.0",
    en: {
      title: "Warm, focused Polaris windows",
      changes: ["The browser side panel and standalone window now use a responsive brand header, warm terracotta accents, quieter left/right Maker cards, recoverable search-empty states, a compact chapter picker, and grouped settings that restore the previous view, search focus, and scroll position. Streaming keeps stable rows and uses only a fixed loading indicator."]
    },
    zh: {
      title: "更温暖、更专注的 Polaris 窗口",
      changes: ["浏览器系统侧栏与独立窗口现在使用自适应品牌区、赤陶橙细节、更克制的左右 Maker 卡片、可清除的搜索空状态、紧凑章节选择器，以及能恢复原视图、搜索焦点和滚动位置的分组设置。流式更新继续保持节点稳定，只显示固定加载指示。"]
    }
  },
  {
    version: "0.56.0",
    en: {
      title: "Native browser side panel",
      changes: ["Clicking the extension icon now opens Polaris in the browser's system side panel, reusing navigation, Chapter View, and settings while following the active supported conversation. Browsers without the Side Panel API keep the existing standalone-window fallback."]
    },
    zh: {
      title: "浏览器系统 Side Panel",
      changes: ["点击扩展图标现在会在浏览器系统 Side Panel 中打开 Polaris，复用导航、章节和设置并跟随当前支持的 AI 会话；不支持 Side Panel API 的浏览器继续使用原有独立窗口回退。"]
    }
  },
  {
    version: "0.55.1",
    en: {
      title: "Reliable Maker image ownership",
      changes: ["User Makers now show only verified image attachments owned by that exact user message. Avatars, icons, decorative images, and unrelated page images are excluded, and failed thumbnails no longer leave broken-image placeholders in the standalone window."]
    },
    zh: {
      title: "更可靠的 Maker 图片归属",
      changes: ["用户 Maker 现在只显示明确属于该条用户消息的上传图片附件；头像、图标、装饰图片和其他页面图片会被排除，加载失败的缩略图也不会再在独立窗口中留下破图占位符。"]
    }
  },
  {
    version: "0.55.0",
    en: {
      title: "Softer Maker navigation",
      changes: ["The Polaris window now uses a low-saturation blue-orange glass background, accepts unrestricted Unicode search text, keeps chevrons only on user groups, uses larger Maker corners, rounds the search and Tab controls more generously with a neutral iOS-like light-gray segmented Tab surface, and shows bundled platform favicons below the empty-state copy without treating them as module scripts. It also refreshes supported-page state when browser tabs or focus change, follows browser `prefers-color-scheme` changes immediately, retries until the content script responds, and keeps an existing conversation tab as the source when the extension page is opened as a regular browser tab."]
    },
    zh: {
      title: "更柔和的 Maker 导航",
      changes: ["Polaris 窗口现在使用低饱和度蓝橙玻璃背景，搜索支持中文及任意 Unicode 文本，只有用户分组显示 chevron，统一增大 Maker 圆角，搜索框和 Tab 使用更大圆角并采用接近 iOS 分段控件的中性浅灰背景，同时在空提示下方显示平台 favicon；源代码和构建产物都能正确加载这些图片。切换浏览器标签页或焦点后，窗口会自动刷新支持平台状态，浏览器切换 `prefers-color-scheme` 后也会立即同步亮暗主题，并在内容脚本尚未就绪时重试；如果把插件页作为普通浏览器标签打开，也会继续使用已记录的会话标签获取 Maker。"]
    }
  },
  {
    version: "0.54.0",
    en: {
      title: "Standalone Polaris window",
      changes: ["Click the extension icon to open one movable Polaris window for navigation, chapters, and settings. It follows the active supported tab and returns focus to the source page after a Maker jump."]
    },
    zh: {
      title: "Polaris 独立窗口",
      changes: ["点击扩展图标打开一个可移动的 Polaris 窗口，集中提供导航、章节和设置；窗口跟随当前支持的标签页，点击 Maker 后切回来源页面。"]
    }
  },
  {
    version: "0.52.0",
    en: {
      title: "X profile in About & Settings",
      changes: ["About & Settings now includes an X profile link beside email feedback in the footer."]
    },
    zh: {
      title: "关于与设置新增 X 主页入口",
      changes: ["关于与设置页 Footer 在邮件入口左侧新增 X 主页入口，可在新标签页打开。"]
    }
  },
  {
    version: "0.51.0",
    en: {
      title: "Grok navigation",
      changes: ["Grok now supports Polaris navigation for user groups, headings, lists, tables, streaming updates, search, and Chapter View."]
    },
    zh: {
      title: "支持 Grok 导航",
      changes: ["Grok 现支持用户分组、标题、列表、表格、流式更新、搜索与章节视图。"]
    }
  },
  {
    version: "0.50.0",
    en: {
      title: "Google Gemini navigation",
      changes: ["Google Gemini now supports Polaris navigation for user groups, headings, lists, tables, streaming updates, search, and Chapter View."]
    },
    zh: {
      title: "支持 Google Gemini 导航",
      changes: ["Google Gemini 现支持用户分组、标题、列表、表格、流式更新、搜索与章节视图。"]
    }
  },
  {
    version: "0.49.2",
    en: {
      title: "Reliable support attribution",
      changes: ["The support link now uses a same-origin entry path so the landing page can retain the Polaris source when browsers remove UTM parameters."]
    },
    zh: {
      title: "更可靠的赞赏页来源记录",
      changes: ["赞赏入口现在使用同源入口路径；即使浏览器移除 UTM 参数，Landing 页面仍可保留 Polaris 来源。"]
    }
  },
  {
    version: "0.49.0",
    en: {
      title: "Drag recovery and diagnostic export",
      changes: ["Pointer dragging now recovers after lost capture, window or page transitions, and route changes. About & Settings can download a redacted session log and open a pre-addressed email for manual attachment."]
    },
    zh: {
      title: "导航拖动恢复与诊断日志导出",
      changes: ["导航拖动现在会在指针捕获丢失、窗口或页面切换以及路由变化后自动清理并恢复。关于与设置新增脱敏会话日志下载和邮件入口，附件需要手动添加。"]
    }
  },
  {
    version: "0.48.0",
    en: {
      title: "Support entry in update notes",
      changes: ["Update notes now include a heart-shaped support button next to email feedback."]
    },
    zh: {
      title: "更新说明新增赞赏入口",
      changes: ["更新说明的邮件反馈旁新增心形赞赏按钮，可在新标签页打开赞赏页。"]
    }
  },
  {
    version: "0.47.0",
    en: {
      title: "Ordered-list marker filter",
      changes: ["Ordered lists can now generate markers when enabled in settings, and are disabled by default for every platform."]
    },
    zh: {
      title: "有序列表 Marker 筛选",
      changes: ["设置现可单独启用有序列表 Marker；所有平台默认关闭。"]
    }
  },
  {
    version: "0.46.0",
    en: {
      title: "Bold-text marker filter",
      changes: ["Bold text can now generate markers when enabled in settings, and is disabled by default for every platform."]
    },
    zh: {
      title: "加粗文本 Marker 筛选",
      changes: ["设置现可单独启用加粗文本 Marker；所有平台默认关闭。"]
    }
  },
  {
    version: "0.45.0",
    en: {
      title: "Claude.ai navigation",
      changes: ["Claude.ai now supports Polaris navigation for user groups, headings, unordered lists, tables, and Chapter View."]
    },
    zh: {
      title: "支持 Claude.ai 导航",
      changes: ["Claude.ai 现支持用户分组、标题、无序列表、表格 Maker 与章节视图。"]
    }
  },
  {
    version: "0.44.0",
    en: {
      title: "Maker groups expanded by default",
      changes: ["User groups and Maker stacks now stay expanded by default. You can still collapse either one manually, and scrolling no longer changes that choice."]
    },
    zh: {
      title: "Maker 分组默认展开",
      changes: ["用户分组和 Maker 堆叠现默认展开；仍可手动收起，滚动不会再改写你的分组状态。"]
    }
  },
  {
    version: "0.40.0",
    en: {
      title: "Optional support-page analytics",
      changes: ["The support link now identifies Polaris as its source. The separate support page measures that arrival and its video loading play control only after you allow analytics."]
    },
    zh: {
      title: "可选的赞赏页分析",
      changes: ["赞赏入口会标记 Polaris 来源；独立赞赏页仅在你同意分析后记录该到访和视频加载播放按钮点击。"]
    }
  },
  {
    version: "0.39.0",
    en: {
      title: "A support entry in settings",
      changes: ["A heart button at the right edge of the Polaris settings header opens the support page in a new tab."]
    },
    zh: {
      title: "修正赞赏入口位置",
      changes: ["Polaris 设置面板 Header 右侧新增心形入口，可在新标签页打开赞赏页。"]
    }
  },
  {
    version: "0.38.0",
    en: {
      title: "A new Polaris support page",
      changes: ["The Polaris website now includes a focused support page with the extension link, issue tracker, introduction video area, and a direct PayPal option."]
    },
    zh: {
      title: "新增 Polaris 赞赏页",
      changes: ["Polaris 网站新增独立赞赏页，集中提供扩展入口、问题反馈、介绍视频区域和 PayPal 直达入口。"]
    }
  },
  {
    version: "0.37.0",
    en: {
      title: "Stable Maker lists while streaming",
      changes: ["Existing Makers stay stable while responses stream, so the list remains scrollable and collapsible; wheel, trackpad, or list-drag input takes control immediately so Makers can remain outside the visible list without being pulled back."]
    },
    zh: {
      title: "Maker 列表流式稳定化",
      changes: ["回答流式生成时复用已有 Maker，列表仍可持续滚动与折叠；滚轮、触摸板或列表拖动会立即接管滚动，Maker 可保持在列表不可见区域，不再闪烁或被自动拉回。"]
    }
  },
  {
    version: "0.36.0",
    en: {
      title: "Progressive Maker rendering",
      changes: ["Makers now appear during streaming output as soon as the first valid section is available, without waiting for the response to finish."]
    },
    zh: {
      title: "Maker 流式渐进渲染",
      changes: ["流式输出识别到首个有效 Maker 后即开始渐进渲染，不再等待整段回答结束。"]
    }
  },
  {
    version: "0.35.0",
    en: {
      title: "Table markers across AI chats",
      changes: ["Visible response tables now create one navigation marker from their first row on every supported platform."]
    },
    zh: {
      title: "全平台表格 Maker",
      changes: ["所有支持平台的可见回复表格现在都会按首行生成一个导航 Maker。"]
    }
  },
  {
    version: "0.34.0",
    en: {
      title: "Mixed raw Markdown chapters",
      changes: ["Chapter View now safely formats raw mixed Markdown, including nested task lists, inline styles, code, tables, and Unicode characters."]
    },
    zh: {
      title: "章节支持混排 Markdown 与特殊字符",
      changes: ["章节视图现可安全格式化原始混排 Markdown，支持嵌套任务列表、行内格式、代码、表格及 Unicode 特殊字符。"]
    }
  },
  {
    version: "0.33.0",
    en: {
      title: "Raw Markdown tables in chapters",
      changes: ["Chapter View now formats complete pipe tables even when the source page leaves them as raw Markdown text."]
    },
    zh: {
      title: "章节支持原始 Markdown 表格",
      changes: ["网页未渲染的完整管道表格现在会在章节视图中格式化显示。"]
    }
  },
  {
    version: "0.32.0",
    en: {
      title: "Jump back to empty chapters",
      changes: ["Empty Chapter View sections can now take you directly to their original conversation position."]
    },
    zh: {
      title: "空章节可跳回原会话",
      changes: ["没有可显示正文的章节现在可直接跳转到其在原会话中的位置。"]
    }
  },
  {
    version: "0.31.0",
    en: {
      title: "Richer Markdown chapters",
      changes: ["Chapter View now renders headings, task lists, images, nested content, and complex tables safely."]
    },
    zh: {
      title: "更完整的 Markdown 章节阅读",
      changes: ["章节视图现可安全渲染标题、任务列表、图片、嵌套内容与复杂表格。"]
    }
  },
  {
    version: "0.29.0",
    en: {
      title: "What's new notifications",
      changes: ["A version update dialog now summarizes changes and provides direct feedback options."]
    },
    zh: {
      title: "新增版本更新通知",
      changes: ["版本更新弹窗会说明本次改动，并提供直接反馈入口。"]
    }
  },
  {
    version: "0.30.0",
    en: {
      title: "Review updates anytime",
      changes: ["About & Settings now provides a nearby entry to reopen update notes."]
    },
    zh: {
      title: "随时查看更新说明",
      changes: ["关于与设置面板在版本号旁新增入口，可再次查看更新说明。"]
    }
  }
]);

function compareVersions(first, second) {
  const firstSegments = String(first).split(".").map(Number);
  const secondSegments = String(second).split(".").map(Number);
  const segmentCount = Math.max(firstSegments.length, secondSegments.length);

  for (let index = 0; index < segmentCount; index += 1) {
    const difference = (firstSegments[index] || 0) - (secondSegments[index] || 0);
    if (difference) {
      return difference;
    }
  }

  return 0;
}

function minorVersion(version) {
  return String(version).split(".").slice(0, 2).join(".");
}

export function isFeatureVersion(version) {
  const segments = String(version).split(".");
  return segments.length === 3 && segments.every((segment) => /^\d+$/.test(segment)) && segments[2] === "0";
}

function fallbackReleaseNote(version) {
  return {
    isFallback: true,
    version,
    en: {
      title: "Release notes unavailable",
      changes: ["Detailed notes for this version are unavailable. Please send feedback if something needs attention."]
    },
    zh: {
      title: "更新说明暂不可用",
      changes: ["此版本的详细更新说明暂不可用；如有问题，请通过下方入口反馈。"]
    }
  };
}

export function releaseNotesForUpdate(lastSeenVersion, currentVersion, maximumNotes = 3) {
  const currentMinorVersion = minorVersion(currentVersion);
  const lastSeenMinorVersion = lastSeenVersion ? minorVersion(lastSeenVersion) : "";
  if (lastSeenMinorVersion === currentMinorVersion) {
    return [];
  }

  const notes = RELEASE_NOTES
    .filter(({ version }) => isFeatureVersion(version))
    .filter(({ version }) => compareVersions(minorVersion(version), currentMinorVersion) <= 0)
    .filter(({ version }) => !lastSeenMinorVersion || compareVersions(minorVersion(version), lastSeenMinorVersion) > 0)
    .sort((first, second) => compareVersions(first.version, second.version));

  if (!notes.some(({ version }) => minorVersion(version) === currentMinorVersion)) {
    notes.push(fallbackReleaseNote(currentMinorVersion));
  }

  return notes.slice(-maximumNotes).reverse().map((note) => ({
    ...note,
    version: minorVersion(note.version)
  }));
}
