const Path = require('path');
const Fs = require('fs');
const ts = require('rollup-plugin-typescript2');
const node = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const alias = require('@rollup/plugin-alias');
const json = require('@rollup/plugin-json');
const replace = require('@rollup/plugin-replace');
const dts = require('rollup-plugin-dts').default;

/** @type {import('rollup').RollupOptions[]} */
const configurations = [];
const projectDir = __dirname;
const filter = process.env.FILTER || '';
const isProd = process.env.BUILD === 'production';

const env = {
  __DEV__: isProd ? 'false' : 'process.env.NODE_ENV !== "production"',
  'process.env.NODE_ENV': isProd ? '"production"' : '"development"',
};

const packages = Fs.readdirSync(Path.resolve(projectDir, './packages/@vuedx'));
const extensions = ['vue', 'vue-language-features'];

createConfig('packages/@vuedx', packages);
createConfig('extensions', extensions);

export default configurations;

function createTs(pkgDir) {
  return ts({
    include: [/\.ts$/],
    exclude: [],
    check: false,
    tsconfigOverride: {
      compilerOptions: {
        module: 'ESNext',
        target: 'ES2018',
        baseUrl: '.',
        rootDir: pkgDir,
        paths: {},
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        sourceMap: true,
        declaration: false,
      },
      include: ['src'],
    },
  });
}

function createConfig(dir, names, external = []) {
  names.forEach((name) => {
    const pkgDir = Path.resolve(projectDir, dir, name);

    if (!pkgDir.match(filter)) return;

    const outDir = Path.resolve(pkgDir, 'dist');
    const pkg = require(Path.resolve(pkgDir, 'package.json'));

    if (Fs.existsSync(outDir)) {
      Fs.rmdirSync(outDir, { recursive: true });
    }

    try {
      /** @type {import('rollup').RollupOptions} */
      const options = {
        input: Path.relative(projectDir, Path.resolve(pkgDir, 'src/index.ts')),
        external: [
          // VS Code
          'vscode',
          'postcss',
          // Node
          'path',
          'fs',
          'events',
          'querystring',
          'assert',
          'url',
          'util',
          'os',
        ]
          .concat(Object.keys(pkg.dependencies || {}))
          .concat(external),
        context: 'null',
        plugins: [
          alias({
            entries: [{ find: /@vue\/compiler-core$/, replacement: '@vue/compiler-core/dist/compiler-core.cjs' }],
          }),
          json(),
          node(),
          createTs(pkgDir),
          replace(env),
          replace({
            "loadDep('@babel/parser')": "require('@babel/parser')",
            "loadDep('estree-walker')": "require('estree-walker')",
            "loadDep('source-map')": "require('source-map')",
            delimiters: ['', ''],
          }),
          commonjs({
            dynamicRequireTargets: ['@babel/types'],
            namedExports: {
              '@babel/types': [
                'isCallExpression',
                'isIdentifier',
                'isBlockStatement',
                'isArrayExpression',
                'isObjectExpression',
                'isMemberExpression',
                'isConditionalExpression',
                'isObjectProperty',
                'isExportNamedDeclaration',
                'isReturnStatement',
              ],
            },
          }),
        ],
        treeshake: {
          annotations: true,
          moduleSideEffects: false,
          unknownGlobalSideEffects: false,
          propertyReadSideEffects: false,
        },
        onwarn(warning, fn) {
          if (warning.code === 'CIRCULAR_DEPENDENCY') {
            if (/(inversify|VirtualTextDocument|@babel\/types)/.test(warning.message)) return;
          }
          fn(warning);
        },
      };

      if (pkg.main) {
        configurations.push({
          ...options,
          output: {
            file: Path.resolve(pkgDir, pkg.main),
            format: 'cjs',
            sourcemap: true,
          },
        });
      }

      if (pkg.module) {
        configurations.push({
          ...options,
          output: {
            file: Path.resolve(pkgDir, pkg.module),
            format: 'esm',
            sourcemap: true,
          },
        });
      }

      if (pkg.types) {
        configurations.push({
          input: options.input,
          output: {
            file: Path.resolve(pkgDir, pkg.types),
            format: 'esm',
            sourcemap: true,
          },
          onwarn: options.onwarn,
          plugins: [dts()],
        });
      }
    } catch (e) {
      console.error(e);
    }
  });
}
