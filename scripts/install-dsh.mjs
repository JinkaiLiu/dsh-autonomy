import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

// Resolve the selected release's real dependency graph instead of keeping a
// second, inevitably stale list of upstream packages in the workflow.
const channel = process.argv[2]
if (!channel || !/^[\w.-]+$/.test(channel)) throw new Error('Usage: node scripts/install-dsh.mjs <version-or-tag>')
const metadata = async (name, version) => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${name}@${version}: registry HTTP ${response.status}`)
  return response.json()
}
const release = await metadata('@deepseek-ai/dsh', channel)
const version = release.version
console.log(`Testing DSH ${channel} at ${version}`)
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const roots = Object.keys(pkg.devDependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))
const seen = new Set()
let pending = roots
while (pending.length) {
  const batch = [...new Set(pending)].filter(name => !seen.has(name))
  batch.forEach(name => seen.add(name))
  pending = []
  const manifests = await Promise.all(batch.map(name => metadata(name, version)))
  for (const manifest of manifests) {
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (name.startsWith('@deepseek-ai/dsh-') && !manifest.peerDependenciesMeta?.[name]?.optional) pending.push(name)
    }
  }
}
for (const name of roots) pkg.devDependencies[name] = version
pkg.devDependencies['@deepseek-ai/cordis'] = release.dependencies['@deepseek-ai/cordis']
await writeFile('package.json', JSON.stringify(pkg, null, 2) + '\n')
// JSON is also YAML. Exact overrides keep auto-installed prerelease peers from
// drifting to the registry's latest tag or mixing incompatible API families.
await writeFile('pnpm-workspace.yaml', JSON.stringify({
  overrides: Object.fromEntries([...seen].sort().map(name => [name, version])),
  minimumReleaseAgeExclude: [...seen].sort().map(name => `${name}@${version}`),
}, null, 2) + '\n')
const result = spawnSync('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
if (process.env.GITHUB_ENV) await writeFile(process.env.GITHUB_ENV, `DSH_VERSION=${version}\n`, { flag: 'a' })
