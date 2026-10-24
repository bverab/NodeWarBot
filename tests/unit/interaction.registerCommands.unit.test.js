const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadCommands, registerCommands, run } = require('../../src/register-commands');

const GOOD_COMMAND = name => `module.exports = {
  data: { toJSON: () => ({ name: '${name}', description: 'cmd' }) },
  execute: async () => null
};
`;

describe('register-commands (C-16)', () => {
  let dir;
  const silent = { log: () => null, warn: () => null, error: () => null };
  const baseEnv = { TOKEN: 'test-token', CLIENT_ID: '123456789012345678', GUILD_ID: '111111111111111111,222222222222222222' };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodewarbot-commands-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeCommand(fileName, source) {
    fs.writeFileSync(path.join(dir, fileName), source);
  }

  function buildRest(impl) {
    return { put: vi.fn(impl || (async () => [])) };
  }

  it('un comando roto aborta antes de llamar a put (no borra comandos del servidor)', async () => {
    writeCommand('ok.js', GOOD_COMMAND('ok'));
    writeCommand('roto.js', "throw new Error('fallo al cargar');\n");
    const rest = buildRest();

    await expect(registerCommands({ commandsPath: dir, env: baseEnv, rest, logger: silent }))
      .rejects.toThrow(/roto\.js/);

    expect(rest.put).not.toHaveBeenCalled();
  });

  it('run devuelve codigo distinto de 0 con un comando roto y no llama a put', async () => {
    writeCommand('ok.js', GOOD_COMMAND('ok'));
    writeCommand('roto.js', "throw new Error('fallo al cargar');\n");
    const rest = buildRest();

    const code = await run({ commandsPath: dir, env: baseEnv, rest, logger: silent });

    expect(code).toBe(1);
    expect(rest.put).not.toHaveBeenCalled();
  });

  it('archivos auxiliares sin data/execute se ignoran sin abortar', async () => {
    writeCommand('ok.js', GOOD_COMMAND('ok'));
    writeCommand('helper.js', 'module.exports = { util: () => 1 };\n');
    writeCommand('leeme.txt', 'no es js');

    const { commands, failures } = loadCommands(dir);

    expect(failures).toEqual([]);
    expect(commands.map(command => command.name)).toEqual(['ok']);
  });

  it('registra en todos los servidores y devuelve 0 si todo sale bien', async () => {
    writeCommand('ok.js', GOOD_COMMAND('ok'));
    const rest = buildRest();

    const code = await run({ commandsPath: dir, env: baseEnv, rest, logger: silent });

    expect(code).toBe(0);
    expect(rest.put).toHaveBeenCalledTimes(2);
    expect(rest.put.mock.calls[0][1]).toEqual({ body: [{ name: 'ok', description: 'cmd' }] });
  });

  it('devuelve distinto de 0 si falla cualquier servidor, aunque otros funcionen', async () => {
    writeCommand('ok.js', GOOD_COMMAND('ok'));
    let call = 0;
    const rest = buildRest(async () => {
      call += 1;
      if (call === 2) throw Object.assign(new Error('Missing Access'), { code: 50001, status: 403 });
      return [];
    });

    const code = await run({ commandsPath: dir, env: baseEnv, rest, logger: silent });

    expect(code).toBe(1);
    expect(rest.put).toHaveBeenCalledTimes(2);
  });

  it('valida TOKEN antes de registrar', async () => {
    writeCommand('ok.js', GOOD_COMMAND('ok'));
    const rest = buildRest();

    const code = await run({
      commandsPath: dir,
      env: { CLIENT_ID: baseEnv.CLIENT_ID, GUILD_ID: baseEnv.GUILD_ID },
      rest,
      logger: silent
    });

    expect(code).toBe(1);
    expect(rest.put).not.toHaveBeenCalled();
  });

  it('el modulo se puede importar sin ejecutar el registro', () => {
    expect(typeof run).toBe('function');
    expect(typeof registerCommands).toBe('function');
  });
});
