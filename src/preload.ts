// Lo que ve la página como `window.postfirmaEscritorio` (frontend/src/lib/aplicacion.ts):
// sirve para saber que está dentro de la app y no ofrecer «Descargar la aplicación».

import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('postfirmaEscritorio', {
  plataforma: process.platform,
  reintentar: () => ipcRenderer.send('postfirma:reintentar'),
});
