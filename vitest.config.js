const { configDefaults, defineConfig } = require('vitest/config');

// `server-only` lanza al importarse fuera de Next (solo exporta un modulo vacio bajo la condicion
// "react-server"). En los tests se sustituye por un modulo vacio, para cualquier importador.
const serverOnlyStub = {
  name: 'server-only-stub',
  enforce: 'pre',
  resolveId(id) {
    return id === 'server-only' ? '\0server-only-stub' : null;
  },
  load(id) {
    return id === '\0server-only-stub' ? 'export default {};' : null;
  }
};

module.exports = defineConfig({
  plugins: [serverOnlyStub],
  test: {
    environment: 'node',
    globals: true,
    exclude: [...configDefaults.exclude, '.worktrees/**'],
    setupFiles: ['tests/setup/env.js'],
    sequence: {
      concurrent: false
    },
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage'
    }
  }
});
