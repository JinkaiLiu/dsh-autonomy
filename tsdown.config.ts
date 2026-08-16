import { defineConfig } from 'tsdown'

const packageId = 'dsh-autonomy'
const clientExternals = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
]

export default defineConfig([
  {
    name: packageId,
    entry: ['src/index.ts', 'src/types.ts', 'src/client-types.ts'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: `${packageId}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    deps: { neverBundle: clientExternals },
    dts: false,
    clean: false,
    outputOptions: {
      entryFileNames: 'client.cjs',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(packageId)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
