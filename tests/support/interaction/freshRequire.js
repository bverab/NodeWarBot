const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const srcRoot = path.join(repoRoot, 'src') + path.sep;

/**
 * vi.resetModules() no limpia la cache de `require` de CommonJS, asi que los modulos con
 * estado propio (caches, stores) se comparten entre tests del mismo archivo.
 * freshRequire descarta de la cache todo lo que hay bajo `src/` y carga el modulo pedido
 * (ruta relativa a la raiz del repo, p. ej. 'src/utils/cronHelper') con estado limpio.
 */
function freshRequire(modulePath) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(srcRoot)) {
      delete require.cache[key];
    }
  }
  return require(path.join(repoRoot, modulePath));
}

module.exports = { freshRequire };
