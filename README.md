# dsh-autonomy

English | [简体中文](README.zh.md)

Switch between **Chat** and **Agent** without leaving your DeepSeek Harness session.

`dsh-autonomy` adds an always-visible `Chat | Agent` control on a dedicated row above the Web composer. It never overlays the text area or consumes space in the composer's tool row. The selection belongs to the current session, survives reloads and resumes, and follows a fork through the durable session log.

## Why

Sometimes you want the harness to investigate, edit files, run commands, and keep going. Sometimes you only want a concise answer while you stay in control.

Changing agent presets does not solve that mid-session. `dsh-autonomy` changes the current session's autonomy without replacing its model, preset, history, sandbox, or permission policy.

The plugin was built in response to [DeepSeek Harness Discussion #1644](https://github.com/deepseek-ai/deepseek-harness/discussions/1644).

## Token control, not a token cap

Chat mode can reduce accidental token spend when you only need an answer, explanation, or tightly guided collaboration.

It does this in two ways:

- Tool schemas are removed from the model request.
- Autonomous tool loops and follow-up execution steps are prevented.

This can avoid the kind of runaway agent session described in [DeepSeek Harness Discussion #1644](https://github.com/deepseek-ai/deepseek-harness/discussions/1644).

`dsh-autonomy` is not a token budget manager or a hard usage limit. Conversation history, prompt size, model output, and provider pricing still determine the final cost. It gives you direct control over when agentic execution is allowed.

| Mode | Model sees tools | Tool execution | Typical turn |
| --- | --- | --- | --- |
| **Chat** | No | Denied | One text response |
| **Agent** | Original DSH tool set | Original DSH policy | Normal agent loop |

## Install

`dsh-autonomy 0.1.4` uses DSH `0.2.0-rc.2` as the development baseline and supports `0.2.1-alpha.1`. Compatibility checks also cover `0.1.0-rc.6`, `0.1.0-rc.7`, `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.7-alpha.2`, and `0.1.7-rc.2`. Use Node.js `^22.19.0` or `>=24.0.0`.

You need a working DeepSeek Harness CLI. Verify it without requiring a global installation:

```sh
npx @deepseek-ai/dsh --version
```

If your existing Harness setup does not provide a global `dsh` command, keep using the `npx @deepseek-ai/dsh` form shown below. It invokes the official CLI directly, so a separate global `dsh` installation is not required.

From npm:

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-autonomy
npx @deepseek-ai/dsh web
```

If DSH Web was already running during installation, stop it with `Ctrl+C` and start it again. An existing process does not hot-load newly installed plugins. If the default port is already occupied, stop the old DSH process or test on another port with `npx @deepseek-ai/dsh web --port 3081`.

From a local checkout:

```sh
pnpm install
pnpm run build
npx @deepseek-ai/dsh plugin --profile web add /absolute/path/to/dsh-autonomy
npx @deepseek-ai/dsh web
```

The package declares a DSH bundle, so `dsh plugin` adds both its host behavior and Web client control to the selected profile.

For a GitHub install, DSH's pnpm profile must allow this package's `prepare` build before retrying the add. A registry release or packed tarball ships built files and needs no install-time build permission.

## Uninstall

Remove the bundle from the same profile where it was installed, then restart DSH Web:

```sh
npx @deepseek-ai/dsh plugin --profile web remove dsh-autonomy
npx @deepseek-ai/dsh web
```

The plugin does not keep a separate database or configuration directory. Historical `/autonomy` command records remain part of the session log, but have no effect after the plugin is removed.

## Use

Click `Chat` or `Agent` above the composer, or run:

```text
/autonomy chat
/autonomy agent
```

Every valid switch is recorded immediately through DSH's built-in command log, including during an open turn. That same record drives the UI, survives reloads, and changes the policy gates without waiting for another model step.

## What Chat mode enforces

Chat mode uses three aligned layers:

1. It restricts the agent's inherited tool surface.
2. It removes every remaining tool schema from the final model request, including the reserved Code Mode transport.
3. It guards execution in case a provider emits a remembered or otherwise unadvertised tool call.

It also adds a short system instruction telling the model to answer directly and ask the user to switch to Agent when action is required.

This is intentionally stronger than a prompt-only "please do not use tools" mode. It is also more reliable than rejecting step two: a model can request a tool in its first response, so step-count limiting alone does not create Chat mode.

## Important boundary

Switching to Chat prevents tool calls that have not passed the execution gate yet. A tool body that is already running is not cancelled by the mode change, and earlier side effects are not rolled back. No action is required if you want that operation to finish; use the existing Stop control only when you want to cancel the active turn.

Chat mode does not weaken or replace DSH sandbox and permission policies. Agent mode restores the composed tool behavior; the existing policies still decide what those tools may do.

## Permissions and data

`dsh-autonomy` runs in the DSH host process, as other trusted Cordis plugins do. It:

- does not make network requests, collect telemetry, or read provider credentials;
- does not read or write workspace files;
- records mode changes only through DSH's existing session command log;
- changes tool visibility and execution policy only for the affected session;
- sends `/autonomy chat` or `/autonomy agent` from the browser control to the local DSH command service.

Installing any third-party DSH plugin executes its code with the privileges of the DSH process. Review the source and package contents before installing it in an environment that holds sensitive data.

## Troubleshooting

- **The switch is missing:** restart the DSH Web process after installation, confirm that the plugin was added to the `web` profile, then refresh the browser.
- **`unknown command: /autonomy`:** the Web client loaded but the host bundle did not. Stop every old DSH process and start the same profile again.
- **The default port is occupied:** stop the older process or start with another port, for example `npx @deepseek-ai/dsh web --port 3081`.
- **A GitHub-source install asks for build approval:** allow the package's `prepare` script in that profile, or use the prebuilt npm release.
- **A tool was already running when Chat was selected:** no action is required if you want it to finish. Use Stop only if you want to cancel the active turn; the mode switch cannot roll back an earlier side effect.

When reporting a problem, include the DSH version, plugin version, install command, active profile, operating system, and the first relevant host error.

## Configuration

Override the installed row in the profile's `cordis.patch.yml`:

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

Defaults are `defaultMode: agent` and the guidance shown above in equivalent wording.

## Development

```sh
pnpm install
pnpm run check
pnpm run pack:check
```

The package contains one DSH host plugin and one browser client bundle. Tests use the real DSH session, command, system-prompt, tool, agent-scope, and execution services; only the Agent object is kept minimal.

CI runs type checking, the host and client test suites, a production build, packed-file inspection, and `publint` package validation. Scheduled compatibility jobs resolve and test the exact versions currently published under DSH `latest`, `next`, and `alpha`, then boot an isolated authenticated Web profile and fetch the plugin from the generated module route.

## Status

MVP for the DeepSeek Harness developer preview. Compatibility-breaking upstream changes are expected while DSH remains in preview.
