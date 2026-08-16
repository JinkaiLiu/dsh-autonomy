# dsh-autonomy

Switch between **Chat** and **Agent** without leaving your DeepSeek Harness session.

`dsh-autonomy` adds an always-visible `Chat | Agent` control on a dedicated row above the Web composer. It never overlays the text area or consumes space in the composer's tool row. The selection belongs to the current session, survives reloads and resumes, and follows a fork through the durable session log.

## Why

Sometimes you want the harness to investigate, edit files, run commands, and keep going. Sometimes you only want a concise answer while you stay in control.

Changing agent presets does not solve that mid-session. `dsh-autonomy` changes the current session's autonomy without replacing its model, preset, history, sandbox, or permission policy.

The plugin was built in response to [DeepSeek Harness Discussion #1644](https://github.com/deepseek-ai/deepseek-harness/discussions/1644).

| Mode | Model sees tools | Tool execution | Typical turn |
| --- | --- | --- | --- |
| **Chat** | No | Denied | One text response |
| **Agent** | Original DSH tool set | Original DSH policy | Normal agent loop |

## Install

This release targets DeepSeek Harness `0.1.0-rc.6`.

From npm:

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-autonomy
npx @deepseek-ai/dsh web
```

From a local checkout:

```sh
pnpm install
pnpm run build
npx @deepseek-ai/dsh plugin --profile web add /absolute/path/to/dsh-autonomy
npx @deepseek-ai/dsh web
```

The package declares a DSH bundle, so `dsh plugin` adds both its host behavior and Web client control to the selected profile.

For a GitHub install, DSH's pnpm profile must allow this package's `prepare` build before retrying the add. A registry release or packed tarball ships built files and needs no install-time build permission.

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

Switching to Chat prevents tool calls that have not passed the execution gate yet. It cannot undo a tool body that already started or roll back an earlier side effect. Use the existing Stop control when you need to cancel an active turn.

Chat mode does not weaken or replace DSH sandbox and permission policies. Agent mode restores the composed tool behavior; the existing policies still decide what those tools may do.

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

The package contains one DSH host plugin and one browser client bundle. Tests use the real DSH session, command, system-prompt, tool, agent-scope, and execution services; only the Agent object is kept minimal. The release gate also installs the packed tarball into a clean DSH home and verifies Web UI switching plus cold-session recovery.

## Status

MVP for the DeepSeek Harness developer preview. Compatibility-breaking upstream changes are expected while DSH remains in preview.
