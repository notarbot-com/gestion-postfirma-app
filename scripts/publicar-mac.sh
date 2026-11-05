#!/usr/bin/env bash
# Compila la app de Mac (universal), la firma con el Developer ID de IRGB Ventures, la notariza con
# Apple y deja la versión vX.Y.Z en BORRADOR en GitHub con los ficheros de Mac. Después, la etiqueta
# vX.Y.Z lanza «Publicar», que compila Windows, lo añade a esa versión y la hace pública.
#
# Se ejecuta en el Mac de Ignacio: el certificado y la clave de Apple no salen de este equipo ni se
# guardan como secretos de GitHub (la organización notarbot-com la comparten más personas).
#
#   scripts/publicar-mac.sh            compila, firma, notariza, comprueba y crea el borrador
#   scripts/publicar-mac.sh --probar   igual, sin crear el borrador
set -euo pipefail
cd "$(dirname "$0")/.."

CLAVES="${POSTFIRMA_CLAVES_MAC:-$HOME/dev/novelista/_claves}"
REPO=notarbot-com/gestion-postfirma-app
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
PROBAR=${1:-}

fallo() { echo "✗ $*" >&2; exit 1; }

[ -z "$(git status --porcelain)" ] || fallo "Hay cambios sin guardar en el repositorio."
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fallo "HEAD no es origin/main."
if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  fallo "La etiqueta $TAG ya existe: sube la versión en package.json."
fi
LIBRES=$(df -g / | awk 'NR==2 {print $4}')
[ "$LIBRES" -ge 10 ] || fallo "Solo hay $LIBRES GB libres: hacen falta 10."
for f in developer-id-irgb.p12 developer-id-irgb-p12-clave.txt app-store-connect-irgb.env; do
  [ -f "$CLAVES/$f" ] || fallo "Falta $CLAVES/$f."
done

# KEY_ID e ISSUER_ID de la clave de API de App Store Connect (notarizar).
set -a
# shellcheck disable=SC1091
. "$CLAVES/app-store-connect-irgb.env"
set +a
# El certificado, en un llavero temporal propio. El que crea electron-builder con CSC_LINK falla
# en macOS 26 («SecKeychainUnlock: The user name or passphrase you entered is not correct»).
LLAVERO_DIR="$(mktemp -d)"
LLAVERO="$LLAVERO_DIR/postfirma-firma.keychain-db"
LLAVERO_CLAVE="$(openssl rand -hex 16)"
LLAVEROS_ANTES=()
while IFS= read -r k; do LLAVEROS_ANTES+=("$k"); done < <(security list-keychains -d user | tr -d '"' | sed 's/^ *//')
limpiar_llavero() {
  security list-keychains -d user -s "${LLAVEROS_ANTES[@]}"
  security delete-keychain "$LLAVERO" 2>/dev/null || true
  rm -rf "$LLAVERO_DIR"
}
trap limpiar_llavero EXIT
security create-keychain -p "$LLAVERO_CLAVE" "$LLAVERO"
security set-keychain-settings -lut 3600 "$LLAVERO"
security unlock-keychain -p "$LLAVERO_CLAVE" "$LLAVERO"
security import "$CLAVES/developer-id-irgb.p12" -k "$LLAVERO" \
  -P "$(cat "$CLAVES/developer-id-irgb-p12-clave.txt")" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$LLAVERO_CLAVE" "$LLAVERO" >/dev/null
security list-keychains -d user -s "$LLAVERO" "${LLAVEROS_ANTES[@]}"
unset CSC_LINK CSC_KEY_PASSWORD
export CSC_KEYCHAIN="$LLAVERO" CSC_NAME="IRGB Ventures L.L.C-FZ (68NS5QU76H)"
export APPLE_API_KEY="$CLAVES/AuthKey_${KEY_ID}.p8" APPLE_API_KEY_ID="$KEY_ID" APPLE_API_ISSUER="$ISSUER_ID"
[ -f "$APPLE_API_KEY" ] || fallo "Falta $APPLE_API_KEY."

echo "→ Compilando, firmando y notarizando Postfirma $VERSION"
rm -rf release
npm run build
npx electron-builder --mac --publish never -c.mac.notarize=true -c.dmg.sign=true

DMG=release/GestionPostfirma.dmg
ZIP=release/GestionPostfirma-mac.zip
APP="$(ls -d release/mac-universal/*.app | head -1)"

# La app va notarizada y grapada; el .dmg también, para que tampoco avise al abrir la descarga.
echo "→ Notarizando el .dmg"
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY" --key-id "$KEY_ID" --issuer "$ISSUER_ID" --wait
xcrun stapler staple "$DMG"

# Al graparlo cambia el .dmg: su huella en latest-mac.yml, al día. Su blockmap ya no vale y nadie lo
# usa (el actualizador de Mac baja el .zip): fuera.
rm -f "$DMG.blockmap"
node - "$DMG" release/latest-mac.yml <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [dmg, yml] = process.argv.slice(2);
const datos = fs.readFileSync(dmg);
const sha512 = crypto.createHash('sha512').update(datos).digest('base64');
let texto = fs.readFileSync(yml, 'utf8');
const bloque = /(- url: GestionPostfirma\.dmg\n\s+sha512: )\S+(\n\s+size: )\d+/;
if (!bloque.test(texto)) throw new Error('latest-mac.yml sin la entrada del .dmg');
texto = texto.replace(bloque, `$1${sha512}$2${datos.length}`);
fs.writeFileSync(yml, texto);
NODE

echo "→ Comprobando firma y notarización"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E '^(Authority=Developer ID Application|TeamIdentifier)'
ARQUITECTURAS=$(lipo -archs "$APP/Contents/MacOS/$(basename "$APP" .app)")
[[ "$ARQUITECTURAS" == *x86_64* && "$ARQUITECTURAS" == *arm64* ]] || fallo "No es universal: $ARQUITECTURAS"
xcrun stapler validate "$APP"
xcrun stapler validate "$DMG"
spctl --assess --type execute --verbose=4 "$APP"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"
# Como lo verá quien lo descargue: con la marca de cuarentena del navegador.
PRUEBA="$(mktemp -d)"
ditto "$APP" "$PRUEBA/Postfirma.app"
xattr -w com.apple.quarantine "0081;$(printf %x "$(date +%s)");Safari;" "$PRUEBA/Postfirma.app"
VEREDICTO=$(spctl --assess --type execute --verbose=4 "$PRUEBA/Postfirma.app" 2>&1)
echo "$VEREDICTO"
rm -rf "$PRUEBA"
[[ "$VEREDICTO" == *"source=Notarized Developer ID"* ]] || fallo "macOS no la da por notarizada."

if [ "$PROBAR" = "--probar" ]; then
  echo "✓ Mac $VERSION firmado y notarizado en release/ (sin borrador en GitHub)."
  exit 0
fi

echo "→ Borrador $TAG en GitHub con los ficheros de Mac"
gh release create "$TAG" "$DMG" "$ZIP" "$ZIP.blockmap" release/latest-mac.yml \
  --repo "$REPO" \
  --draft \
  --target "$(git rev-parse HEAD)" \
  --title "Gestión Postfirma $VERSION" \
  --notes "Instaladores de la app de escritorio. Mac (firmado y notarizado por Apple): GestionPostfirma.dmg · Windows: GestionPostfirma-Setup.exe. Página de descarga: https://postfirma-ycxfw.ondigitalocean.app/aplicacion"

echo "✓ Borrador listo. Para publicar: git tag $TAG && git push origin $TAG"
echo "  (el flujo «Publicar» añade Windows y la hace pública)"
