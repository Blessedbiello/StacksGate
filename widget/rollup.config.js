import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/stacksgate.js',
      format: 'umd',
      name: 'StacksGate',
      sourcemap: !isProduction,
    },
    {
      file: 'dist/stacksgate.esm.js',
      format: 'es',
      sourcemap: !isProduction,
    },
  ],
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: !isProduction,
      inlineSources: !isProduction,
      compilerOptions: {
        noImplicitAny: false,
        strictNullChecks: false,
      },
    }),
    isProduction && terser({
      format: {
        comments: false,
      },
      compress: {
        drop_console: true,
      },
    }),
  ].filter(Boolean),
  external: [],
};