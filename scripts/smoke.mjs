// Prueba de humo de la app: la abre, espera a que cargue la pantalla «Entrar» del programa
// de producción, comprueba que la página sabe que está en la app y hace una captura.
//
//   node scripts/smoke.mjs <ejecutable> [argumentos…]
//   node scripts/smoke.mjs node_modules/.bin/electron .        (en desarrollo)
//
// Necesita Node 22 o superior (WebSocket y fetch globales). Sale con 0 si todo va bien.

import {spawn} from 'node:child_process';
import fs from 'node:fs';

const [exe, ...extra] = process.argv.slice(2);
if (!exe) {
  console.error('Uso: node scripts/smoke.mjs <ejecutable> [argumentos…]');
  process.exit(2);
}
const PORT = process.env.SMOKE_PORT ?? '9461';
const ESPERADO = process.env.SMOKE_URL ?? 'https://postfirma-ycxfw.ondigitalocean.app';
const SALIDA = process.env.SMOKE_PNG ?? `smoke-${process.platform}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(exe, [...extra, `--remote-debugging-port=${PORT}`], {
  stdio: 'inherit',
  shell: process.platform === 'win32' && exe.endsWith('.cmd'),
});
let terminado = false;
child.on('exit', (code, signal) => {
  if (!terminado) {
    console.error(`La app se cerró sola (código ${code}, señal ${signal})`);
    process.exit(1);
  }
});

function fin(code, msg) {
  terminado = true;
  (code ? console.error : console.log)(msg);
  child.kill();
  setTimeout(() => process.exit(code), 1500);
}

async function paginas() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    return await r.json();
  } catch {
    return [];
  }
}

let pagina;
for (const limite = Date.now() + 120_000; Date.now() < limite; await sleep(1000)) {
  pagina = (await paginas()).find((t) => t.type === 'page' && t.url.startsWith(ESPERADO));
  if (pagina) break;
}
if (!pagina) {
  fin(1, `No se abrió ninguna ventana con ${ESPERADO}: ${JSON.stringify(await paginas())}`);
} else {
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((ok, ko) => {
    ws.onopen = ok;
    ws.onerror = ko;
  });
  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      pendientes.get(m.id)(m);
      pendientes.delete(m.id);
    }
  };
  const cdp = (method, params = {}) =>
    new Promise((ok) => {
      id += 1;
      pendientes.set(id, ok);
      ws.send(JSON.stringify({id, method, params}));
    });
  const evaluar = async (expression) =>
    (await cdp('Runtime.evaluate', {expression, returnByValue: true})).result?.result?.value;

  let texto = '';
  for (const limite = Date.now() + 60_000; Date.now() < limite; await sleep(1000)) {
    texto = (await evaluar('document.body ? document.body.innerText : ""')) ?? '';
    if (/Entrar/.test(texto) && /correo/i.test(texto)) break;
  }
  const ua = await evaluar('navigator.userAgent');
  const puente = await evaluar('typeof window.postfirmaEscritorio === "object"');
  const titulo = await evaluar('document.title');
  const png = await cdp('Page.captureScreenshot', {format: 'png'});
  if (png.result?.data) fs.writeFileSync(SALIDA, Buffer.from(png.result.data, 'base64'));
  console.log(JSON.stringify({url: pagina.url, titulo, ua, puente, captura: SALIDA}, null, 2));
  ws.close();
  if (!/Entrar/.test(texto)) fin(1, `No apareció la pantalla «Entrar». Texto: ${texto.slice(0, 300)}`);
  else if (!/GestionPostfirmaEscritorio\//.test(ua ?? '')) fin(1, `Falta la marca en el user agent: ${ua}`);
  else if (!puente) fin(1, 'La página no ve window.postfirmaEscritorio');
  else fin(0, 'OK: la app abre el programa y la página sabe que está en la app');
}
