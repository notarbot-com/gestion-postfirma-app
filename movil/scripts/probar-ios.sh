#!/usr/bin/env bash
# Instala la app compilada para el simulador en un iPhone y un iPad, la abre y saca una captura de cada uno.
# Uso (lo llama .github/workflows/movil.yml): bash movil/scripts/probar-ios.sh <App.app> <carpeta-salida>
set -euo pipefail
APP="$1"; SALIDA="$2"; mkdir -p "$SALIDA"
elegir() {
  xcrun simctl list devices available -j | python3 -c "
import json, sys
patron = sys.argv[1]
d = json.load(sys.stdin)['devices']
cand = [(r, x) for r, xs in d.items() if 'iOS' in r for x in xs if x['name'].startswith(patron)]
cand.sort(key=lambda c: c[0])
print(cand[-1][1]['udid'] if cand else '')" "$1"
}
for tipo in iPhone iPad; do
  udid=$(elegir "$tipo")
  [ -n "$udid" ] || { echo "::error::No hay simulador de $tipo"; exit 1; }
  nombre=$(xcrun simctl list devices | grep "$udid" | sed -E 's/^ *//; s/ \(.*//')
  echo "Simulador: $nombre ($udid)"
  xcrun simctl boot "$udid" || true
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl install "$udid" "$APP"
  xcrun simctl launch "$udid" com.notarbot.postfirma
  sleep 40
  xcrun simctl io "$udid" screenshot "$SALIDA/$(echo "$tipo" | tr '[:upper:]' '[:lower:]').png"
  # Sigue viva (si se cerrara al abrir, no aparecería en la lista de procesos del simulador).
  xcrun simctl spawn "$udid" launchctl list | grep -q com.notarbot.postfirma || { echo "::error::La app no sigue abierta en $tipo"; exit 1; }
  xcrun simctl shutdown "$udid" || true
done
echo "iOS: abierta en iPhone e iPad (capturas en $SALIDA)."
