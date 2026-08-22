# Changelog

All notable changes to `dsh-autonomy` are documented here.

## Unreleased

## 0.1.1 - 2026-08-22

This is a compatibility and release-hardening update for both active DeepSeek Harness API families.

### Changed

- Clarified that Chat keeps the current session context, blocks later tool calls, and does not cancel an action already in progress.
- Kept the existing Stop control as the explicit way to cancel an active turn.
- Added dual session-projection registration for the DSH `0.1.0` and `0.1.1` prerelease API families.
- Updated the supported Node.js range to match current DSH releases: `^22.19.0 || >=24.0.0`.
- Declared the client runtime dependency explicitly in the Web bundle graph.

### Documentation

- Added a Simplified Chinese README.
- Documented uninstall steps, permissions, data handling, trust boundaries, and troubleshooting.
- Added contribution and security-reporting policies.

### Verification

- Added coverage for per-session isolation and mode recovery from replayed session logs.
- Added coverage for client-side remote and command failure responses.
- Added a regression test proving that an already-running tool can settle after switching to Chat while later tool calls are denied.
- Verified DSH `0.1.0-rc.6`, `0.1.0-rc.7`, and `0.1.1-rc.2`, with a weekly check against the current `next` tag.
- Expanded CI across Node.js 22, 24, and 26 on Linux, plus Node.js 24 on Windows.
- Added a packed-tarball gate that installs into an isolated DSH Web profile, boots the client bundle, and verifies clean uninstall.
- Kept package inspection and `publint` as a separate release check.

## 0.1.0 - 2026-08-16

### Added

- Added a per-session Chat/Agent toggle above the DeepSeek Harness composer.
- Made Chat mode remove tool schemas and reject tool execution at runtime.
- Persisted mode changes in the session event log through `/autonomy chat|agent`.
