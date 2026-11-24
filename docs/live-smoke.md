# 真实站点冒烟

GitHub Actions 的 Real-site smoke 在新加坡时间每周一 10:17 运行，也可在 main 上手动运行。运行失败时，通过 GitHub Actions 的工作流失败通知联系维护者。维护者需在 GitHub 通知设置中启用 Actions 失败通知。此任务独立于 PR 和发布门禁。

在仓库创建名为 `live-smoke` 的 GitHub Environment，将部署分支限制为 main。在该环境设置 secret `POLARIS_SMOKE_ACCOUNTS`。仅将专用测试账号用于这里。每个账号预建 A、B 两段合成对话，在各自首轮提问开头放置独有的短标记，确认 Polaris 目录中显示标记。在新的临时浏览器配置中验证专用站点会话和 Polaris 目录均可用。

配置使用 JSON 对象，键对应 `src/supported-platforms.js` 的 key。示例仅说明一个平台的格式。

```json
{
  "chatgpt": {
    "cookies": [
      {"name":"example","value":"example","domain":"chatgpt.com","path":"/","secure":true}
    ],
    "a":{"url":"https://chatgpt.com/c/example-a","marker":"Polaris smoke A"},
    "b":{"url":"https://chatgpt.com/c/example-b","marker":"Polaris smoke B"}
  }
}
```

每个平台使用独立的临时浏览器配置。任务只读取预建会话，校验 A 的目录，再在同一标签打开 B 并检查 B 的标记出现、A 的标记消失。运行结束后删除临时配置。报告只保存平台、步骤、UTC 时间和结果，保留 14 天。

登录失效、验证码或访问受限会结束当前平台的检查。维护者在专用环境人工处理后更新 secret，手动重新运行。若专用站点会话依赖额外的浏览器存储，应先验证账号准备方式；当前入口注入域名限定的登录 Cookie。缺少专用账号时，报告记为“账号未配置”，整次运行返回失败以触发告警。
