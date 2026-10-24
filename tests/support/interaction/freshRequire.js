const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const srcRoot = path.join(repoRoot, 'src') + path.sep;

/**
 * vi.resetModules() no limpia la cache de `require` de CommonJS, asi que los modulos con
 * estado propio (caches, stores) se comparten entre tests del mismo archivo.
 * resetSrcModules descarta de la cache todo lo que hay bajo `src/`; los `require` posteriores
 * cargan instancias limpias (y permiten parchear exports antes de cargar a los consumidores).
 */
function resetSrcModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(srcRoot)) {
      delete require.cache[key];
    }
  }
}

/** Reinicia la cache de src/ y carga el modulo pedido (ruta relativa a la raiz del repo). */
function freshRequire(modulePath) {
  resetSrcModules();
  return require(path.join(repoRoot, modulePath));
}

/** require de un modulo de src/ (ruta relativa a la raiz del repo) sin reiniciar la cache. */
function requireSrc(modulePath) {
  return require(path.join(repoRoot, modulePath));
}

module.exports = { freshRequire, resetSrcModules, requireSrc };
