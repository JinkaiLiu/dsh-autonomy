# Changelog

All notable changes to `dsh-autonomy` are documented here.

## Unreleased

### Changed

- Clarified that Chat keeps the current session context, blocks later tool calls, and does not cancel an action already in progress.
- Kept the existing Stop control as the explicit way to cancel an active turn.

### Verification

- Added a regression test proving that an already-running tool can settle after switching to Chat while later tool calls are denied.
- Moved the development test environment to DeepSeek Harness `0.1.0-rc.7` while retaining the `0.1.0-rc.6` peer compatibility floor.

## 0.1.1 - 2026-08-17

This is a release-hardening update with no runtime behavior changes.

### Documentation

- Added a Simplified Chinese README.
- Documented uninstall steps, permissions, data handling, trust boundaries, and troubleshooting.
- Added contribution and security-reporting policies.

### Verification

- Added coverage for per-session isolation and mode recovery from replayed session logs.
- Added coverage for client-side remote and command failure responses.
- Expanded CI across Node.js 22 and 24 on Linux, plus Node.js 24 on Windows.
- Kept package inspection and `publint` as a separate release check.

## 0.1.0 - 2026-08-16

### Added

- Added a per-session Chat/Agent toggle above the DeepSeek Harness composer.
- Made Chat mode remove tool schemas and reject tool execution at runtime.
- Persisted mode changes in the session event log through `/autonomy chat|agent`.
