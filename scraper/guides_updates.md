# 教程更新线索

采集时间 2026-11-21 13:47 UTC。版本与日常线索使用近 72 小时窗口。README 单独核对安装与版本段落。

以下按通用主题汇总只读待审阅素材，不依赖课程数量，也不会生成或改写教程。仅关联 guides/ 下实际存在且文件名或内容命中关键词的 Markdown；无匹配时仅保留主题线索。社区反馈仅代表报告者遇到的情况。

## 地区、支付与订阅

关联教程 · [02-lesson-657ffec5712f](<../guides/02-lesson-657ffec5712f.md>)、[03-lesson-22ece7536789](<../guides/03-lesson-22ece7536789.md>)、[04-lesson-b101841fb51f](<../guides/04-lesson-b101841fb51f.md>)

- [Trump threatens ‘tremendous tax’ for moving AI data centers outside the US](<https://www.theverge.com/policy/1038892/trump-foreign-data-centers-tax>) · The Verge AI · 2026-11-20 · 命中 country
- [3 ChatGPT Tips to Save Money](<https://www.youtube.com/watch?v=WGvsk0LIveU>) · YouTube · OpenAI · 2026-11-20 · 命中 subscriptions

编辑核查 · 核对服务地区、付款入口及续费条件；涉及账户的反馈先找厂商依据。

## 安装与认证

关联教程 · [01-lesson-f7b9543273b0](<../guides/01-lesson-f7b9543273b0.md>)、[02-lesson-657ffec5712f](<../guides/02-lesson-657ffec5712f.md>)、[03-lesson-22ece7536789](<../guides/03-lesson-22ece7536789.md>)、[04-lesson-b101841fb51f](<../guides/04-lesson-b101841fb51f.md>)

- [Codex 官方 README](https://raw.githubusercontent.com/openai/codex/main/README.md) · 安装与版本段落同上次成功采集一致。
  - 摘录 · `curl -fsSL https://chatgpt.com/codex/install.sh | sh`
  - 摘录 · `npm install -g @openai/codex`
  - 摘录 · `brew install --cask codex`
<!-- codex-readme-sha256: 7baf50df44354c4564f2873757181b6bd4b97760684256c4336cd3288167ecf3 -->

**[openai/codex 官方发布](https://github.com/openai/codex/releases.atom)** · 成功

- [openai/codex · 0.171.0](<https://github.com/openai/codex/releases/tag/rust-v0.171.0>) · 订阅更新时间 2026-11-20 00:47 UTC。New Features Added GPT-6.2 Sol and Astra to model catalogs, with Sol as the default catalog selection. ( #62106 ) Enabled the TUI workspace by default, with searchable document…

- [MCP tools from any installed server are silently auto-approved by default — no per-tool opt-in exists](<https://github.com/cline/cline/issues/15817>) · GitHub · cline/cline · 2026-11-21 · 命中 installed
- [Connect Your Team’s Data to ChatGPT](<https://www.youtube.com/watch?v=oJIuz3AFfEQ>) · YouTube · OpenAI · 2026-11-20 · 命中 install
- [Welcome Inkling 2 Mini, Cutting-edge Performance for your Local Setup](<https://huggingface.co/blog/inkling2mini>) · Hugging Face Blog · 2026-11-20 · 命中 Setup
- [Get started with Daybreak Blue](<https://openai.com/business/learn/daybreak-blue-onboarding-demo>) · OpenAI News · 2026-11-19 · 命中 setup
- [Deploying Daybreak Red](<https://openai.com/business/learn/deploying-daybreak-red>) · OpenAI News · 2026-11-19 · 命中 setup

编辑核查 · 核对各工具的安装命令、认证入口与 WSL 排障步骤；版本号变化本身不代表安装命令失效。

## 实战、沙盒与批处理

关联教程 · [04-lesson-b101841fb51f](<../guides/04-lesson-b101841fb51f.md>)

**[openai/codex 官方发布](https://github.com/openai/codex/releases.atom)** · 成功

- [openai/codex · 0.171.0](<https://github.com/openai/codex/releases/tag/rust-v0.171.0>) · 订阅更新时间 2026-11-20 00:47 UTC。New Features Added GPT-6.2 Sol and Astra to model catalogs, with Sol as the default catalog selection. ( #62106 ) Enabled the TUI workspace by default, with searchable document…

**[anthropics/claude-code 官方发布](https://github.com/anthropics/claude-code/releases.atom)** · 成功

- [anthropics/claude-code · v2.1.330](<https://github.com/anthropics/claude-code/releases/tag/v2.1.330>) · 订阅更新时间 2026-11-20 22:32 UTC。What's changed Added sign-in to organizations managed in Anthropic's Enterprise Admin Console: after claude auth login , Claude Code applies the organization's settings and uses…
- [anthropics/claude-code · v2.1.329](<https://github.com/anthropics/claude-code/releases/tag/v2.1.329>) · 订阅更新时间 2026-11-19 22:14 UTC。What's changed Added a trust dialog warning that says where a folder's hooks are declared Added a warning in the conversation, in Claude Desktop and other non-interactive hosts,…

**[cline/cline 官方发布](https://github.com/cline/cline/releases.atom)** · 成功

- [cline/cline · v4.1.27](<https://github.com/cline/cline/releases/tag/v4.1.27>) · 订阅更新时间 2026-11-21 06:05 UTC。Added LM Studio settings have an API key field, for servers with "Require Authentication" turned on. The MCP tab shows a "read-only" badge on tools whose server declares them…
- [cline/cline · Desktop v0.0.50](<https://github.com/cline/cline/releases/tag/desktop-v0.0.50>) · 订阅更新时间 2026-11-21 05:54 UTC。The thinking picker offers Max reasoning effort, for models whose top level is max A manual /compact can be stopped. Before, it could sit on "Thinking…" with no Stop button when…

**[OpenHands/OpenHands 官方发布](https://github.com/OpenHands/OpenHands/releases.atom)** · 成功

- [OpenHands/OpenHands · v1.43.0](<https://github.com/OpenHands/OpenHands/releases/tag/v1.43.0>) · 订阅更新时间 2026-11-20 19:03 UTC。1.43.0 (2026-11-20) What's Changed Features feat(automations): create automations enabled from the setup wizard by @SaltGardenia in #19769 feat(settings): Features page for…
- [OpenHands/OpenHands · v1.42.0](<https://github.com/OpenHands/OpenHands/releases/tag/v1.42.0>) · 订阅更新时间 2026-11-18 16:46 UTC。1.42.0 (2026-11-18) What's Changed Features feat(cloud): pick the exact connected git provider for repositories by @tofarr in #19762 feat(verify-openhands): every run has a…

- [What Runs Where? Local AI in Production — Ahmad Osman, Osmantic](<https://www.youtube.com/watch?v=GKSQYbELDzw>) · YouTube · AI Engineer · 2026-11-21 · 命中 batching
- [MCP tools from any installed server are silently auto-approved by default — no per-tool opt-in exists](<https://github.com/cline/cline/issues/15817>) · GitHub · cline/cline · 2026-11-21 · 命中 approval
- [Show HN: OpenComputer – an open source alternative to Devin](<https://github.com/diggerhq/opencomputer>) · Hacker News · 2026-11-20 · 命中 sandbox
- [Gemini on Mac can now use your computer](<https://www.theverge.com/tech/1037902/google-gemini-macos-ai-computer-use>) · The Verge AI · 2026-11-19 · 命中 workflows
- [Google gives Gemini the ability to use your Mac for you](<https://techcrunch.com/2026/11/19/google-gives-gemini-the-ability-to-use-your-mac-for-you/>) · TechCrunch AI · 2026-11-19 · 命中 workflows

编辑核查 · 核对沙盒、审批、审查及自动执行示例；区分各工具的适用条件与行为差异。
