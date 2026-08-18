# Changelog

All notable changes to `dsh-autonomy` are documented here.

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
