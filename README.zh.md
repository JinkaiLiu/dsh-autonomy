# dsh-autonomy

[![npm version](https://img.shields.io/npm/v/dsh-autonomy)](https://www.npmjs.com/package/dsh-autonomy)
[![CI](https://github.com/JinkaiLiu/dsh-autonomy/actions/workflows/ci.yml/badge.svg)](https://github.com/JinkaiLiu/dsh-autonomy/actions/workflows/ci.yml)

[English](README.md) | 简体中文

**在同一个 DeepSeek Harness 会话中，随时切换 Chat 与 Agent。**

`dsh-autonomy` 是一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，在 Web 输入框上方添加 **Chat | Agent** 切换控件。先用 Chat 讨论方案，准备好后切到 Agent 执行，整个过程沿用同一段对话。

| 模式 | 适合做什么 | 行为 |
| --- | --- | --- |
| **Chat** | 提问、解释、讨论方案 | 以文字回答，模型看不到工具，也无法执行工具调用。 |
| **Agent** | 调查问题、修改文件、执行命令 | 使用 DSH 原有的工具和自动执行流程，遵循现有权限策略。 |

[快速开始](#快速开始) · [配置](#配置) · [兼容性](#兼容性) · [故障排查](#故障排查)

## 快速开始

需要已配置好的 DeepSeek Harness，以及 Node.js `^22.19.0 || >=24.0.0`。将插件安装到 Web profile（配置方案）中，然后启动 DSH Web：

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-autonomy
npx @deepseek-ai/dsh web
```

这些命令通过 `npx` 调用官方 CLI，无需全局安装 `dsh`。安装命令会同时添加插件的服务端功能和 Web 控件。

如果 DSH Web 已在运行，用 `Ctrl+C` 停止后重新启动，让它加载插件。

打开会话，点击输入框上方的 **Chat** 或 **Agent**。也可以输入斜杠命令：

```text
/autonomy chat
/autonomy agent
```

默认模式为 **Agent**。每个会话独立保存自己的选择，刷新页面、重启 DSH 或恢复会话后仍然保留；通过 fork 派生的会话会继承其历史中记录的模式。切换时，模型、预设、对话历史和未发送的草稿都保持不变。

任务进行中也可以切换。切换会立即影响尚未通过执行检查的工具调用。

> **已经开始的操作：** 切到 Chat 后，已经开始执行的工具仍可完成，之前产生的修改也不会回滚。如果要取消当前回合，请使用 DSH 的 **Stop** 控件。

<details>
<summary>从本地源码安装</summary>

需要 pnpm `11.7.0`。将 `/absolute/path/to/dsh-autonomy` 替换为克隆后的项目目录绝对路径。

```sh
git clone https://github.com/JinkaiLiu/dsh-autonomy.git
cd dsh-autonomy
pnpm install
pnpm run build
npx @deepseek-ai/dsh plugin --profile web add /absolute/path/to/dsh-autonomy
npx @deepseek-ai/dsh web
```

</details>

## 工作原理

Chat 模式限制当前会话的工具访问，从最终模型请求中移除所有工具定义（包括 DSH 保留的 Code Mode 工具），并在执行时拦截工具调用。它还会添加一段简短的系统指令，让模型直接回答，并在任务需要实际操作时提示用户切换到 Agent。

Agent 模式恢复 DSH 原有的工具访问和自动执行流程。两种模式都遵循 DSH 现有的沙箱和权限策略。

每次成功切换都会写入 DSH 内置的会话命令日志。Web 控件和服务端逻辑通过同一份记录恢复模式。

Chat 省去了工具定义和自主工具循环，可以减少部分 token 消耗。插件不设置 token 预算或使用上限，实际成本仍取决于对话历史、提示词大小、模型输出和服务商价格。

## 配置

安装后无需额外配置。如果希望尚未选择过模式的会话默认使用 Chat，可以修改 Web profile 的 `cordis.patch.yml` 中已有的 `autonomy` 条目：

```yaml
- id: autonomy
  config:
    defaultMode: chat
```

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `defaultMode` | `agent` | 会话尚未保存模式时的默认值，可选 `chat` 或 `agent`。 |
| `chatGuidance` | 内置 Chat 指令 | Chat 模式下添加的系统指令。 |
| `denyMessage` | 内置工具拒绝提示 | Chat 模式拦截工具调用时返回的错误信息。 |

修改 `defaultMode` 不会覆盖已有会话保存的选择。自定义提示文字也不会改变工具限制。

## 兼容性

`dsh-autonomy 0.1.4` 以 DSH `0.2.0-rc.2` 为开发基线，同时支持 DSH `0.2.1-alpha.1`。各版本的验证记录见[更新日志](CHANGELOG.md)。

<details>
<summary>CI 覆盖的早期 DSH 版本</summary>

- `0.1.0-rc.6` 和 `0.1.0-rc.7`
- `0.1.1-rc.2`
- `0.1.2-rc.1`
- `0.1.7-alpha.2` 和 `0.1.7-rc.2`

</details>

定时 CI 还会检查 DSH 的 `latest`、`next` 和 `alpha` 标签当前对应的精确版本。插件目前仍是面向 DSH 开发预览版的早期版本，上游变更可能需要插件同步更新。

## 故障排查

| 现象 | 排查方法 |
| --- | --- |
| 没有出现切换控件 | 确认安装到了 `web` profile，重启 DSH Web 后刷新浏览器。 |
| `unknown command: /autonomy` | 浏览器控件已加载，但服务端插件未加载。停止旧 DSH 进程，再用相同 profile 启动。 |
| 默认端口被占用 | 停止旧进程，或使用 `npx @deepseek-ai/dsh web --port 3081` 更换端口。 |
| 从 GitHub 源码安装时要求构建授权 | 在对应 profile 中允许本包的 `prepare` 脚本，或改用已构建好的 npm 版本。 |

如果问题仍然存在，请[提交 issue](https://github.com/JinkaiLiu/dsh-autonomy/issues)，附上 DSH 和插件版本、安装命令、使用的 profile、操作系统，以及首条相关服务端错误。安全问题请按 [SECURITY.md](SECURITY.md) 的说明报告。

## 卸载

从安装时使用的 profile 中移除插件，然后重启 DSH Web：

```sh
npx @deepseek-ai/dsh plugin --profile web remove dsh-autonomy
npx @deepseek-ai/dsh web
```

历史 `/autonomy` 命令仍会保留在会话日志中，卸载后不再产生作用。

## 权限与数据

插件只通过 DSH 现有的会话日志保存模式，不创建额外的数据库或配置目录。服务端插件不发起网络请求、不收集遥测、不访问服务商凭据，也不读写工作区文件。浏览器控件向本地 DSH 命令服务发送模式切换命令，每条命令只影响选中的会话。

与其他 Cordis 插件一样，它以 DSH 服务端进程的权限运行。在包含敏感数据的环境中安装前，请先检查源码。

## 参与开发

在本地项目目录运行：

```sh
pnpm install
pnpm run check
pnpm run pack:check
```

`check` 会执行类型检查、服务端与客户端测试，以及生产构建。CI 还会检查打包内容，并在隔离 profile 中验证安装、Web 加载和卸载。开发环境与兼容性检查的详细说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

插件源于 [DeepSeek Harness Discussion #1644](https://github.com/deepseek-ai/deepseek-harness/discussions/1644) 中提出的协作方式。

## 许可证

[MIT](LICENSE)。
