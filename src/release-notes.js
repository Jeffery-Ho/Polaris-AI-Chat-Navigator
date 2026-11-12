const RELEASE_NOTES = Object.freeze([
  {
    version: "1.5.0",
    en: { title: "Backfill your own long chats", changes: ["With your permission, long conversation mode renders the unmounted messages of your open chat using only the page's own list, beneath a cover, then restores your place. Shared chats are skipped.", "It pauses while the page is hidden and stops when you use the page; the progress card offers Continue loading. Polaris still does not call website APIs."] },
    zh: { title: "自动补齐你自己的长对话", changes: ["经你同意后，长对话模式会只用网页自身的列表，在遮罩下补齐当前对话未显示的消息，结束后恢复原阅读位置；分享页不补齐。", "页面不可见时暂停，操作网页即停止，进度卡片提供「继续补齐」。Polaris 仍不调用网站接口。"] }
  },
  {
    version: "1.4.0",
    en: { title: "Read while your outline takes shape", changes: ["Long conversation mode shows indexed Makers in batches beneath the progress card. The sidebar starts at the earliest indexed content once, then preserves your reading position.", "Long conversation mode remains off by default. Preparing the list only scrolls Polaris; it does not scroll the website or automatically load older history."] },
    zh: { title: "边整理，边阅读目录", changes: ["长对话模式会在进度卡片下方逐批显示已整理的 Maker。首批内容出现时，侧栏自动回到最早已读内容；后续更新保留阅读位置。", "长对话模式保持默认关闭。整理和对齐仅滚动 Polaris 列表，不滚动聊天网页或自动加载更早历史。"] }
  },
  {
    version: "1.3.0",
    en: { title: "Keep reading long conversations", changes: ["When an original message is no longer on the page, choose Read in Outline to read the retained content. Return to the same TOC search and position.", "Page updates reuse unchanged messages. Clear and rebuild the current index from Preferences when needed; retained history is removed only after confirmation."] },
    zh: { title: "已保留的长对话，随时接着读", changes: ["原文已从网页卸载时，可选择「在大纲阅读」查看本页保留内容，返回目录仍保持搜索和位置。", "页面更新复用未变化消息；需要重新整理时，可在偏好设置确认「清除并重建当前索引」，释放已保留历史。"] }
  },
  {
    version: "1.2.1",
    en: { title: "Long conversation mode without moving the page", changes: ["Choose Follow the page or Long conversation mode. Search and export use only messages already loaded by the website, without automatically scrolling or loading history.", "Private conversation API readers and the local conversation cache have been removed. Previous complete-reading preferences now retain loaded messages in this page's memory only."] },
    zh: { title: "长对话模式，阅读位置由你掌握", changes: ["可选择「跟随页面」或「长对话模式」，目录、搜索和导出只使用页面已加载的消息，不再自动滚动或加载历史。", "移除私有会话接口读取和本地会话缓存；旧版完整读取偏好迁移到长对话模式，已加载消息只保存在当前页面内存中。"] }
  },
  {
    version: "1.1.0",
    en: { title: "A header that scrolls away", changes: ["The sidepanel header now scrolls up with the outline instead of staying pinned. The search bar stays at the top while you scroll, and the full header returns when you scroll back up."] },
    zh: { title: "随滚动收起的主 header", changes: ["侧栏主 header 现在会随目录一起向上滚动，不再一直固定；滚动时搜索框吸顶，回到顶部后恢复完整显示。"] }
  },
  {
    version: "1.0.0",
    en: { title: "Polaris 1.0", changes: ["The Pro page opens with your membership status and device controls.", "What's New in Settings shows the three most recent feature releases and links to the complete release history."] },
    zh: { title: "Polaris 1.0 正式版", changes: ["打开 Pro 页面即可查看会员状态和管理本设备。", "设置中的「更新内容」显示最近三个功能版本，并可打开官网查看完整更新记录。"] }
  },
  {
    version: "0.111.0",
    en: { title: "A warmer Pro welcome", changes: ["Activating Pro with your license now opens a short celebration, with ribbons and confetti bursting from the Pro star. Pro owners see a cleaner Pro page that starts with their status card and skips purchase and trial guidance."] },
    zh: { title: "更有仪式感的 Pro 激活", changes: ["输入许可证激活 Pro 后，彩带与彩球会从星标弹出庆祝；已激活用户打开 Pro 页面时，直接看到状态卡片，不再显示购买与试用相关说明。"] }
  },
  {
    version: "0.110.0",
    en: { title: "Updates within reach", changes: ["The empty sidepanel now has a floating update tip at the bottom. Preview recent highlights and open the changelog, or dismiss the tip once to hide it permanently, including after future updates. Update notes remain available in Settings."] },
    zh: { title: "随手查看近期更新", changes: ["侧栏空页面底部新增悬浮更新提示，可预览近期亮点并打开更新日志；关闭一次后永久隐藏，后续升级也不再出现。仍可在设置中查看更新说明。"] }
  },
  {
    version: "0.109.0",
    en: { title: "Return to the default list", changes: ["If full conversation reading fails, choose Use default list beside Refresh page to turn off long-conversation reading and follow the messages already on the page. Future chats use the same reading preference."] },
    zh: { title: "切回默认列表", changes: ["完整对话读取失败时，可点击「刷新页面」右侧的「使用默认列表」，关闭长对话读取并跟随页面已加载的内容；后续会话沿用该读取设置。"] }
  },
  {
    version: "0.108.0",
    en: { title: "Your two free platforms", changes: ["Choose two free platforms at the end of onboarding, and change them anytime from the top platform icon. Switch between supported platforms, replace a free platform, or explore Pro for access to every platform. Your full-access trial and saved local data are preserved."] },
    zh: { title: "选择你的免费平台", changes: ["在新手引导最后选择两个免费平台，之后可从顶部平台图标随时切换与更换。未启用的平台可免费替换，也可通过 Pro 使用全部平台；保留完整功能试用和已有本地数据。"] }
  },
  {
    version: "0.107.0",
    en: { title: "One conversation index across platforms", changes: ["Virtual TOC and Outline now share structured message indexing across supported platforms, retaining loaded replies, file labels and images as pages change. Kimi recognizes formatted paragraph titles and keeps replies under their questions. Available native history can be read progressively; unconfirmed history stays labeled as loaded content."] },
    zh: { title: "跨平台统一会话索引", changes: ["已支持平台统一接入结构化消息索引与虚拟目录、大纲，保留已读回复、附件标签和图片。Kimi 可识别格式化段落标题，回答归属对应问题；逐步补充可获取的原生历史，未确认完整时明确显示已读范围。"] }
  },
  {
    version: "0.106.0",
    en: { title: "Continue with another AI", changes: ["The export dialog now includes a copyable prompt for continuing a conversation with another AI. It asks the AI to recap the last three exchanges before continuing, and distinguishes complete history from partially read conversations."] },
    zh: { title: "在其他 AI 中继续讨论", changes: ["导出弹窗新增可复制的接续 Prompt，引导上传文件后，先复述最后三轮问答再继续；文案会区分完整记录与已读取的部分对话。"] }
  },
  {
    version: "0.104.0",
    en: { title: "Export attribution", changes: ["Markdown and HTML exports now end with a local-export attribution using the published app name."] },
    zh: { title: "导出文件署名", changes: ["Markdown 与 HTML 文件底部新增本地导出署名，自动使用应用发布名称。"] }
  },
  {
    version: "0.102.0",
    en: { title: "Copy and export conversations", changes: ["Copy the conversation from the top right of the content area, then optionally save Markdown or HTML. Chapter menus now copy only the selected chapter."] },
    zh: { title: "复制与导出会话", changes: ["内容区右上方新增会话复制入口，复制后可选择导出 Markdown 或 HTML；章节菜单只复制当前章节。"] }
  },
  {
    version: "0.100.0",
    en: { title: "Find reply text in Outline", changes: ["When TOC has no reply entries, use the new shortcuts to adjust the display range in Settings or read body text in Outline."] },
    zh: { title: "在 Outline 查看回复正文", changes: ["TOC 无回复目录项时，可通过提示直接调整设置中的显示范围，或切换 Outline 查看正文。"] }
  },
  {
    version: "0.94.0",
    en: { title: "A new sidebar surface", changes: ["A subtle dotted background, outlined assistant cards and gray user bubbles bring a clearer hierarchy to the sidebar. Outline keeps a solid reading surface, with matching dark-mode colors."] },
    zh: { title: "新的侧栏背景与卡片", changes: ["侧栏采用浅点阵底纹、细描边回答卡片与灰色用户卡片；大纲保持实底阅读区域，并适配深色模式。"] }
  },
  {
    version: "0.93.0",
    en: { title: "Pro at the top of Settings", changes: ["A terracotta card with a pearl star replaces the Pro menu entry. It opens purchases or pending progress, and stays visible for Pro members to view their membership details."] },
    zh: { title: "设置首页的 Pro 入口", changes: ["赤陶色付费卡片与珍珠五角星替换原 Pro 列表入口；未购买可打开购买窗口或查看待确认进度，已购买用户通过同一卡片查看会员信息。"] }
  },
  {
    version: "0.92.0",
    en: { title: "Discord community", changes: ["Feedback now includes a Discord community entry beside X and Xiaohongshu."] },
    zh: { title: "Discord 社区入口", changes: ["反馈页新增 Discord 社区入口，与 X、小红书并列显示。"] }
  },
  {
    version: "0.91.0",
    en: { title: "Locate the current Maker", changes: ["The scroll toolbar now has a Locate current Maker button. Return to the active Maker in the TOC, including off-screen entries in long conversations."] },
    zh: { title: "定位当前 Maker", changes: ["滚动工具栏新增“定位当前 Maker”按钮，一键回到目录中当前聚焦的 Maker，支持长对话中屏幕外的条目。"] }
  },
  {
    version: "0.90.0",
    en: { title: "Pro and license", changes: ["Adds purchase, license redemption, recovery and device deactivation in Settings. A seven-day full-access trial leads into Free with two changeable platforms."] },
    zh: { title: "Pro 与许可", changes: ["设置中新增购买、许可证兑换、找回和本设备停用入口；七天完整功能试用结束后，可选择两个免费平台并随时更换。"] }
  },
  {
    version: "0.88.0",
    en: { title: "Simpler full-conversation search", changes: ["Removed the search scope selector. Search all message text with fuzzy matching, original-text highlights and source navigation."] },
    zh: { title: "统一全文模糊搜索", changes: ["移除搜索范围下拉选择，统一模糊搜索全部消息正文，保留原文高亮与定位。"] }
  },
  {
    version: "0.87.0",
    en: { title: "User image labels and stable reading", changes: ["User image attachments are indexed as image labels. Reading survives background tabs and reuses recent conversations. The reading cover returns, with refresh offered only after failure."] },
    zh: { title: "用户图片标签与稳定读取", changes: ["用户图片附件解析为图片标签；后台保留读取，返回近期会话复用已读内容。恢复读取遮罩，仅在读取失败后提供刷新操作。"] }
  },
  {
    version: "0.86.0",
    en: {
      title: "All conversation groups in the full index",
      changes: ["The full-history TOC now includes every indexed question and Image label directly, without an earlier-groups summary. Virtual scrolling keeps the mounted list small, and individual questions can still be folded."]
    },
    zh: {
      title: "全文目录直接包含全部分组",
      changes: ["全文目录直接包含所有已索引的问题和图片标签，移除顶部更早分组汇总；虚拟滚动按需挂载，仍可单独折叠问题。"]
    }
  },
  {
    version: "0.85.7",
    en: {
      title: "Locate images in shared chats",
      changes: ["Image entries now ask ChatGPT's existing virtual list to mount the source message, then locate and highlight it. ChatGPT continues to own image loading and rendering."]
    },
    zh: {
      title: "修复分享页图片定位",
      changes: ["点击图片条目会请求 ChatGPT 原生虚拟列表挂载对应消息，再定位并高亮；图片加载和渲染继续交由原站处理。"]
    }
  },
  {
    version: "0.85.6",
    en: {
      title: "Read shared chats in the signed-in app",
      changes: ["Full reading now handles the signed-in shared page's reload response using the existing page session and the shared-chat data endpoint. All Image labels continue through the same full index and virtual list without image downloads."]
    },
    zh: {
      title: "修复登录状态下的分享全文读取",
      changes: ["分享页返回重载指令时，使用页面现有会话授权读取分享数据；全部图片标签继续复用全文索引和虚拟列表，无需下载图片。"]
    }
  },
  {
    version: "0.85.5",
    en: {
      title: "A separate reader for shared chats",
      changes: ["Shared chats now use their own server data reader, supporting the route's raw loader response and an HTML compatibility fallback while preserving the same full index and Image labels."]
    },
    zh: {
      title: "分享会话使用独立读取链路",
      changes: ["分享会话改用独立服务器数据读取器，支持原站加载接口的原始响应及 HTML 兼容回退，继续共用全文索引和图片标签展示。"]
    }
  },
  {
    version: "0.85.4",
    en: {
      title: "Reuse shared-chat server data",
      changes: ["Full reading now reuses the complete server data already loaded by the active shared chat, including image messages beyond the mounted page. It waits briefly for page initialization when necessary and cancels safely when the source changes."]
    },
    zh: {
      title: "复用分享会话服务器数据",
      changes: ["全文读取优先复用当前分享会话已加载的完整服务器数据，包含页面尚未显示的图片消息；必要时短暂等待页面初始化，来源切换后取消旧读取。"]
    }
  },
  {
    version: "0.85.3",
    en: {
      title: "Shared-chat read recovery",
      changes: ["If a shared-chat refetch returns an unreadable format, Polaris can recover its full history from the matching server snapshot already received by the page, including image labels beyond the mounted messages."]
    },
    zh: {
      title: "分享会话读取回退",
      changes: ["分享页重复请求返回无法解析的内容时，可从本页已收到且分享 ID 匹配的服务器快照恢复全文，包含尚未显示的历史图片标签。"]
    }
  },
  {
    version: "0.85.2",
    en: {
      title: "Read failure diagnostics",
      changes: ["Downloaded diagnostics now include safe error codes, elapsed time and message counts when a full-conversation read fails, helping identify failures on shared chat pages."]
    },
    zh: {
      title: "补充全文读取失败诊断",
      changes: ["完整对话读取失败时，下载的诊断日志会记录安全错误码、耗时和消息数量，便于定位分享会话的实际失败原因。"]
    }
  },
  {
    version: "0.85.1",
    en: {
      title: "Image labels in shared chats",
      changes: ["Follow ChatGPT mode now includes already displayed AI image replies, including image-only shared turns, without downloading previews. Full-history mode continues to read earlier image messages from the server."]
    },
    zh: {
      title: "补全分享会话图片标签",
      changes: ["跟随 ChatGPT 模式也会识别已显示的 AI 图片与纯图片分享回复，无需下载预览；全文读取仍可读取服务器中的更早图片消息。"]
    }
  },
  {
    version: "0.85.0",
    en: {
      title: "Image labels without downloads",
      changes: ["All AI image messages appear as Image labels in the TOC and Outline, with source navigation and no preview downloads or sampling.", "Fixes Gemini initialization when the page replaces its body while settings are loading."]
    },
    zh: {
      title: "图片标签，无需下载",
      changes: ["TOC 与 Outline 中的全部 AI 图片消息仅显示图片标签，保留源消息定位，不再下载预览或进行采样。", "修复 Gemini 在设置读取期间替换页面 body 时的初始化错误。"]
    }
  },
  {
    version: "0.84.2",
    en: {
      title: "AI images in the TOC",
      changes: ["The full-history TOC now includes AI image replies with lazy previews and original-image links. Markdown sandbox images work in both original and shared conversations."]
    },
    zh: {
      title: "目录支持 AI 图片回复",
      changes: ["全文读取的 TOC 现显示 AI 图片回复，支持按需预览和打开原图；原始会话及分享会话中的 Markdown sandbox 图片也可读取。"]
    }
  },
  {
    version: "0.84.1",
    en: {
      title: "Neutral Outline backgrounds",
      changes: ["Collapse controls and image placeholders now use neutral gray backgrounds instead of the accent tint."]
    },
    zh: {
      title: "大纲背景使用中性灰色",
      changes: ["折叠图标和图片占位背景改用浅灰色，替代原先的浅粉色。"]
    }
  },
  {
    version: "0.84.0",
    en: {
      title: "Read the full history of shared chats",
      changes: ["Shared ChatGPT conversations now read their complete server history, including AI image replies beyond the currently visible messages."]
    },
    zh: {
      title: "完整读取分享会话的历史",
      changes: ["ChatGPT 分享会话现从服务器读取完整历史，包含当前页面尚未显示的 AI 图片回复。"]
    }
  },
  {
    version: "0.83.1",
    en: {
      title: "Scroll controls follow the current list",
      changes: ["Floating scroll buttons now appear only when the TOC or Outline shows list rows. Settings, empty lists, and other states keep them hidden."]
    },
    zh: {
      title: "仅在目录和大纲列表显示滚动按钮",
      changes: ["仅当 TOC 或 Outline 实际显示列表条目时显示底部滚动按钮；设置页、空列表及其他状态均隐藏。"]
    }
  },
  {
    version: "0.83.0",
    en: {
      title: "Read images in long conversations",
      changes: ["Reading now shows Markdown images and generated image attachments in reply order. Images load as you read, open their originals in a new tab, and keep a retry option if loading fails."]
    },
    zh: {
      title: "在长对话中阅读图片",
      changes: ["Reading 现支持按回复顺序显示 Markdown 图片与生成图片附件；随阅读按需加载，点击可打开原图，加载失败时可重试。"]
    }
  },
  {
    version: "0.82.1",
    en: {
      title: "Show scroll controls with conversation content",
      changes: ["The floating scroll buttons stay hidden when no conversation has been read, while loading, or after reading fails, and return when conversation content is ready."]
    },
    zh: {
      title: "读取会话后再显示滚动按钮",
      changes: ["未读取到会话、正在读取或读取失败时隐藏底部滚动按钮，读取成功后再显示。"]
    }
  },
  {
    version: "0.82.0",
    en: {
      title: "Jump to the top or bottom",
      changes: ["Use the floating buttons at the bottom center of the sidepanel to jump to either end. Each button is disabled when its edge is reached, and both are disabled when the page fits in the panel."]
    },
    zh: {
      title: "快速回到顶部或底部",
      changes: ["侧栏底部中央新增悬浮按钮，可快速回到顶部或底部；到达对应位置时自动禁用，内容无需滚动时两颗按钮均禁用。"]
    }
  },
  {
    version: "0.81.8",
    en: {
      title: "Refresh a stalled full read",
      changes: ["When complete mode is enabled and a chat cannot be read, refresh its page directly from the sidepanel message. The button prevents duplicate clicks and allows another attempt if refreshing fails."]
    },
    zh: {
      title: "在侧栏重试全文读取",
      changes: ["已开启全文读取但未读取到会话时，可直接点击侧栏提示下方的“刷新页面”。按钮防止重复点击，刷新失败后可再次尝试。"]
    }
  },
  {
    version: "0.81.7",
    en: {
      title: "Keep the chat list unobstructed",
      changes: ["Removed the floating refresh notice that could overflow over ChatGPT's chat list. Reading failures remain visible in the Polaris sidepanel."]
    },
    zh: {
      title: "避免提示遮挡会话列表",
      changes: ["移除可能挤压溢出、遮挡 ChatGPT 会话列表的浮动刷新提示，读取失败状态继续在 Polaris 侧栏显示。"]
    }
  },
  {
    version: "0.81.6",
    en: {
      title: "Stable conversation loading",
      changes: ["Repeated complete ChatGPT responses no longer restart conversation loading. Unchanged data is skipped, while updated complete replies refresh the index without covering the conversation again."]
    },
    zh: {
      title: "稳定会话读取",
      changes: ["ChatGPT 重复返回完整会话数据时，不再反复启动读取；相同数据跳过处理，更新后的完整回复直接同步索引，不再重新遮住正文。"]
    }
  },
  {
    version: "0.81.5",
    en: {
      title: "Highlight after scrolling settles",
      changes: ["Reply highlights now wait for scrolling and layout to settle, stay inside the conversation area below the header, and hide during renewed scrolling. Keeps the whole-reply highlight and existing Outline colors."]
    },
    zh: {
      title: "滚动停稳后再高亮",
      changes: ["等待滚动和布局停稳后再显示整条回复高亮，范围限制在顶部栏下方的正文区域；再次滚动时先隐藏，沿用 Outline 配色。"]
    }
  },
  {
    version: "0.81.4",
    en: {
      title: "Highlight complete ChatGPT replies",
      changes: ["Modern ChatGPT reply ids now keep Maker jumps working when replies contain tool activity or multiple content segments. The highlight covers the whole reply with the existing Outline colors."]
    },
    zh: {
      title: "高亮 ChatGPT 完整回复",
      changes: ["支持 ChatGPT 新界面的整条回复 ID，修复工具活动或多段正文导致定位失败的问题；高亮覆盖整条回复，沿用 Outline 现有配色。"]
    }
  },
  {
    version: "0.81.3",
    en: {
      title: "Highlight the whole reply",
      changes: ["Maker jumps now highlight the entire assistant reply, including its content segments, while scrolling to the selected heading or table. Keeps the existing Outline colors."]
    },
    zh: {
      title: "高亮完整回复",
      changes: ["Maker 跳转后高亮所属的整条 AI 回复及其内容分段，滚动仍定位到点击的标题或表格，沿用 Outline 现有配色。"]
    }
  },
  {
    version: "0.81.2",
    en: {
      title: "Follow your Maker destination",
      changes: ["The destination highlight now appears as soon as the target is visible and follows it through scrolling and layout changes, using the existing Outline colors. Fixes location failures caused by hidden ChatGPT memory citations."]
    },
    zh: {
      title: "高亮跟随 Maker 目标",
      changes: ["跳转目标进入视口即显示高亮，并跟随滚动和布局变化，沿用 Outline 现有配色；修复 ChatGPT 隐藏记忆引用导致定位失败的问题。"]
    }
  },
  {
    version: "0.81.0",
    en: {
      title: "See where your Maker lands",
      changes: ["On-page Maker jumps now highlight the destination after scrolling settles, using the same terracotta frame and subtle fill as Outline. The highlight holds briefly before fading, adapts to light and dark pages, and respects reduced motion."]
    },
    zh: {
      title: "看清 Maker 跳转位置",
      changes: ["点击页面右侧 Maker 后，目标停稳时会显示与 Outline 相同的赤陶色描边和浅色填充，短暂停留后淡出，适配浅色、深色页面及减少动态效果设置。"]
    }
  },
  {
    version: "0.80.0",
    en: {
      title: "Reuse long conversations faster",
      changes: ["Complete reading reuses ChatGPT's loaded history and keeps a compressed parsed cache on this device. Unchanged messages do not need to be parsed again. The cache is limited to 100 MiB, is not synchronized, and can be cleared in Preferences. Opening still waits for current content and the native conversation to be ready."]
    },
    zh: {
      title: "更快复用长对话",
      changes: ["完整阅读优先复用 ChatGPT 已加载的历史，并在本机压缩缓存解析结果，未变化消息无需重复解析。缓存最多 100 MiB，不会同步，可在偏好设置中清除。打开时仍会等待最新内容和原生正文准备完成。"]
    }
  },
  {
    version: "0.79.0",
    en: {
      title: "Start reading with one click",
      changes: ["With complete mode on, click any chat and Polaris starts reading it, with no page refresh needed. A card on ChatGPT's home page points you to the chat list. Makers appear together with the conversation once the loading screen finishes. Jumps from Table of Contents or Outline scroll smoothly and briefly highlight the location in the chat, and Outline no longer adds extra Full text chapters."]
    },
    zh: {
      title: "点一下就开始读取",
      changes: ["开启完整对话后，点击任意会话即可开始读取，无需刷新页面；ChatGPT 首页会提示你从会话列表中选择。加载页结束后，Maker 列表与对话同时出现。从目录或 Outline 定位时会平滑滚动，并短暂高亮目标位置；Outline 不再多出“全文”章节。"]
    }
  },
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
      title: "Improvements and fixes",
      changes: ["Bug fixes and improvements."]
    },
    zh: {
      title: "优化与修复",
      changes: ["修复错误，提升体验。"]
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
    version: /^[1-9]\d*\.0\.0$/.test(note.version) ? note.version : minorVersion(note.version)
  }));
}
