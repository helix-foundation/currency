import type { Options } from 'tsup'

const config: Options = {
    entry: ['src/index.ts'],
    outDir: './',
    target: 'es2020',
    dts: true,
    sourcemap: true,
}

export default config