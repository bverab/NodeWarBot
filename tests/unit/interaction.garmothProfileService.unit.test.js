const { refreshGarmothLink } = require('../../src/services/garmothProfileService');

const GOOD_URL = 'https://garmoth.com/character/Pepe';
const EMPTY_PAGE = '<html><head><title>x</title></head><body>nada util</body></html>';
const SEMANTIC_KEYS = ['characterName', 'className', 'spec'];

function buildLink(url = GOOD_URL) {
  return { garmothProfileUrl: url, characterName: 'Pepe', className: 'Warrior', spec: 'Awakening' };
}

function htmlResponse(html, extra = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url: extra.url || GOOD_URL,
    headers: new Headers(extra.headers || {}),
    text: async () => html,
    ...extra.overrides
  };
}

function redirectResponse(location, status = 302) {
  return {
    ok: false,
    status,
    statusText: 'Found',
    url: GOOD_URL,
    headers: new Headers({ location }),
    text: async () => ''
  };
}

function streamResponse(totalBytes, chunkSize = 1024 * 1024) {
  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkSize, totalBytes - sent);
      controller.enqueue(new Uint8Array(size).fill(97));
      sent += size;
    }
  });
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url: GOOD_URL,
    headers: new Headers(),
    body: stream,
    text: async () => {
      throw new Error('no deberia leerse con text() sin limite');
    }
  };
}

describe('refreshGarmothLink: endurecimiento del fetch (C-13)', () => {
  it('una URL guardada que no es de Garmoth falla sin hacer fetch', async () => {
    const fetchImpl = vi.fn();

    const result = await refreshGarmothLink(buildLink('https://evil.example/character/Pepe'), { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.syncStatus).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const key of SEMANTIC_KEYS) expect(result.patch).not.toHaveProperty(key);
  });

  it('una redireccion a otro host se rechaza antes de pedir ese host', async () => {
    const fetchImpl = vi.fn(async () => redirectResponse('https://evil.example/steal'));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.syncErrorMessage).toMatch(/Garmoth|host|redirec/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('si la respuesta final no es de un host de Garmoth (response.url) falla', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('<html>ok</html>', { url: 'https://evil.example/x' }));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.syncStatus).toBe('failed');
  });

  it('sigue redirecciones dentro de Garmoth', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('/character/Pepe/'))
      .mockResolvedValueOnce(htmlResponse(EMPTY_PAGE));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://garmoth.com/character/Pepe/');
    expect(result.ok).toBe(true);
  });

  it('corta tras demasiadas redirecciones', async () => {
    const fetchImpl = vi.fn(async () => redirectResponse('/character/Pepe/otra'));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(result.ok).toBe(false);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('rechaza cuerpos declarados mayores a 3 MB (content-length)', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(EMPTY_PAGE, { headers: { 'content-length': String(4 * 1024 * 1024) } }));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.syncErrorMessage).toMatch(/grande|MB/i);
  });

  it('corta la lectura de un cuerpo en streaming que supera 3 MB', async () => {
    const fetchImpl = vi.fn(async () => streamResponse(10 * 1024 * 1024));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.syncErrorMessage).toMatch(/grande|MB/i);
  });

  it('acepta un cuerpo en streaming por debajo del limite', async () => {
    const fetchImpl = vi.fn(async () => streamResponse(1024 * 1024));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(result.ok).toBe(true);
  });
});

describe('refreshGarmothLink: un refresh fallido conserva los datos (C-13, D-19)', () => {
  it('un parseo sin datos (failed) no incluye los campos semanticos en el patch', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(EMPTY_PAGE));
    const link = buildLink();

    const result = await refreshGarmothLink(link, { fetchImpl });

    expect(result.syncStatus).toBe('failed');
    for (const key of SEMANTIC_KEYS) expect(result.patch).not.toHaveProperty(key);
    // Al fusionar el patch (como hace updateCharacterLink) los datos previos siguen ahi.
    const merged = { ...link, ...result.patch };
    expect(merged).toMatchObject({ characterName: 'Pepe', className: 'Warrior', spec: 'Awakening', syncStatus: 'failed' });
    expect(merged.syncErrorMessage).toBeTruthy();
  });

  it('un error HTTP tampoco toca los campos semanticos', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      url: GOOD_URL,
      headers: new Headers(),
      text: async () => ''
    }));

    const result = await refreshGarmothLink(buildLink(), { fetchImpl });

    expect(result.ok).toBe(false);
    for (const key of SEMANTIC_KEYS) expect(result.patch).not.toHaveProperty(key);
  });
});
