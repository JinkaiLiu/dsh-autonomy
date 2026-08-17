# dsh-autonomy

[English](README.md) | 简体中文

无需离开当前 DeepSeek Harness 会话，即可在 **Chat** 与 **Agent** 之间切换。

`dsh-autonomy` 会在 Web 输入框上方增加一行始终可见的 `Chat | Agent` 控件。它不会覆盖文本框，也不会占用输入框的工具栏。模式属于当前会话，刷新和恢复后仍然保留，并通过持久会话日志跟随 fork。

## 为什么需要它

有时你希望 Harness 调查问题、修改文件、执行命令并持续工作；有时你只需要一个简洁回答，希望自己掌握下一步。

切换 agent preset 无法很好地解决会话中途的这种变化。`dsh-autonomy` 只改变当前会话的自主执行状态，不会替换模型、preset、历史、sandbox 或 permission policy。

这个插件源于 [DeepSeek Harness Discussion #1644](https://github.com/deepseek-ai/deepseek-harness/discussions/1644) 中提出的需求。

## 控制自主执行，而不是设置 token 硬上限

当你只需要回答、解释或紧密协作时，Chat 模式可以减少意外的 token 消耗：

- 从模型请求中移除工具 schema；
- 阻止自主工具循环和后续执行步骤。

这可以避免 [Discussion #1644](https://github.com/deepseek-ai/deepseek-harness/discussions/1644) 中描述的 agent 会话失控消耗。

`dsh-autonomy` 不是 token 预算管理器，也不是硬性使用上限。对话历史、提示词大小、模型输出和供应商价格仍然决定最终成本。它控制的是何时允许 agent 执行。

| 模式 | 模型看到工具 | 工具执行 | 典型回合 |
| --- | --- | --- | --- |
| **Chat** | 否 | 拒绝 | 一次文本回答 |
| **Agent** | 原始 DSH 工具集 | 原始 DSH 策略 | 正常 agent 循环 |

## 安装

当前版本面向 DeepSeek Harness `0.1.0-rc.6`。

先确认 DeepSeek Harness CLI 可用，不要求全局安装：

```sh
npx @deepseek-ai/dsh --version
```

从 npm 安装：

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-autonomy
npx @deepseek-ai/dsh web
```

如果 DSH Web 在安装时已经运行，请用 `Ctrl+C` 停止后重新启动。正在运行的进程不会热加载刚安装的插件。如果默认端口已被占用，请停止旧进程，或使用其他端口测试：`npx @deepseek-ai/dsh web --port 3081`。

从本地源码安装：

```sh
pnpm install
pnpm run build
npx @deepseek-ai/dsh plugin --profile web add /absolute/path/to/dsh-autonomy
npx @deepseek-ai/dsh web
```

包中声明了 DSH bundle，因此 `dsh plugin` 会同时把 Host 行为和 Web 客户端控件加入指定 profile。

通过 GitHub 源码安装时，DSH 的 pnpm profile 必须允许本包的 `prepare` 构建。registry release 或预构建 tarball 已包含构建产物，不需要安装期构建权限。

## 使用

点击输入框上方的 `Chat` 或 `Agent`，也可以输入：

```text
/autonomy chat
/autonomy agent
```

每次有效切换都会立即写入 DSH 内置命令日志，即使当时仍有回合在进行。这个记录同时驱动 UI、跨重启恢复状态，并立即更新策略门禁，无需等待下一次模型步骤。

## Chat 模式如何执行约束

Chat 模式使用三个互相对齐的层次：

1. 限制 agent 继承的工具表面；
2. 从最终模型请求中移除所有剩余工具 schema，包括保留的 Code Mode transport；
3. 如果 provider 仍然发出已记忆或未声明的工具调用，在执行阶段拒绝它。

它还会加入一段简短系统指令，让模型直接回答；任务确实需要执行时，请用户切回 Agent。

这比只用提示词要求“不要使用工具”更强，也比在第二步拒绝执行更可靠：模型可能在第一次响应中就请求工具，因此仅限制步骤数并不能形成 Chat 模式。

## 重要边界

切到 Chat 会阻止尚未通过执行门禁的工具调用，但不能撤销已经开始的工具，也不能回滚更早的副作用。需要取消当前回合时，请使用现有的 Stop 控件。

Chat 模式不会削弱或替换 DSH 的 sandbox 与 permission policy。Agent 模式恢复组合后的原始工具行为，现有策略仍然决定这些工具能否执行。

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖已安装行：

```yaml
- id: autonomy
  config:
    defaultMode: agent
    chatGuidance: >-
      You are in Chat mode. Answer directly in text. Do not use tools or take actions.
      Ask the user to switch to Agent mode when the request requires execution.
    denyMessage: >-
      Chat mode does not allow tool execution. Switch to Agent mode to use tools.
```

默认模式是 `agent`，引导文字与上面的内容等价。

## 开发

```sh
pnpm install
pnpm run check
pnpm run pack:check
```

本包包含一个 DSH Host 插件和一个浏览器客户端 bundle。测试使用真实的 DSH session、command、system-prompt、tool、agent-scope 与 execution 服务，仅对 Agent 对象使用最小替身。

## 状态

这是面向 DeepSeek Harness developer preview 的 MVP。DSH 仍处于预览阶段，预计会出现破坏兼容性的上游变化。
