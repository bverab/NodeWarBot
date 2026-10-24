// ESLint (flat config). Las reglas arrancan en "warn": informan sin bloquear (`pnpm lint` sale con 0).
// Se endurecen por tandas a medida que se corrigen los avisos.
const js = require('@eslint/js');
const globals = require('globals');
const { defineConfig, globalIgnores } = require('eslint/config');
const { FlatCompat } = require('@eslint/eslintrc');

// eslint-config-next 15 usa el formato eslintrc: se adapta con FlatCompat.
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended
});

const commonjs = { ecmaVersion: 2023, sourceType: 'commonjs' };

const config = defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '.worktrees/**',
    'coverage/**',
    'data/**',
    'assets/**',
    'apps/dashboard/public/**',
    'apps/dashboard/next-env.d.ts'
  ]),

  // Bot, scripts y configuracion: CommonJS en Node.
  {
    files: ['src/**/*.js', 'scripts/**/*.js', 'prisma/**/*.js', '*.config.js', 'apps/dashboard/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ...commonjs, globals: { ...globals.node } }
  },

  // Tests JavaScript: Vitest con globals.
  {
    files: ['tests/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ...commonjs, globals: { ...globals.node, ...globals.vitest } }
  },

  // Dashboard (Next.js) y tests TypeScript.
  {
    files: ['apps/dashboard/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    extends: compat.extends('next/core-web-vitals', 'next/typescript'),
    settings: { next: { rootDir: 'apps/dashboard' } }
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } }
  }
]);

// Toda regla activa se degrada a "warn" (las desactivadas se respetan).
function downgradeToWarnings(configs) {
  return configs.map(entry => {
    if (!entry.rules) return entry;
    const rules = {};
    for (const [name, value] of Object.entries(entry.rules)) {
      const severity = Array.isArray(value) ? value[0] : value;
      if (severity === 'off' || severity === 0) {
        rules[name] = value;
      } else {
        rules[name] = Array.isArray(value) ? ['warn', ...value.slice(1)] : 'warn';
      }
    }
    return { ...entry, rules };
  });
}

module.exports = downgradeToWarnings(config);
