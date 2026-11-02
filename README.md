# Gestión Postfirma · app de escritorio

La aplicación de Mac y Windows de **Gestión Postfirma**, el programa de gestión de expedientes
posteriores a la firma notarial (Lexnova Soluciones SL). Abre el programa de producción en su
propia ventana, con su icono en el Dock o en la barra de tareas.

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

1. Subir `version` en `package.json`.
2. Etiqueta `vX.Y.Z` y push. El flujo **Publicar** compila en Mac y Windows reales, instala y
   abre la app en cada uno (captura en los artefactos) y crea la Release con los instaladores.
3. Windows baja la versión nueva solo (mira cada 4 h) y la instala al volver a abrir la app. En
   Mac, mientras no esté firmada con certificado de Apple, no se actualiza sola: hay que volver
   a descargar el .dmg (rara vez hace falta, porque el programa en sí se actualiza solo).

## Firma

Sin firmar por ahora: Windows muestra SmartScreen («Windows protegió su PC» → Más información →
Ejecutar de todas formas) y macOS pide permitirla una vez en Ajustes del Sistema → Privacidad y
seguridad → «Abrir igualmente». Para firmar, los secretos `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID` (Mac) y la firma de Windows en
`electron-builder.yml`.
