#!/bin/bash
# ------------------------------------------------------------------
#  Chat Saver — one-click Safari installer
#  Double-click this file in Finder (or run it in Terminal).
#  It wraps the extension in a tiny Mac app, builds it, installs it to
#  ~/Applications and opens Safari's Extensions settings.
# ------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
APP_NAME="Chat Saver"
USER_SLUG="$(whoami | tr -cd 'a-z0-9')"
BUNDLE_ID="com.${USER_SLUG:-me}.chatsaver"
BUILD="$HERE/build"

say()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m✗ %s\033[0m\n\n" "$1"; read -r -p "Press Return to close…" _; exit 1; }

say "Checking for Xcode…"
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  printf "Safari extensions must be built with Apple's free Xcode app.\n"
  printf "Opening the App Store page for Xcode — install it, open it once, then double-click this installer again.\n"
  open "macappstore://apps.apple.com/app/xcode/id497799835" || true
  fail "Xcode is not installed yet."
fi
if ! xcodebuild -version >/dev/null 2>&1; then
  printf "Pointing the command-line tools at Xcode (you may be asked for your Mac password)…\n"
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  sudo xcodebuild -license accept || true
fi

say "Creating the Safari app project…"
rm -rf "$BUILD"
xcrun safari-web-extension-converter "$HERE/extension" \
  --project-location "$BUILD" --app-name "$APP_NAME" --bundle-identifier "$BUNDLE_ID" \
  --macos-only --swift --copy-resources --no-prompt --no-open --force >/dev/null

PROJ="$(find "$BUILD" -maxdepth 3 -name '*.xcodeproj' | head -1)"
[ -n "$PROJ" ] || fail "The converter did not create an Xcode project."

# Sign with your Apple ID team if Xcode has one (extension stays enabled across Safari restarts);
# otherwise build ad-hoc (Safari then needs “Allow unsigned extensions”).
TEAM=""
CERT="$(security find-certificate -c "Apple Development" -p 2>/dev/null || true)"
if [ -n "$CERT" ]; then TEAM="$(printf "%s" "$CERT" | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p' | head -1)"; fi

say "Building ${APP_NAME}.app (takes a minute)…"
if [ -n "$TEAM" ]; then
  printf "Signing with your Apple Development team %s\n" "$TEAM"
  xcodebuild -project "$PROJ" -scheme "$APP_NAME" -configuration Release -derivedDataPath "$BUILD/DerivedData" \
    DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates -quiet build || TEAM=""
fi
if [ -z "$TEAM" ]; then
  xcodebuild -project "$PROJ" -scheme "$APP_NAME" -configuration Release -derivedDataPath "$BUILD/DerivedData" \
    CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="" CODE_SIGNING_REQUIRED=NO -quiet build \
    || fail "Build failed. Open $PROJ in Xcode and press ▶ Run to see the error."
fi

APP="$(find "$BUILD/DerivedData/Build/Products/Release" -maxdepth 1 -name "*.app" | head -1)"
[ -d "$APP" ] || fail "Could not find the built app."

say "Installing to ~/Applications…"
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/$APP_NAME.app"
cp -R "$APP" "$HOME/Applications/$APP_NAME.app"
xattr -dr com.apple.quarantine "$HOME/Applications/$APP_NAME.app" 2>/dev/null || true
open "$HOME/Applications/$APP_NAME.app"
sleep 2

say "Done! Last step in Safari:"
if [ -z "$TEAM" ]; then
cat <<'TXT'
  1. Safari ▸ Settings ▸ Advanced ▸ tick “Show features for web developers”.
  2. Safari ▸ Settings ▸ Developer ▸ tick “Allow unsigned extensions” (enter your password).
     (Safari turns this off when it quits — just tick it again, or sign in to Xcode with
      your Apple ID and re-run this installer to make it permanent.)
  3. Safari ▸ Settings ▸ Extensions ▸ tick “Chat Saver”.
  4. Click the Chat Saver toolbar button on any chat → “Always Allow on This Website”.
TXT
else
cat <<'TXT'
  1. Safari ▸ Settings ▸ Extensions ▸ tick “Chat Saver”.
  2. Click the Chat Saver toolbar button on any chat → “Always Allow on This Website”.
TXT
fi
open -a Safari
osascript -e 'tell application "Safari" to activate' >/dev/null 2>&1 || true
read -r -p $'\nPress Return to close…' _
