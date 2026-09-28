# Contributing

Thanks for taking the time to improve `dsh-autonomy`.

## Before opening a change

- Use the latest published DeepSeek Harness version that the repository currently declares compatible.
- Search existing issues before opening a duplicate.
- Keep a pull request focused on one behavior or one documentation concern.
- For behavior changes, describe the user-visible contract before describing the implementation.

## Local setup

This project requires Node.js `^22.19.0 || >=24.0.0` and pnpm 11.7.0.

```sh
pnpm install
pnpm run check
pnpm run pack:check
```

`pnpm run check` runs type checking, tests, and a production build. `pack:check` verifies the files that would be included in the npm package.

## Compatibility checks

The frozen lockfile uses DSH `0.1.7-rc.2`. CI also tests the older supported
API families and the pinned alpha release. Scheduled checks resolve the current
`latest`, `next`, and `alpha` tags.

In a disposable copy of the repository, run:

```sh
node scripts/install-dsh.mjs 0.1.7-alpha.2
pnpm run check
DSH_VERSION=0.1.7-alpha.2 bash scripts/smoke-web.sh
```

The installer rewrites `package.json`, `pnpm-workspace.yaml`, and the lockfile
for that API family. Do not commit those temporary matrix changes. The Web smoke
script uses a temporary DSH home, disables telemetry, loads the authenticated
client bundle, and verifies uninstall. Set `DSH_PORT` if port 3198 is occupied.

## Tests

Changes to Host behavior should cover both the advertised tool surface and the execution gate. A Chat-mode test is incomplete if it checks only the system prompt or only the visible tools.

Changes to session behavior should cover isolation between sessions and recovery from the durable command log. Client changes should cover the command sent to the selected session and all returned error shapes they handle.

## Pull requests

Include:

- the DSH and plugin versions used;
- the operating system when behavior is platform-sensitive;
- the commands you ran;
- screenshots for visible Web UI changes;
- a note about compatibility or migration when persisted state changes.

Do not commit local credentials, DSH profiles, session logs, generated tarballs, or copied upstream build output.

## Bug reports

A useful report includes the install command, active profile, exact DSH version, exact plugin version, reproduction steps, expected result, actual result, and the first relevant Host or browser error. Remove credentials and private workspace content before posting logs.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead of opening a public issue with exploit details.
