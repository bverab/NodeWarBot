const { configDefaults, defineConfig } = require('vitest/config');

module.exports = defineConfig({
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
