export function scenariosFor(browser) {
  const common = ["安装与页面注入", "原生侧栏与消息通信", "目录跳转", "导出文件"];
  return browser === "chrome" ? [...common, "搜索与展开折叠", "流式更新与会话切换"] : common;
}
