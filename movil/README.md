# Postfirma para iPhone, iPad y Android

App de Capacitor 8 que abre el Postfirma de producción (`server.url` de `capacitor.config.json`), igual que la de
escritorio. Un cambio del programa llega solo a todos los móviles con el despliegue; solo el envoltorio (icono,
permisos, código nativo) pide versión nueva.

- Identificador: `com.notarbot.postfirma` en las dos tiendas (el mismo que la app de escritorio).
- Cuentas: las de **Lexnova** (Apple: la misma clave de API que NoveLista; Google Play: la de Lexnova). El programa es
  de Lexnova.
- La web va dentro de la zona segura: en iPhone, `ContenedorViewController` (en `SceneDelegate.swift`) mete el
  controlador de Capacitor ajustado a la zona segura; en Android, `SystemBars.insetsHandling = "native"`. La web no usa
  `viewport-fit=cover`, así que no hay que tocarla.
- Sin conexión: `www/sin-conexion.html` (lo vuelve a intentar solo cada 5 s).
- Adjuntar archivos: el selector del sistema (en iPhone ofrece también cámara y fotos: por eso las claves
  `NSCameraUsageDescription` y `NSPhotoLibraryUsageDescription` del `Info.plist`; sin ellas la app se cierra).
- La web reconoce la app por `PostfirmaMovil/1` al final del agente de usuario (`appendUserAgent`) y por
  `window.Capacitor`.

## Compilar y publicar

Todo en GitHub Actions (`.github/workflows/movil.yml`): el Mac no tiene Xcode ni Gradle, y el repositorio es público
(no gasta minutos).

| Cuándo | Qué pasa |
| --- | --- |
| PR o `main` que toca `movil/` | Compila Android e iPhone, los abre en un emulador y en simuladores de iPhone y iPad y guarda las capturas |
| A mano (`gh workflow run movil.yml -R notarbot-com/gestion-postfirma-app`) o etiqueta `movil-vX.Y.Z` | Además: APK y AAB firmados, el APK a la Release fija `movil-android` y el iPhone a TestFlight |

- APK para instalar a mano: https://github.com/notarbot-com/gestion-postfirma-app/releases/download/movil-android/Postfirma.apk
  (Release marcada como prerelease para no tocar la «Latest», de la que se actualiza la app de escritorio).
- TestFlight: la ficha «Postfirma» (`com.notarbot.postfirma`) en App Store Connect de Lexnova se crea a mano (la API
  no deja crear apps). Sin ella, la subida falla con «Cannot determine the Apple ID from Bundle ID».
- Cada versión del envoltorio sube `version` en `package.json`, `versionName` en `android/app/build.gradle` y
  `MARKETING_VERSION` en `ios/App/App.xcodeproj/project.pbxproj`. El número de build lo pone el flujo.

## Claves (fuera del repositorio)

- Apple (Lexnova): `~/dev/novelista/_claves/app-store-connect-lexnova.env`, `AuthKey_<KeyID>.p8` y
  `ios-distribucion-lexnova.key` (la clave del certificado de distribución que ya usa NoveLista: así no se crea otro).
  En GitHub: `ASC_LEXNOVA_KEY_ID`, `ASC_LEXNOVA_ISSUER_ID`, `ASC_LEXNOVA_KEY_P8`, `IOS_LEXNOVA_CERT_KEY` y la variable
  `IOS_LEXNOVA_TEAM_ID`.
- Android: clave de subida en `~/.config/postfirma-movil/postfirma-subida.jks` (alias `postfirma`), contraseña en
  `clave.txt` y en el Llavero («Postfirma clave Android»). Huella SHA-256:
  `16:33:49:C3:46:58:87:C1:90:11:9A:1A:6E:FC:A2:6D:18:7B:D6:C9:34:F3:CF:FF:CD:86:0A:A4:7D:BA:F6:83`.
  En GitHub: `ANDROID_KEYSTORE_B64` y `ANDROID_KEYSTORE_PASSWORD`. Si se pierde y la app ya está en Google Play, se
  pide a Google un cambio de clave de subida; los APK instalados a mano habría que desinstalarlos.

## Iconos

`recursos/` (generados con `frontend/scripts/iconos.py` del repo del programa) → `npm run iconos`.
