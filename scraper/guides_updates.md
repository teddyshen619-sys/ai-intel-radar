# 教程更新线索

采集时间 2026-11-20 00:56 UTC。版本与日常线索使用近 72 小时窗口。README 单独核对安装与版本段落。

以下按通用主题汇总只读待审阅素材，不依赖课程数量，也不会生成或改写教程。仅关联 guides/ 下实际存在且文件名或内容命中关键词的 Markdown；无匹配时仅保留主题线索。社区反馈仅代表报告者遇到的情况。

## 地区、支付与订阅

关联教程 · [02-lesson-657ffec5712f](<../guides/02-lesson-657ffec5712f.md>)

- [\[Billing\] Unable to cancel ClinePass or delete account; repeated payment retries and no support response](<https://github.com/cline/cline/issues/15786>) · GitHub · cline/cline · 2026-11-19 · 命中 Billing
- [More paid Galaxy AI details emerge, starting with Now Brief limitations](<https://9to5google.com/2026/11/17/galaxy-ai-paywall-details-emerge-starting-with-now-brief/>) · 9to5Google · 2026-11-17 · 命中 subscriptions
- [You can now assign Gemini ‘tasks’ for free in six countries](<https://9to5google.com/2026/11/17/gemini-tasks-free/>) · 9to5Google · 2026-11-17 · 命中 countries
- [Put Gemini to work for you](<https://blog.google/innovation-and-ai/products/gemini-app/tasks-in-gemini-free-new-features/>) · Google AI Blog · 2026-11-17 · 命中 countries
- [Faster fraud response for safer shopping \| Revolut’s David Abitbol](<https://www.youtube.com/watch?v=-O0tMcyH4Wo>) · YouTube · OpenAI · 2026-11-17 · 命中 payments

编辑核查 · 核对服务地区、付款入口及续费条件；涉及账户的反馈先找厂商依据。

## 安装与认证

关联教程 · [01-lesson-f7b9543273b0](<../guides/01-lesson-f7b9543273b0.md>)、[02-lesson-657ffec5712f](<../guides/02-lesson-657ffec5712f.md>)

- [Codex 官方 README](https://raw.githubusercontent.com/openai/codex/main/README.md) · 安装与版本段落同上次成功采集一致。
  - 摘录 · `curl -fsSL https://chatgpt.com/codex/install.sh | sh`
  - 摘录 · `npm install -g @openai/codex`
  - 摘录 · `brew install --cask codex`
<!-- codex-readme-sha256: 7baf50df44354c4564f2873757181b6bd4b97760684256c4336cd3288167ecf3 -->

**[openai/codex 官方发布](https://github.com/openai/codex/releases.atom)** · 成功

- [openai/codex · 0.171.0](<https://github.com/openai/codex/releases/tag/rust-v0.171.0>) · 订阅更新时间 2026-11-20 00:47 UTC。New Features Added GPT-6.2 Sol and Astra to model catalogs, with Sol as the default catalog selection. ( #62106 ) Enabled the TUI workspace by default, with searchable document…
- [openai/codex · 0.170.0](<https://github.com/openai/codex/releases/tag/rust-v0.170.0>) · 订阅更新时间 2026-11-18 03:45 UTC。New Features Added WebRTC negotiation for realtime voice calls in the TUI. ( #61172 ) Added automatically refreshed authentication headers for OpenTelemetry HTTP exporters. (…

- [Deploying Daybreak Red](<https://openai.com/business/learn/deploying-daybreak-red>) · OpenAI News · 2026-11-19 · 命中 setup
- [Get started with Daybreak Blue](<https://openai.com/business/learn/daybreak-blue-onboarding-demo>) · OpenAI News · 2026-11-19 · 命中 setup
- [\[Bug\]: Existing Docker conversations fail to resume Codex after OAuth token rotation while new chats still work](<https://github.com/OpenHands/OpenHands/issues/19837>) · GitHub · OpenHands/OpenHands · 2026-11-18 · 命中 OAuth

编辑核查 · 核对各工具的安装命令、认证入口与 WSL 排障步骤；版本号变化本身不代表安装命令失效。

## 实战、沙盒与批处理

关联教程 · 暂无匹配的 Markdown 教程，仅保留主题线索。

**[openai/codex 官方发布](https://github.com/openai/codex/releases.atom)** · 成功

- [openai/codex · 0.171.0](<https://github.com/openai/codex/releases/tag/rust-v0.171.0>) · 订阅更新时间 2026-11-20 00:47 UTC。New Features Added GPT-6.2 Sol and Astra to model catalogs, with Sol as the default catalog selection. ( #62106 ) Enabled the TUI workspace by default, with searchable document…
- [openai/codex · 0.170.0](<https://github.com/openai/codex/releases/tag/rust-v0.170.0>) · 订阅更新时间 2026-11-18 03:45 UTC。New Features Added WebRTC negotiation for realtime voice calls in the TUI. ( #61172 ) Added automatically refreshed authentication headers for OpenTelemetry HTTP exporters. (…

**[anthropics/claude-code 官方发布](https://github.com/anthropics/claude-code/releases.atom)** · 成功

- [anthropics/claude-code · v2.1.329](<https://github.com/anthropics/claude-code/releases/tag/v2.1.329>) · 订阅更新时间 2026-11-19 22:14 UTC。What's changed Added a trust dialog warning that says where a folder's hooks are declared Added a warning in the conversation, in Claude Desktop and other non-interactive hosts,…
- [anthropics/claude-code · v2.1.328](<https://github.com/anthropics/claude-code/releases/tag/v2.1.328>) · 订阅更新时间 2026-11-19 01:14 UTC。What's changed Added auto mode for Claude Opus 4.6 and Sonnet 4.6 on Amazon Bedrock, Google Cloud's Agent Platform, Microsoft Foundry and Claude apps gateway; interactive sessions…

**[cline/cline 官方发布](https://github.com/cline/cline/releases.atom)** · 成功 · 无符合条件的条目


**[OpenHands/OpenHands 官方发布](https://github.com/OpenHands/OpenHands/releases.atom)** · 成功

- [OpenHands/OpenHands · v1.42.0](<https://github.com/OpenHands/OpenHands/releases/tag/v1.42.0>) · 订阅更新时间 2026-11-18 16:46 UTC。1.42.0 (2026-11-18) What's Changed Features feat(cloud): pick the exact connected git provider for repositories by @tofarr in #19762 feat(verify-openhands): every run has a…

- [Gemini on Mac can now use your computer](<https://www.theverge.com/tech/1037902/google-gemini-macos-ai-computer-use>) · The Verge AI · 2026-11-19 · 命中 workflows
- [Google gives Gemini the ability to use your Mac for you](<https://techcrunch.com/2026/11/19/google-gives-gemini-the-ability-to-use-your-mac-for-you/>) · TechCrunch AI · 2026-11-19 · 命中 workflows
- [What it takes to set intelligence free — Fabian Hedin, CTO, Lovable](<https://www.youtube.com/watch?v=pZWPq_ZAmM4>) · YouTube · AI Engineer · 2026-11-19 · 命中 Sandbox
- [How OpenAI’s Performance Factory keeps ChatGPT fast](<https://openai.com/index/how-openai-performance-factory-keeps-chatgpt-fast>) · OpenAI News · 2026-11-19 · 命中 Codex
- [See PR scans in action](<https://openai.com/business/learn/pr-scans-demo>) · OpenAI News · 2026-11-19 · 命中 workflow

编辑核查 · 核对沙盒、审批、审查及自动执行示例；区分各工具的适用条件与行为差异。
