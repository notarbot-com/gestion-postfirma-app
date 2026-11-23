#!/usr/bin/env bash
# Instala el APK en el emulador, abre Postfirma y comprueba que carga el programa de producción.
# Uso (lo llama .github/workflows/movil.yml dentro del emulador): bash movil/scripts/probar-android.sh <apk> <carpeta-salida>
set -euo pipefail
APK="$1"; SALIDA="$2"; mkdir -p "$SALIDA"
adb wait-for-device
adb install -r "$APK"
adb logcat -c || true
adb shell am start -W -n com.notarbot.postfirma/.MainActivity
# La primera carga baja el programa entero: margen amplio.
sleep 40
adb exec-out screencap -p > "$SALIDA/android.png"
adb logcat -d > "$SALIDA/android-logcat.txt" || true
foco=$(adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -2)
echo "$foco"
echo "$foco" | grep -q com.notarbot.postfirma || { echo "::error::Postfirma no está en primer plano"; exit 1; }
# Capacitor apunta en el registro la dirección que carga; si falla, sale la página «Sin conexión».
if grep -q "sin-conexion" "$SALIDA/android-logcat.txt"; then echo "::error::La app cayó en «Sin conexión»"; exit 1; fi
# Que el programa haya arrancado de verdad: se pregunta a la vista web (depuración, activa en la versión de
# prueba) en qué dirección está. Se abre «/» y es el código del programa el que lleva a «/login» sin sesión: si la
# dirección acaba en /login, la web ha cargado y su JavaScript funciona.
sock=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1)
[ -n "$sock" ] || { echo "::error::No aparece la vista web de la app"; exit 1; }
adb forward tcp:9222 "localabstract:$sock" >/dev/null
curl -s http://localhost:9222/json > "$SALIDA/android-paginas.json"
cat "$SALIDA/android-paginas.json" | grep -E '"(url|title)"' || true
if ! grep -q 'postfirma-ycxfw.ondigitalocean.app/login' "$SALIDA/android-paginas.json"; then
  echo "::error::La vista web no ha llegado a /login del programa"
  exit 1
fi
echo "Android: abierto y en primer plano (captura en $SALIDA/android.png)."
