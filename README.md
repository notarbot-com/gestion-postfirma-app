# Gestión Postfirma · app de escritorio

La aplicación de Mac y Windows de **Gestión Postfirma**, el programa de gestión de expedientes
posteriores a la firma notarial (Lexnova Soluciones SL). Abre el programa de producción en su
propia ventana, con su icono en el Dock o en la barra de tareas. En Mac se llama «Postfirma»
(un nombre de paquete con tilde hace que Electron no arranque en Mac); en Windows, «Gestión
Postfirma».

**Descargas** (siempre la última versión):

- Mac: https://github.com/notarbot-com/gestion-postfirma-app/releases/latest/download/GestionPostfirma.dmg
- Windows: https://github.com/notarbot-com/gestion-postfirma-app/releases/latest/download/GestionPostfirma-Setup.exe

Para el móvil no hay que descargar nada: la página `/aplicacion` del programa explica cómo
añadirla a la pantalla de inicio (iPhone con Safari, Android con Chrome).

## Qué hace y qué no

- No lleva el programa dentro: carga la web de producción. Cada despliegue del programa llega
  al momento a todas las apps, sin versión nueva. Solo los cambios de este envoltorio (icono,
  menús, ventana) necesitan publicar versión.
- Se entra con el **código de 6 cifras** que llega por correo. Si alguien copia el enlace del
  correo y vuelve a la app, la app lo detecta y entra sola (`entrarConEnlaceCopiado`).
- Enlaces de fuera del programa (documentos, fuentes de las reglas, WhatsApp) se abren en el
  navegador; una ficha abierta «en otra pestaña» se abre en otra ventana de la app.
- Menú del botón derecho (copiar, pegar, corrector), tamaño de ventana recordado, página propia
  sin conexión que reintenta sola, y en Mac cerrar la ventana la oculta (como Mail).
- El programa sabe que está dentro de la app por `window.postfirmaEscritorio` y por
  `GestionPostfirmaEscritorio/x.y.z` en el user agent.

## Desarrollo

```bash
npm install
npm start                                     # contra producción
npm run dev                                   # contra el Vite local en :5173
npx electron . --url=http://localhost:5174    # contra otro frontend
node scripts/smoke.mjs node_modules/.bin/electron .   # prueba de humo con captura
```

Los iconos salen de `frontend/scripts/iconos.py` del repositorio del programa:
`python3 frontend/scripts/iconos.py --escritorio ../gestion-postfirma-escritorio`.

## Publicar una versión

1. Subir `version` en `package.json`, commit y push a `main`.
2. En el Mac de Ignacio: `scripts/publicar-mac.sh`. Compila la app universal, la firma con el
   Developer ID de IRGB Ventures, notariza y grapa la app y el .dmg, lo comprueba como lo verá
   quien lo descargue y deja la versión `vX.Y.Z` en **borrador** con los ficheros de Mac.
   `--probar` hace todo menos el borrador.
3. Etiqueta `vX.Y.Z` y push. El flujo **Publicar** compila en Mac (prueba sin firmar) y Windows
   reales, instala y abre la app en cada uno (captura en los artefactos), añade Windows al
   borrador y lo publica. Sin el borrador de Mac, el flujo se para.
4. Las apps instaladas bajan la versión nueva solas (miran cada 4 h) y la instalan al volver a
   abrirlas. En Mac, solo desde una versión firmada: quien tenga la 1.0.0 (sin firmar) tiene que
   bajar el .dmg una vez.

## Firma

- **Mac: firmada y notarizada desde la 1.0.1** con el Developer ID de IRGB Ventures L.L.C-FZ
  (equipo 68NS5QU76H). Al abrirla, macOS solo pregunta si se quiere abrir una app descargada de
  Internet. El certificado y la clave de Apple viven en el Mac de Ignacio
  (`$POSTFIRMA_CLAVES_MAC`, por defecto `~/dev/novelista/_claves`) y nunca en los secretos de
  GitHub. Si Lexnova abre su propia cuenta de Apple, se cambia ahí; las apps firmadas con IRGB
  no se actualizarán solas a la nueva firma y habrá que bajar el .dmg una vez.
- **Windows: sin firmar.** SmartScreen avisa («Windows protegió su PC» → Más información →
  Ejecutar de todas formas). Firmarla requiere un certificado de firma de código de Windows.
