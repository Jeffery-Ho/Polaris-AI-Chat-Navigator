import { createPageNavigation } from "./sidepanel-navigation.js";
import { SUPPORTED_PLATFORMS } from "./supported-platforms.js";
import { createPlatformPicker } from "./sidepanel-platform-picker.js";

export function createSidepanelBilling({ document, chrome, locale, onChange = () => {}, onOpenPage = page => document.body.append(page), onClosePage = () => {}, onPlatformEnabled = () => {} }) {
  const win = document.defaultView;
  const text = (zh, en) => locale === "zh" ? zh : en;
  let view = null;
  let dialog = null;
  let settingsPanel = null;
  let settingsEntry = null;
  let screen = "upgrade";
  let busy = false;
  let error = "";
  let licenseValue = "";
  let emailValue = "";
  let selection = [];
  let pollTimer = null;
  let pollCount = 0;
  let generation = 0;
  let returnFocus = null;
  let confirmation = null;
  let renderedScreen = "";
  let selectedPlan = "pro";
  let targetPlatform = null;
  let replacedPlatform = "";

  function el(tag, className = "", content = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    return node;
  }
  function button(label, action, secondary = false) {
    const node = el("button", secondary ? "secondary-button billing-action" : "settings-diagnostic-primary billing-action", label);
    node.type = "button";
    node.disabled = busy;
    node.addEventListener("click", action);
    return node;
  }
  function link(label, action) {
    const node = button(label, action, true);
    node.className = "billing-link";
    return node;
  }
  function copyInput() {
    const license = dialog?.querySelector("[name=license]");
    const email = dialog?.querySelector("[name=email]");
    if (license) licenseValue = license.value;
    if (email) emailValue = email.value;
  }
  function stopPolling() {
    generation++;
    win.clearTimeout(pollTimer);
    pollTimer = null;
  }
  function close() {
    copyInput(); licenseValue = ""; stopPolling();
    const previous = dialog;
    dialog = null;
    confirmation?.close(); confirmation?.remove(); confirmation = null;
    previous?.remove();
    if (previous) onClosePage();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function note(content, isError = false) {
    const node = el("p", `billing-note${isError ? " is-error" : ""}`, content);
    node.setAttribute("role", isError ? "alert" : "status");
    return node;
  }
  function tierLabel() {
    return view?.tier === "pro" ? "Polaris Pro" : view?.tier === "trial" ? text("完整功能试用中", "Full-access trial") : view?.tier === "free" ? "Polaris Free" : text("许可状态暂不可用", "License status unavailable");
  }
  function deadline(value) {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  }
  function updateTrialCountdown(banner = dialog?.querySelector(".billing-trial")) {
    if (!banner) return;
    const remaining = new Date(view?.trialEndsAt).getTime() - (Date.now() + (view?.clockOffset || 0));
    banner.hidden = !Number.isFinite(remaining) || remaining <= 0;
    const details = dialog?.querySelector(".billing-trial-details");
    if (details) details.hidden = banner.hidden;
    if (banner.hidden) return;
    const totalMinutes = Math.ceil(remaining / 60000);
    const values = [Math.floor(totalMinutes / 1440), Math.floor(totalMinutes / 60) % 24, totalMinutes % 60];
    banner.querySelectorAll(".billing-countdown-number").forEach((node, index) => { node.textContent = String(values[index]).padStart(2, "0"); });
    banner.querySelector("[role=timer]").setAttribute("aria-label", text(
      `试用剩余 ${values[0]} 天 ${values[1]} 小时 ${values[2]} 分钟`,
      `Trial time remaining: ${values[0]} days, ${values[1]} hours, ${values[2]} minutes`
    ));
  }
  function setView(next) {
    if (!next) return;
    const changed = JSON.stringify(view) !== JSON.stringify(next);
    view = next;
    if (settingsPanel?.isConnected) mountSettings(settingsPanel);
    if (settingsEntry?.isConnected) mountSettingsEntry(settingsEntry);
    if (changed && dialog) renderDialog();
    if (changed) onChange(view);
  }
  async function request(action, fields = {}) {
    const result = await chrome.runtime.sendMessage({ type: "POLARIS_BILLING", action, ...fields });
    if (!result?.ok) throw new Error(result?.error === "price_changed" ? "price_changed" : "billing_unavailable");
    setView(result.view);
    return result;
  }
  async function perform(task, after) {
    if (busy) return;
    copyInput(); busy = true; error = ""; renderDialog();
    try {
      await task();
      if (after) after();
    } catch (failure) {
      error = failure?.message === "price_changed"
        ? text("价格已更新，请确认当前金额后重新选择购买。", "The price has changed. Review the current amount before purchasing.")
        : screen === "redeem"
        ? text("未能验证许可证。请检查输入或稍后重试，也可通过邮箱找回。", "Could not verify this license. Check it or retry later, or recover it by email.")
        : text("暂时无法连接许可服务。请检查网络后重试。", "Could not reach the license service. Check your connection and retry.");
    } finally {
      busy = false;
      if (settingsPanel?.isConnected) mountSettings(settingsPanel);
      renderDialog();
    }
  }
  function change(next) {
    if (next !== "processing") stopPolling();
    copyInput(); screen = next; error = "";
    if (next === "platforms") selection = targetPlatform
      ? [targetPlatform.key, ...(view?.platforms || view?.suggestedPlatforms || []).filter(key => key !== targetPlatform.key)].slice(0, 2)
      : [...(view?.platforms?.length ? view.platforms : view?.suggestedPlatforms || [])];
    if (next === "replace-platform") replacedPlatform = "";
    renderDialog(true);
  }
  async function poll() {
    if (!dialog || document.hidden || pollCount >= 8 || busy) return;
    const expected = generation;
    pollCount++;
    busy = true;
    try {
      await request("purchase-status");
      if (expected !== generation || !dialog) return;
      if (view?.tier === "pro") { screen = "success"; stopPolling(); }
      else if (["failed", "canceled"].includes(view?.purchaseStatus)) { screen = "upgrade"; stopPolling(); }
      else if (pollCount < 8) pollTimer = win.setTimeout(() => { void poll(); }, 2000 + pollCount * 500);
    } catch { error = text("暂未收到确认。请稍后重试，无需再次购买。", "Confirmation is not available yet. Retry later; no need to purchase again."); }
    finally {
      busy = false;
      if (settingsPanel?.isConnected) mountSettings(settingsPanel);
      renderDialog();
    }
  }
  function startPolling() {
    stopPolling(); pollCount = 0;
    change("processing"); void poll();
  }

  function buy() {
    if (view?.tier === "pro") { close(); return; }
    if (view?.hasPurchase && view.purchaseStatus === "paid") { startPolling(); return; }
    if (!view?.price && !view?.hasPurchase) { void perform(() => request("refresh")); return; }
    void perform(() => request("checkout"));
  }

  function goBack() {
    if (busy) return;
    if (["upgrade", "success", "platforms", "platform-access"].includes(screen)) close();
    else change(screen === "replace-platform" ? "platform-access" : "upgrade");
  }

  function renderDialog(focus = false) {
    if (!dialog) return;
    copyInput();
    const focused = document.activeElement;
    const focusKey = dialog.contains(focused) ? focused.dataset.billingFocus : null;
    const inputSelection = focused?.tagName === "INPUT" && focused.type === "text" ? [focused.selectionStart, focused.selectionEnd] : null;
    const priorScroll = win.scrollY;
    const header = el("header", "window-header billing-header");
    const nav = createPageNavigation(document, {
      title: ["platforms", "platform-access", "replace-platform"].includes(screen) ? text("平台", "Platforms") : "Polaris Pro", backLabel: text("返回上一页", "Back to previous page"),
      wordmark: !["platforms", "platform-access", "replace-platform"].includes(screen),
      onBack: goBack
    });
    const dismiss = nav.querySelector("button");
    dismiss.disabled = busy;
    header.append(nav);
    const body = el("div", "billing-body");
    let trialBanner = null;
    const heading = el("h1", "billing-title"); heading.id = "billing-title";
    const lead = el("p", "billing-copy");
    body.append(heading, lead);
    const back = () => change("upgrade");

    if (screen === "upgrade") {
      if (view?.tier === "pro") {
        heading.textContent = text("你的 Polaris Pro", "Your Polaris Pro");
        heading.classList.add("billing-visually-hidden");
        lead.remove();
      } else {
        heading.textContent = text("像高手一样，掌握长对话。", "Get long conversation like a pro.");
        lead.textContent = text("全部支持的平台、长对话索引，一次解锁。", "Every supported platform and long-conversation indexing, unlocked with one purchase.");
        if (view?.tier === "trial" && view.trialEndsAt) {
          trialBanner = el("section", "billing-trial");
          trialBanner.setAttribute("aria-label", text("完整功能试用", "Full-access trial"));
          const copy = el("div", "billing-trial-copy");
          const end = el("time", "billing-trial-deadline", text(`试用至 ${deadline(view.trialEndsAt)}`, `Trial ends ${deadline(view.trialEndsAt)}`));
          const endsAt = new Date(view.trialEndsAt);
          if (Number.isFinite(endsAt.getTime())) end.dateTime = endsAt.toISOString();
          copy.append(el("strong", "billing-trial-title", text("试用剩余", "Trial ends in")));
          const countdown = el("div", "billing-countdown");
          countdown.setAttribute("role", "timer");
          for (const unit of [text("天", "days"), text("小时", "hrs"), text("分钟", "mins")]) {
            const part = el("span", "billing-countdown-part");
            part.setAttribute("aria-hidden", "true");
            part.append(el("span", "billing-countdown-number"), el("span", "billing-countdown-unit", unit));
            countdown.append(part);
          }
          trialBanner.append(copy, countdown);
          updateTrialCountdown(trialBanner);
          const details = el("p", "billing-trial-details");
          details.hidden = trialBanner.hidden;
          details.append(end, document.createTextNode(text("。结束后自动转为 Free，不自动扣款。", ". Then switches to Free. No automatic charge.")));
          body.append(details);
        }
        body.append(el("h2", "billing-plans-title", text("选择适合你的方案", "Choose your plan")));
        const plans = el("div", "billing-plans");
        const free = el("section", "billing-plan billing-plan-free");
        free.append(el("h2", "billing-plan-name", "Free"), el("p", "billing-plan-description", text("日常浏览，从常用平台开始。", "Everyday reading on your go-to platforms.")), el("strong", "billing-price", "$0"), el("p", "billing-plan-term", text("免费使用", "Free to use")));
        const freeFeatures = el("ul", "billing-features");
        for (const line of [text("任意两个平台", "Any two platforms"), text("可随时更换", "Switch platforms anytime"), text("保留本地数据", "Keep your local data")]) freeFeatures.append(el("li", "", line));
        free.append(el("p", "billing-plan-assurance", text("无需填写支付信息。", "No payment details needed.")), button(text("继续免费使用", "Continue for free"), () => view?.needsPlatformChoice ? change("platforms") : close(), true));
        const pro = el("section", "billing-plan billing-plan-pro");
        pro.append(el("div", "billing-plan-banner", text("解锁完整体验", "Unlock the full experience")));
        pro.append(el("h2", "billing-plan-name", "Pro"), el("p", "billing-plan-description", text("跨平台阅读，完整索引长对话。", "Read across platforms. Index long conversations.")));
        if (view?.price) {
          if (view.price.amount < view.price.originalAmount) pro.append(el("span", "billing-plan-saving", text(`省 $${((view.price.originalAmount - view.price.amount) / 100).toFixed(2)}`, `Save $${((view.price.originalAmount - view.price.amount) / 100).toFixed(2)}`)));
          const price = el("div", "billing-price-row");
          price.append(el("strong", "billing-price", `$${(view.price.amount / 100).toFixed(2)}`));
          if (view.price.amount < view.price.originalAmount) price.append(el("s", "billing-original-price", `$${(view.price.originalAmount / 100).toFixed(2)}`));
          pro.append(price, el("p", "billing-plan-term", text("USD · 一次买断", "USD · Lifetime access")));
          if (view.price.amount < view.price.originalAmount && view.offerEndsAt) pro.append(el("p", "billing-offer", text(`首次启用优惠至 ${deadline(view.offerEndsAt)}`, `Welcome offer ends ${deadline(view.offerEndsAt)}`)));
        } else pro.append(el("p", "billing-price-unavailable", text("价格暂不可用", "Price unavailable")));
        const features = el("ul", "billing-features");
        for (const line of [text("全部支持的平台", "Every supported platform"), text("长对话索引", "Long-conversation indexing"), text("不限设备", "Unlimited devices")]) features.append(el("li", "", line));
        if (!pro.querySelector(".billing-offer")) pro.append(el("p", "billing-plan-assurance", text("一次购买，无需续费。", "One purchase. No renewals.")));
        if (view?.hasPurchase && !["failed", "canceled"].includes(view.purchaseStatus)) {
          pro.append(note(view.purchaseStatus === "paid" ? text("付款已确认，等待激活。无需再次购买。", "Payment confirmed. Activation pending; no need to purchase again.") : text("可以继续打开原付款页；若已付款，请查看进度。", "Reopen your existing checkout, or check progress if you’ve already paid.")));
          pro.append(button(view.purchaseStatus === "paid" ? text("重试激活", "Retry activation") : text("继续付款", "Continue to checkout"), buy));
          if (view.purchaseStatus !== "paid") pro.append(link(text("我已付款，查看进度", "I’ve paid — check progress"), startPolling));
        } else if (view?.price) pro.append(button(text(`以 $${(view.price.amount / 100).toFixed(2)} 买断`, `Get lifetime access · $${(view.price.amount / 100).toFixed(2)}`), buy));
        else pro.append(button(text("重试连接", "Retry connection"), () => perform(() => request("refresh"))));
        free.append(el("p", "billing-includes", text("Free 包含", "Included with Free")), freeFeatures);
        pro.append(el("p", "billing-includes", text("Pro 解锁", "Unlocked with Pro")), features);
        const proContent = el("div", "billing-plan-content");
        proContent.append(...[...pro.children].filter(node => !node.classList.contains("billing-plan-banner")));
        pro.append(proContent);
        const selector = el("fieldset", "billing-plan-selector");
        const legend = el("legend", "billing-selector-legend", text("选择套餐", "Select a plan"));
        selector.append(legend);
        const syncPlan = () => {
          selector.dataset.selectedPlan = selectedPlan;
          free.hidden = selectedPlan !== "free";
          pro.hidden = selectedPlan !== "pro";
        };
        for (const [value, label] of [["free", "Free"], ["pro", "Pro"]]) {
          const option = el("label", "billing-plan-option");
          const input = el("input");
          input.type = "radio"; input.name = "billing-plan"; input.value = value;
          input.checked = selectedPlan === value;
          input.addEventListener("change", () => {
            if (input.checked) { selectedPlan = value; syncPlan(); }
          });
          option.append(input, el("span", "", label)); selector.append(option);
        }
        body.append(selector);
        syncPlan();
        plans.append(pro, free); body.append(plans);
        const comparison = el("table", "billing-comparison");
        comparison.append(el("caption", "billing-section-title", text("功能对比", "Compare features")));
        const rows = [
          [text("功能", "Feature"), "Free", "Pro"],
          [text("同时启用的平台", "Active platforms"), text("任意 2 个", "Any 2"), text("全部", "All")],
          [text("长对话索引", "Long-conversation indexing"), text("不包含", "Not included"), text("包含", "Included")]
        ];
        const tableHead = el("thead"); const tableBody = el("tbody");
        rows.forEach((row, rowIndex) => {
          const tr = el("tr");
          row.forEach((value, column) => { const cell = el(rowIndex === 0 || column === 0 ? "th" : "td", "", value); if (cell.tagName === "TH") cell.scope = rowIndex === 0 ? "col" : "row"; tr.append(cell); });
          (rowIndex === 0 ? tableHead : tableBody).append(tr);
        });
        comparison.append(tableHead, tableBody); body.append(comparison);
        if (view?.tier === "free") body.append(link(text("更换免费平台", "Change free platforms"), () => change("platforms")));
      }
      const links = el("div", "billing-license-links");
      const isPro = view?.tier === "pro";
      if (!isPro) links.append(link(text("已有许可证？", "Already have a license?"), () => change("redeem")));
      links.append(link(text("找回许可证", "Recover your license"), () => change("recover")));
      body.append(links);
      const faq = el("section", "billing-faq"); faq.append(el("h2", "billing-section-title", text("常见问题", "Common questions")));
      for (const [question, answer] of [
        ...(isPro ? [] : [[text("试用结束后会怎样？", "What happens after my trial?"), text("自动进入 Free，你可以选择任意两个平台并随时更换。长对话索引将不可用，但已有本地数据不会删除。不会自动扣款。", "You move to Free and can choose any two platforms, switching anytime. Long-conversation indexing becomes unavailable; local data stays. There is no automatic charge.")]]),
        [text("买断是否需要续费？", "Does lifetime access renew?"), text("一次购买，无需续费。首次启用七天内享受优惠，具体价格与截止时间以上方显示为准。", "One purchase, no renewals. A welcome offer is available for seven days from first use. See the price and deadline above.")],
        [text("许可证如何用于其他设备？", "How do I activate other devices?"), text("在其他设备打开「已有许可证？」并输入许可证即可激活，不限制设备数。", "Open “Already have a license?” on another device and enter your license to activate it. There is no device limit.")]
      ]) { const item = el("details"); item.append(el("summary", "", question), el("p", "billing-copy", answer)); faq.append(item); }
      body.append(faq);
      const closing = el("section", "billing-closing");
      const star = el("img", "billing-closing-star");
      star.src = chrome.runtime.getURL("icons/pro-entry-star.svg"); star.alt = ""; star.width = 96; star.height = 86;
      closing.append(star, el("h2", "billing-closing-title", view?.tier === "pro" ? text("继续探索，尽在 Polaris。", "Keep exploring with Polaris.") : text("让长对话，更好读。", "Make more of every conversation.")),
        el("p", "billing-closing-copy", text("全部支持的平台、长对话索引，一次解锁。", "Every supported platform. Long-conversation indexing. One purchase.")));
      const pending = view?.hasPurchase && !["failed", "canceled"].includes(view.purchaseStatus);
      const label = view?.tier === "pro" ? text("返回 Polaris", "Return to Polaris")
        : pending ? view.purchaseStatus === "paid" ? text("重试激活", "Retry activation") : text("继续付款", "Continue to checkout")
        : view?.price ? text(`立即购买 · $${(view.price.amount / 100).toFixed(2)}`, `Buy now · $${(view.price.amount / 100).toFixed(2)}`) : text("重试连接", "Retry connection");
      const purchase = button(label, buy); purchase.classList.add("billing-closing-buy");
      closing.append(purchase, el("p", "billing-closing-fine", view?.tier === "pro" ? text("已激活 · 不限设备", "Active · Unlimited devices") : pending ? text("已有订单，无需重复购买。", "Your purchase is in progress. No need to buy again.") : text("USD · 一次买断 · 无自动续费", "USD · Lifetime access · No recurring charges")));
      if (view?.tier === "pro") {
        closing.append(link(text("停用本设备", "Deactivate this device"), confirmDeactivation));
        heading.after(closing);
      } else {
        closing.append(link(text("也可以继续免费使用", "Or continue for free"), () => view?.needsPlatformChoice ? change("platforms") : close()));
        body.append(closing);
      }
    } else if (screen === "checkout" || screen === "processing") {
      const activating = view?.purchaseStatus === "paid";
      heading.textContent = screen === "checkout" ? text("在 Stripe 完成付款", "Complete payment with Stripe") : activating ? text("正在激活 Polaris Pro", "Activating Polaris Pro") : text("正在确认付款", "Confirming your payment");
      lead.textContent = text("付款页已在新标签页打开。确认付款与启用本设备可能需要一点时间。", "Checkout opens in a new tab. Payment confirmation and device activation may take a moment.");
      body.append(note(text("关闭付款页不会被视为付款失败。你可以先继续使用 Polaris，之后在设置中查看进度。", "Closing checkout does not mean payment failed. Keep using Polaris and check progress in Settings later.")));
      if (pollCount >= 8) body.append(note(text("确认时间比预期长。稍后重试即可，无需再次购买。", "Confirmation is taking longer than expected. Retry later; do not purchase again.")));
      body.append(button(busy ? text("正在检查…", "Checking…") : activating ? text("重试激活", "Retry activation") : text("我已返回，查看进度", "I’m back — check progress"), startPolling));
      body.append(button(text("先返回 Polaris", "Return to Polaris"), close, true));
      body.append(link(text("通过购买邮箱找回", "Recover by checkout email"), () => { stopPolling(); change("recover"); }));
    } else if (screen === "success") {
      const star = el("img", "billing-success-star");
      star.src = chrome.runtime.getURL("icons/pro-entry-star.svg"); star.alt = ""; star.width = 72; star.height = 64;
      body.prepend(star);
      heading.textContent = text("Polaris Pro 已激活", "Welcome to Polaris Pro");
      lead.textContent = text("全部平台与长对话索引已解锁。", "Every platform and long-conversation indexing, unlocked.");
      body.append(button(text("开始使用", "Start exploring"), close));
      body.append(el("p", "billing-closing-fine", text("一次买断 · 不限设备", "Lifetime access · Unlimited devices")));
    } else if (screen === "redeem" || screen === "recover") {
      const redeeming = screen === "redeem";
      heading.textContent = redeeming ? text("兑换许可证", "Redeem your license") : text("找回许可证", "Recover your license");
      lead.textContent = redeeming ? text("输入购买邮件中的许可证，即可激活这台设备。", "Enter the license from your purchase email to activate this device.") : text("输入付款时使用的邮箱，无需创建 Polaris 账户。", "Enter the email used at checkout. No Polaris account needed.");
      const form = el("form", "billing-form");
      const label = el("label", "billing-form-label", redeeming ? text("许可证", "License key") : text("购买邮箱", "Checkout email"));
      const input = el("input", "billing-input"); input.type = redeeming ? "text" : "email"; input.name = redeeming ? "license" : "email"; input.id = `billing-${input.name}`;
      input.required = true; input.maxLength = redeeming ? 256 : 320; input.autocomplete = redeeming ? "off" : "email"; input.spellcheck = false;
      if (error) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", "billing-error"); }
      input.value = redeeming ? licenseValue : emailValue; input.placeholder = redeeming ? "POL-…" : "you@example.com"; input.disabled = busy;
      label.htmlFor = input.id;
      const submit = button(busy ? text("正在处理…", "Working…") : redeeming ? text("激活本设备", "Activate this device") : text("发送找回邮件", "Send recovery email"), () => {}); submit.type = "submit";
      form.append(label, input, submit);
      form.addEventListener("submit", event => {
        event.preventDefault();
        void perform(() => request(redeeming ? "redeem" : "recover", redeeming ? { licenseKey: input.value } : { email: input.value }), () => {
          if (redeeming) { licenseValue = ""; const input = dialog?.querySelector("[name=license]"); if (input) input.value = ""; screen = "success"; }
          else screen = "recovery-sent";
        });
      });
      body.append(form);
      if (redeeming) body.append(link(text("找不到许可证？", "Lost your license?"), () => change("recover")));
      body.append(link(text("返回", "Back"), back));
    } else if (screen === "recovery-sent") {
      heading.textContent = text("请查看你的邮箱", "Check your inbox");
      lead.textContent = text("如果此邮箱有符合条件的购买记录，你将收到找回说明。请同时检查垃圾邮件。", "If an eligible purchase exists for this email, recovery instructions will be sent. Please also check spam.");
      body.append(button(text("返回兑换", "Back to redemption"), () => change("redeem")));
    } else if (screen === "platform-access" && targetPlatform) {
      const icon = el("img", "billing-platform-target"); icon.src = chrome.runtime.getURL(targetPlatform.favicon); icon.alt = "";
      heading.before(icon);
      heading.textContent = text(`${targetPlatform.label} 未在你的免费平台中`, `${targetPlatform.label} isn't one of your free platforms`);
      lead.textContent = text("Free 可同时使用两个平台。你可以免费替换其中一个，或升级 Pro 使用全部平台。", "Free includes two platforms at a time. Replace one for free, or upgrade to Pro for every platform.");
      const names = (view?.platforms || []).map(key => SUPPORTED_PLATFORMS.find(platform => platform.key === key)?.label).filter(Boolean).join(", ");
      if (names) body.append(el("p", "billing-copy", text(`当前免费平台：${names}`, `Current free platforms: ${names}`)));
      body.append(button(text(`更换免费平台，启用 ${targetPlatform.label}`, `Change free platforms to enable ${targetPlatform.label}`), () => change(view?.platforms?.length === 2 ? "replace-platform" : "platforms")),
        button(text("Get Pro · 使用全部平台", "Get Pro · Use every platform"), back, true));
      body.append(el("p", "billing-copy", text("更换不会删除已保存的本地数据。", "Changing platforms keeps your saved local data.")));
    } else if (screen === "replace-platform" && targetPlatform) {
      heading.textContent = text(`用 ${targetPlatform.label} 替换哪个平台？`, `Which platform should ${targetPlatform.label} replace?`);
      lead.textContent = text("被替换的平台将停止使用 Polaris，已有本地数据会保留。", "Polaris will stop working on the replaced platform. Your saved local data stays.");
      const list = el("div", "billing-platform-replacements");
      const save = button(text(`替换并启用 ${targetPlatform.label}`, `Replace and enable ${targetPlatform.label}`), () => {
        const platforms = view.platforms.map(key => key === replacedPlatform ? targetPlatform.key : key);
        void perform(() => request("platforms", { platforms }), () => { const platform = targetPlatform; close(); onPlatformEnabled(platform); });
      });
      save.disabled = busy || !replacedPlatform;
      for (const key of view?.platforms || []) {
        const platform = SUPPORTED_PLATFORMS.find(item => item.key === key);
        if (!platform) continue;
        const label = el("label", "billing-platform-replacement");
        const radio = el("input"); radio.type = "radio"; radio.name = "replace-platform"; radio.value = key; radio.checked = replacedPlatform === key; radio.disabled = busy;
        radio.addEventListener("change", () => { replacedPlatform = key; save.disabled = busy; });
        const icon = el("img"); icon.src = chrome.runtime.getURL(platform.favicon); icon.alt = "";
        label.append(radio, icon, el("span", "", platform.label)); list.append(label);
      }
      body.append(list, save, link(text("取消", "Cancel"), close));
    } else if (screen === "platforms") {
      heading.textContent = text("挑选常用的两个平台", "Choose your two go-to platforms");
      lead.textContent = view?.tier === "trial"
        ? text("试用期间全部平台仍可用。选择会在试用结束后生效，也可从顶部平台图标随时更换。", "Every platform stays available during your trial. These choices apply when it ends. Change them anytime from the top platform icon.")
        : text("Free 可同时使用两个平台，之后可从顶部平台图标随时更换。已有本地数据会保留。", "Free includes two platforms at a time. Change them anytime from the top platform icon. Your saved local data stays.");
      const picker = createPlatformPicker({ document, chrome, locale, selection, onChange(next) { selection = next; save.disabled = busy || next.length !== 2; } });
      picker.setBusy(busy);
      const choiceHeading = el("div", "platform-choice-heading");
      heading.before(choiceHeading);
      choiceHeading.append(heading, picker.count);
      body.append(picker.element);
      const save = button(text("使用这两个平台", "Use these two platforms"), () => perform(() => request("platforms", { platforms: selection }), () => { const platform = targetPlatform; close(); if (platform && selection.includes(platform.key)) onPlatformEnabled(platform); }));
      save.disabled = busy || selection.length !== 2;
      body.append(save, link(text("取消", "Cancel"), close), link(text("Get Pro · 使用全部平台", "Get Pro · Use every platform"), back));
    }
    if (error) { const message = note(error, true); message.id = "billing-error"; const form = body.querySelector("form"); if (form) form.querySelector("input").after(message); else body.append(message); }
    const screenChanged = renderedScreen !== screen;
    renderedScreen = screen;
    dialog.dataset.screen = screen;
    [...body.querySelectorAll("button, input, summary"), dismiss].forEach((node, index) => { node.dataset.billingFocus = String(index); });
    const openQuestions = [...dialog.querySelectorAll("details")].map(node => node.open);
    dialog.replaceChildren(header, body);
    if (screen === "success" && screenChanged) celebrate(body.querySelector(".billing-success-star"));
    if (trialBanner) header.after(trialBanner);
    if (!screenChanged) dialog.querySelectorAll("details").forEach((node, index) => { node.open = !!openQuestions[index]; });
    if (focus || screenChanged) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); win.scrollTo?.({ top: 0, behavior: "auto" }); }
    else if (focusKey) {
      const target = dialog.querySelector(`[data-billing-focus="${focusKey}"]`);
      target?.focus({ preventScroll: true });
      if (inputSelection && target?.type === "text") target.setSelectionRange(...inputSelection);
      win.scrollTo?.({ top: priorScroll, behavior: "auto" });
    }
  }

  function celebrate(origin) {
    document.querySelector(".billing-confetti")?.remove();
    if (win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const rect = origin?.getBoundingClientRect?.();
    const x = rect?.width ? rect.left + rect.width / 2 : win.innerWidth / 2;
    const y = rect?.height ? rect.top + rect.height / 2 : win.innerHeight * .25;
    const layer = el("div", "billing-confetti");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = `--ox:${x}px;--oy:${y}px`;
    const colors = ["#c4623f", "#e8a33d", "#4f8f6f", "#4a78c2", "#b5579a", "#f2d16b"];
    const shapes = ["is-ribbon", "is-ball", "is-strip", "is-star", "is-ball", "is-ribbon", "is-strip"];
    for (let index = 0; index < 70; index++) {
      const angle = (-200 + Math.random() * 220) * Math.PI / 180;
      const distance = 90 + Math.random() * 190;
      const piece = el("i", shapes[index % shapes.length]);
      piece.style.cssText = `--bx:${Math.cos(angle) * distance}px;--by:${Math.sin(angle) * distance}px;--fall:${140 + Math.random() * 220}px;--r:${(Math.random() - .5) * 1080}deg;--d:${Math.random() * 120}ms;--t:${1800 + Math.random() * 1200}ms;--w:${3 + Math.random() * 3}px;--c:${colors[index % colors.length]}`;
      layer.append(piece);
    }
    document.body.append(layer);
    win.setTimeout(() => layer.remove(), 3400);
  }

  function confirmDeactivation() {
    if (confirmation) return;
    const source = document.activeElement;
    confirmation = el("dialog", "billing-dialog");
    const modal = confirmation;
    modal.setAttribute("aria-labelledby", "billing-deactivate-title");
    const body = el("div", "billing-body");
    const title = el("h2", "billing-title", text("停用这台设备？", "Deactivate this device?")); title.id = "billing-deactivate-title";
    const dismiss = () => { modal.close(); modal.remove(); confirmation = null; if (source?.isConnected) source.focus({ preventScroll: true }); };
    body.append(title, el("p", "billing-copy", text("其他设备与买断许可仍然有效。之后可以使用许可证重新激活。", "Your license and other devices stay active. Reactivate anytime with your license.")));
    const deactivate = button(text("确认停用本设备", "Deactivate this device"), async () => {
      deactivate.disabled = true;
      try { await request("deactivate"); dismiss(); if (dialog) change("upgrade"); }
      catch { deactivate.disabled = false; body.querySelector("[role=alert]")?.remove(); body.append(note(text("停用失败，请检查网络后重试。", "Could not deactivate. Check your connection and retry."), true)); }
    }, true);
    body.append(deactivate, button(text("保留激活", "Keep this device active"), dismiss));
    modal.addEventListener("cancel", event => { event.preventDefault(); dismiss(); });
    modal.append(body); document.body.append(modal); modal.showModal();
  }

  function open(next = "upgrade", { platform } = {}) {
    if (next === "deactivate") { confirmDeactivation(); return; }
    targetPlatform = SUPPORTED_PLATFORMS.find(item => item.key === platform) || null;
    if (!dialog) {
      returnFocus = document.activeElement;
      dialog = el("main", "billing-page");
      dialog.setAttribute("aria-labelledby", "billing-title");
      renderedScreen = "";
      onOpenPage(dialog);
    }
    change(next);
  }

  function mountSettings(panel) {
    settingsPanel = panel;
    const section = el("section", "settings-section billing-settings");
    section.append(el("h2", "settings-section-title", tierLabel()));
    if (view?.tier === "pro") section.append(el("p", "billing-copy", text("买断许可 · 不限设备 · 无自动续费", "Lifetime license · Unlimited devices · No recurring charges")));
    if (view?.tier === "trial") section.append(el("p", "billing-copy", text(`试用至 ${deadline(view.trialEndsAt)}，之后自动转为 Free，不自动扣款。`, `Trial ends ${deadline(view.trialEndsAt)}, then switches to Free with no automatic charge.`)));
    if (view?.unavailable) section.append(note(text("许可服务暂时无法连接。请稍后重试。", "The license service is unavailable. Please retry later.")));
    section.append(button(view?.tier === "pro" ? text("停用本设备", "Deactivate this device") : text("升级 Polaris Pro", "Upgrade to Polaris Pro"), () => open(view?.tier === "pro" ? "deactivate" : "upgrade"), view?.tier === "pro"));
    if (view?.hasPurchase) section.append(button(text("查看购买进度", "Check purchase progress"), () => { open("processing"); startPolling(); }, true));
    section.append(link(text("已有许可证？", "Already have a license?"), () => open("redeem")));
    if (view?.tier === "free") {
      const names = (view.platforms || []).map(key => SUPPORTED_PLATFORMS.find(platform => platform.key === key)?.label).filter(Boolean).join(", ");
      section.append(el("p", "billing-copy", text(`免费平台：${names || "尚未选择"}`, `Free platforms: ${names || "Not selected"}`)));
      section.append(link(text("更换免费平台", "Change free platforms"), () => open("platforms")));
    }
    panel.replaceChildren(section);
  }

  function mountSettingsEntry(entry) {
    settingsEntry = entry;
    if (!entry.firstChild) {
      entry.setAttribute("aria-label", "Polaris Pro");
      const status = el("p", "settings-pro-status", text("完整功能试用中", "Full-access trial"));
      const frame = el("div", "settings-pro-frame");
      const surface = el("div", "settings-pro-surface");
      const header = el("div", "settings-pro-header");
      const star = el("span", "settings-pro-star");
      star.setAttribute("aria-hidden", "true");
      const image = el("img");
      image.src = chrome.runtime.getURL("icons/pro-entry-star.svg");
      image.alt = "";
      image.width = 96; image.height = 86;
      star.append(image);
      const copy = el("div", "settings-pro-copy");
      copy.append(el("h2", "settings-pro-title", "Get Pro"),
        el("p", "settings-pro-subtitle", text("全部平台 · 完整长对话", "Every platform · Full chat history")));
      header.append(star, copy);
      const action = button("", () => open());
      action.className = "settings-pro-cta";
      action.dataset.settingsFocus = "upgrade";
      action.dataset.settingsDestination = "license";
      surface.append(header, action); frame.append(surface); entry.append(status, frame);
    }
    entry.querySelector(".settings-pro-status").hidden = view?.tier !== "trial";
    entry.querySelector(".settings-pro-title").textContent = view?.tier === "pro" ? "Polaris Pro" : "Get Pro";
    entry.querySelector(".settings-pro-subtitle").textContent = view?.tier === "pro"
      ? text("已激活 · 不限设备", "Active · Unlimited devices")
      : text("全部平台 · 完整长对话", "Every platform · Full chat history");
    entry.querySelector(".settings-pro-cta").textContent = view?.tier === "pro" ? text("查看会员信息", "View membership")
      : text("了解 Pro", "Explore Pro");
  }

  const ready = request("get").catch(() => {});
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "POLARIS_BILLING_UPDATED") setView(message.view);
  });
  const refresh = () => {
    if (document.hidden) { stopPolling(); return; }
    updateTrialCountdown();
    void request("get").then(() => {
      if (!busy && dialog && ["checkout", "processing"].includes(screen) && view?.hasPurchase) startPolling();
    }).catch(() => {});
  };
  document.addEventListener("visibilitychange", refresh);
  win.addEventListener("focus", refresh);
  const refreshTimer = win.setInterval(refresh, 60000);
  win.addEventListener("pagehide", () => { stopPolling(); win.clearInterval(refreshTimer); }, { once: true });
  return {
    ready, open, close, mountSettings, mountSettingsEntry,
    selectPlatforms: platforms => request("platforms", { platforms }),
    isOpen: () => !!dialog,
    back: goBack,
    getView: () => view,
    async afterOnboarding() { await ready; if (view?.available && view.tier !== "pro") open(view.needsPlatformChoice ? "platforms" : "upgrade"); },
    async initialPrompt() { await ready; if (view?.needsPlatformChoice && !document.querySelector("dialog[open]")) open("platforms"); },
    rememberPlatform(platform) { void request("remember-platform", { platform }).catch(() => {}); }
  };
}
