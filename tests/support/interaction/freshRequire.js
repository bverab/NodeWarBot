const path = require('path');

// La primera carga en frio de discord.js/Prisma dentro de un test o hook puede tardar varios segundos
// cuando la maquina esta cargada; se amplian los limites solo para los archivos que usan este soporte.
if (typeof vi !== 'undefined' && typeof vi.setConfig === 'function') {
  vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
}

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
