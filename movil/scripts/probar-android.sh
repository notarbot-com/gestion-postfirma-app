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
# Que el programa haya arrancado de verdad: la pantalla de «Entrar» tiene que verse (accesibilidad de la vista web).
adb shell uiautomator dump /sdcard/vista.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/vista.xml > "$SALIDA/android-vista.xml" 2>/dev/null || true
if ! grep -q "Entrar" "$SALIDA/android-vista.xml"; then
  echo "::error::No se ve la pantalla de «Entrar» del programa"
  grep -E "Capacitor|chromium" "$SALIDA/android-logcat.txt" | grep -i -E "error|postfirma-ycxfw" | head -20 || true
  exit 1
fi
echo "Android: abierto y en primer plano (captura en $SALIDA/android.png)."
