# Security Policy

## Supported versions

Security fixes are applied to the latest published `dsh-autonomy` release. The README names the DeepSeek Harness version against which that release was verified.

## Reporting a vulnerability

Please do not publish exploit details in a regular GitHub issue.

Use the repository's private **Report a vulnerability** form when it is available. If the form is not visible, contact the maintainer through the public GitHub profile and ask for a private reporting channel without including sensitive details in the initial message.

A useful report includes:

- affected plugin and DSH versions;
- operating system and active profile;
- a minimal reproduction;
- expected and actual policy behavior;
- whether the issue crosses a session, tool, process, or browser boundary;
- any known workaround.

Particularly relevant findings include a way to expose tools in Chat mode, execute a guarded tool, affect another session's mode, load unexpected browser code, read workspace data, contact the network, or access credentials contrary to the documented boundary.

## Scope reminder

DSH plugins run inside the DSH process. This plugin can restrict calls passing through the DSH tool runtime, but it is not an operating-system sandbox and cannot undo work that already started. Reports about the upstream sandbox or provider behavior should be filed with the corresponding upstream project unless `dsh-autonomy` changes that behavior.
