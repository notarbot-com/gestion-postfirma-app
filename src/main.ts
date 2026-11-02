// Gestión Postfirma para Mac y Windows: el programa de expedientes en su propia ventana,
// con su icono en el Dock o en la barra de tareas.
//
// La app no lleva el programa dentro: carga la web de producción, así que cada despliegue
// llega al momento y el servidor ve el mismo origen que un navegador (misma sesión, mismas
// reglas). Solo los cambios de este «envoltorio» necesitan versión nueva, y electron-updater
// los baja de las Releases públicas de notarbot-com/gestion-postfirma-app.
//
// Entrar: el correo de acceso trae un código de 6 cifras que se escribe en la propia app. Si
// alguien pulsa el enlace del correo, se abre en el navegador; copiando ese enlace y volviendo
// a la app, la app lo detecta y entra sola (ver `enlaceCopiado`).

import fs from 'node:fs';
import path from 'node:path';

import {
  BrowserWindow,
  type ContextMenuParams,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents,
  app,
  clipboard,
  dialog,
  ipcMain,
  session,
  shell,
} from 'electron';
import {autoUpdater} from 'electron-updater';

const DEFAULT_URL = 'https://postfirma-ycxfw.ondigitalocean.app';
const APP_ID = 'com.notarbot.postfirma';
// En Mac el paquete se llama «Postfirma» (sin tilde: ver electron-builder.yml).
const NOMBRE = process.platform === 'darwin' ? 'Postfirma' : 'Gestión Postfirma';
const RETRY_MS = 10_000;
// Al volver tras tanto tiempo oculta o minimizada, la página se recarga: un despliegue del
// programa entretanto solo llegaría al reiniciar.
const STALE_MS = 2 * 60 * 60 * 1000;
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;
// Permisos que puede tener el programa; el resto (cámara, micrófono, ubicación…) se deniega.
const PERMISOS = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen']);
const isMac = process.platform === 'darwin';

const urlArg = process.argv.find((arg) => arg.startsWith('--url='));
const APP_URL = new URL(
  urlArg?.slice('--url='.length) ?? process.env.POSTFIRMA_URL ?? DEFAULT_URL,
);

let win: BrowserWindow | null = null;
let quitting = false;
let retryTimer: NodeJS.Timeout | undefined;
let hiddenSince: number | null = null;

function assetPath(name: string): string {
  return path.join(__dirname, '..', 'assets', name);
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isAppOrigin(raw: string): boolean {
  return parseUrl(raw)?.origin === APP_URL.origin;
}

function openExternally(raw: string) {
  const url = parseUrl(raw);
  if (url && ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) {
    void shell.openExternal(url.toString());
  }
}

// --- tamaño y posición de la ventana -------------------------------------------------

type Bounds = {x?: number; y?: number; width: number; height: number; maximized?: boolean};
const boundsFile = () => path.join(app.getPath('userData'), 'ventana.json');

function readBounds(): Bounds {
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(), 'utf8')) as Bounds;
    if (b.width >= 600 && b.height >= 400) return b;
  } catch {
    // Primera vez o fichero dañado: tamaño por defecto.
  }
  return {width: 1400, height: 900};
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(boundsFile(), JSON.stringify({...b, maximized: win.isMaximized()}));
  } catch (error) {
    console.error('No se pudo guardar el tamaño de la ventana', error);
  }
}

// --- ventana ---------------------------------------------------------------------------

function showWindow() {
  if (!win) return;
  const stale =
    hiddenSince !== null &&
    Date.now() - hiddenSince >= STALE_MS &&
    isAppOrigin(win.webContents.getURL());
  hiddenSince = null;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (stale) win.webContents.reload();
}

function loadApp(target: URL = APP_URL) {
  clearTimeout(retryTimer);
  void win?.loadURL(target.toString());
}

function showOffline() {
  void win?.loadFile(assetPath('offline.html'));
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => loadApp(), RETRY_MS);
}

// Un enlace de acceso del correo copiado en el portapapeles, si lo hay y es de este programa.
async function enlaceCopiado(): Promise<URL | null> {
  const text = (await clipboard.readText()).trim();
  if (text.length > 600) return null;
  const url = parseUrl(text);
  if (
    !url ||
    url.origin !== APP_URL.origin ||
    url.pathname !== '/auth/callback' ||
    !url.searchParams.get('token')
  ) {
    return null;
  }
  return url;
}

// En la pantalla de «Entrar» (o en la de un enlace caducado), un enlace copiado abre la
// sesión aquí. Se vacía el portapapeles: el enlace es de un solo uso.
async function entrarConEnlaceCopiado(desdeMenu = false): Promise<boolean> {
  if (!win) return false;
  const current = parseUrl(win.webContents.getURL());
  const enPantallaDeAcceso =
    current?.origin === APP_URL.origin &&
    (current.pathname === '/login' || current.pathname === '/auth/callback');
  if (!desdeMenu && !enPantallaDeAcceso) return false;
  const enlace = await enlaceCopiado();
  if (!enlace || !win) return false;
  clipboard.clear();
  loadApp(enlace);
  return true;
}

function createWindow() {
  const bounds = readBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 500,
    show: false,
    title: NOMBRE,
    icon: isMac ? undefined : assetPath('icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => {
    if (bounds.maximized) win?.maximize();
    win?.show();
  });

  // En Mac, cerrar la ventana la oculta (como Mail o Notas): sigue en el Dock con la
  // página tal cual. En Windows, cerrar es salir.
  win.on('close', (event) => {
    saveBounds();
    if (quitting || !isMac) return;
    event.preventDefault();
    win?.hide();
  });
  const markHidden = () => {
    hiddenSince ??= Date.now();
  };
  win.on('hide', markHidden);
  win.on('minimize', markHidden);
  win.on('restore', () => showWindow());
  // Al volver a la ventana, o al llegar a «Entrar» dentro del programa.
  win.on('focus', () => {
    void entrarConEnlaceCopiado();
  });
  win.webContents.on('did-navigate-in-page', () => {
    if (win?.isFocused()) void entrarConEnlaceCopiado();
  });
  win.on('resized', saveBounds);
  win.on('moved', saveBounds);

  win.on('closed', () => {
    win = null;
  });

  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    // -3 es ERR_ABORTED: una navegación sustituida por otra, no un fallo.
    if (!isMainFrame || code === -3) return;
    showOffline();
  });

  loadApp();
}

// Para todas las ventanas de la app (también las fichas abiertas «en otra pestaña»).
function protegerContenido(contents: WebContents) {
  contents.setWindowOpenHandler(({url}) => {
    // Una ficha abierta «en otra pestaña» se abre en otra ventana de la app, con la sesión.
    if (isAppOrigin(url) || url === '' || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 860,
          autoHideMenuBar: true,
          icon: isMac ? undefined : assetPath('icon.png'),
        },
      };
    }
    // Documentos, fuentes de las reglas, WhatsApp…: al navegador de la persona.
    openExternally(url);
    return {action: 'deny'};
  });
  contents.on('will-navigate', (event, url) => {
    if (isAppOrigin(url) || url.startsWith('file:')) return;
    event.preventDefault();
    openExternally(url);
  });
  contents.on('context-menu', (_event, params) => {
    const owner = BrowserWindow.fromWebContents(contents) ?? undefined;
    contextMenu(contents, params).popup({window: owner});
  });
}

// Menú del botón derecho: sin él, Electron no deja ni copiar ni pegar con el ratón.
function contextMenu(contents: WebContents, params: ContextMenuParams): Menu {
  const items: MenuItemConstructorOptions[] = [];
  if (params.misspelledWord) {
    for (const sugerencia of params.dictionarySuggestions.slice(0, 5)) {
      items.push({
        label: sugerencia,
        click: () => contents.replaceMisspelling(sugerencia),
      });
    }
    items.push(
      {
        label: 'Añadir al diccionario',
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      },
      {type: 'separator'},
    );
  }
  if (params.linkURL && !params.linkURL.startsWith('javascript:')) {
    items.push(
      {label: 'Copiar enlace', click: () => void clipboard.writeText(params.linkURL)},
      {type: 'separator'},
    );
  }
  const {editFlags, isEditable, selectionText} = params;
  if (isEditable) {
    items.push(
      {role: 'cut', label: 'Cortar', enabled: editFlags.canCut},
      {role: 'copy', label: 'Copiar', enabled: editFlags.canCopy},
      {role: 'paste', label: 'Pegar', enabled: editFlags.canPaste},
      {type: 'separator'},
      {role: 'selectAll', label: 'Seleccionar todo'},
    );
  } else if (selectionText.trim()) {
    items.push({role: 'copy', label: 'Copiar'});
  } else {
    items.push(
      {
        label: 'Atrás',
        enabled: contents.navigationHistory.canGoBack(),
        click: () => contents.navigationHistory.goBack(),
      },
      {label: 'Recargar', click: () => contents.reload()},
    );
  }
  return Menu.buildFromTemplate(items);
}

function createAppMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: NOMBRE,
            submenu: [
              {role: 'about', label: `Acerca de ${NOMBRE}`},
              {label: 'Buscar actualizaciones', click: () => void checkForUpdates(true)},
              {type: 'separator'},
              {role: 'hide', label: `Ocultar ${NOMBRE}`},
              {role: 'hideOthers', label: 'Ocultar otros'},
              {role: 'unhide', label: 'Mostrar todo'},
              {type: 'separator'},
              {role: 'quit', label: `Salir de ${NOMBRE}`},
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Entrar con el enlace copiado',
          click: async () => {
            if (!(await entrarConEnlaceCopiado(true))) {
              await dialog.showMessageBox({
                type: 'info',
                message: 'No hay ningún enlace de acceso copiado',
                detail:
                  'Escribe en «Entrar» el código de 6 cifras del correo. O copia el enlace del correo (botón derecho → Copiar enlace) y vuelve a esta ventana.',
              });
            }
          },
        },
        {type: 'separator'},
        {label: 'Imprimir…', accelerator: 'CmdOrCtrl+P', click: () => win?.webContents.print()},
        ...(isMac
          ? []
          : ([
              {type: 'separator'},
              {label: 'Buscar actualizaciones', click: () => void checkForUpdates(true)},
              {type: 'separator'},
              {role: 'quit', label: 'Salir'},
            ] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'Edición',
      submenu: [
        {role: 'undo', label: 'Deshacer'},
        {role: 'redo', label: 'Rehacer'},
        {type: 'separator'},
        {role: 'cut', label: 'Cortar'},
        {role: 'copy', label: 'Copiar'},
        {role: 'paste', label: 'Pegar'},
        {role: 'selectAll', label: 'Seleccionar todo'},
      ],
    },
    {
      label: 'Ver',
      submenu: [
        {role: 'reload', label: 'Recargar'},
        {
          label: 'Atrás',
          accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
          click: () => win?.webContents.navigationHistory.goBack(),
        },
        {
          label: 'Adelante',
          accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
          click: () => win?.webContents.navigationHistory.goForward(),
        },
        {type: 'separator'},
        {role: 'resetZoom', label: 'Tamaño real'},
        {role: 'zoomIn', label: 'Ampliar'},
        {role: 'zoomOut', label: 'Reducir'},
        {type: 'separator'},
        {role: 'togglefullscreen', label: 'Pantalla completa'},
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        {role: 'minimize', label: 'Minimizar'},
        {role: 'zoom', label: 'Zoom'},
        ...(isMac
          ? ([{type: 'separator'}, {role: 'front', label: 'Traer todo al frente'}] as MenuItemConstructorOptions[])
          : ([{role: 'close', label: 'Cerrar'}] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Abrir en el navegador',
          click: () => openExternally(win?.webContents.getURL() || APP_URL.toString()),
        },
        {
          label: `Versión ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureSession() {
  const ses = session.defaultSession;
  ses.setUserAgent(`${ses.getUserAgent()} GestionPostfirmaEscritorio/${app.getVersion()}`);
  // En Windows elige el diccionario; en Mac manda el corrector del sistema.
  if (!isMac) ses.setSpellCheckerLanguages(['es-ES']);
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(PERMISOS.has(permission) && isAppOrigin(details.requestingUrl));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return PERMISOS.has(permission) && isAppOrigin(requestingOrigin);
  });
}

// --- actualizaciones -------------------------------------------------------------------

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) return;
  try {
    // Se baja en segundo plano y se instala al salir o al volver a abrir.
    const result = await autoUpdater.checkForUpdatesAndNotify({
      title: `Actualización de ${NOMBRE} lista`,
      body: `Se instalará la próxima vez que se abra ${NOMBRE}.`,
    });
    if (manual && !result?.isUpdateAvailable) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Tienes la última versión',
        detail: `${NOMBRE} ${app.getVersion()}. El programa en sí se actualiza solo, sin descargar nada.`,
      });
    }
  } catch (error) {
    // Sin conexión, o un Mac sin firma de Apple (Squirrel no instala apps sin firmar).
    console.error('No se pudo buscar actualizaciones', error);
  }
}

// --- arranque --------------------------------------------------------------------------

function start() {
  app.setAppUserModelId(APP_ID);
  app.setName(NOMBRE);

  // Abrir el acceso directo con la app ya abierta vuelve a la ventana que hay.
  app.on('second-instance', () => (win ? showWindow() : createWindow()));
  app.on('activate', () => (win ? showWindow() : createWindow()));
  app.on('before-quit', () => {
    quitting = true;
    saveBounds();
  });
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });

  ipcMain.on('postfirma:reintentar', () => loadApp());
  app.on('web-contents-created', (_event, contents) => protegerContenido(contents));

  void app.whenReady().then(() => {
    configureSession();
    createAppMenu();
    createWindow();
    void checkForUpdates();
    setInterval(() => void checkForUpdates(), UPDATE_CHECK_MS);
  });
}

if (app.requestSingleInstanceLock()) {
  start();
} else {
  app.quit();
}
