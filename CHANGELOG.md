# Changelog

All notable changes to `dsh-autonomy` are documented here.

## 0.1.3 - 2026-09-28

### Changed

- Move the development baseline to DSH `0.1.7-rc.2` and declare compatibility
  with the `0.1.7-alpha.2` API family while retaining legacy API checks.
- Update Cordis, Schemastery, Zod, TypeScript, Vitest, and tsdown; deduplicate
  Zod to avoid incompatible recursive schema types during declaration builds.
- Express the Web toggle's consumed slot props directly so its declaration
  does not depend on transitive client type augmentations removed upstream.

### Fixed

- Resolve compatibility dependencies from the selected release's published
  manifests, including exact peer overrides, instead of installing retired
  packages such as `dsh-code-runtime` from a hard-coded list.
- Move the full Web smoke test to the current DSH release; the old
  `0.1.1-rc.2` CLI fails at startup with a missing Cordis HMR service.
- Resolve relative client bundle URLs against the Web origin, fixing malformed
  URLs after the upstream route format changed.
- Share authenticated install, Web boot, bundle fetch, and uninstall checks
  between the pinned package job and the scheduled channel jobs.

### Verification

- Check pinned legacy versions and `0.1.7-alpha.2` on every push and PR;
  monitor the exact versions behind `latest`, `next`, and `alpha` weekly.
- Add a real session-projection regression test covering committed mode
  changes, failed commands, replay, and session isolation.

## 0.1.2 - 2026-09-03

### Changed

- Added compatibility with the redesigned DSH `0.1.2` Session API by reading
  durable events through `snapshotEvents()` while retaining the rc fallback.
- Removed the Web client's direct dependency on the retired
  `@deepseek-ai/dsh-client-runtime` package and ordered it through the
  cross-version Conversation layer instead.
- Extended the declared peer ranges through DSH `0.1.2-alpha.5` and its later
  `0.1.2` prereleases.

### Verification

- Verified the complete Host and client test suites against DSH
  `0.1.2-alpha.5` and `0.1.2-rc.1` in addition to the existing rc baselines.
- Added scheduled `next` and `alpha` compatibility jobs that resolve the exact
  root DSH version before installing its API family.
- Added token-aware Web profile smoke coverage for the new batch plugin route.
- Verified in a real alpha Web client that Chat and Agent switch successfully
  and that the selected mode survives a page reload.

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
