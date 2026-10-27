#!/bin/bash
# Chat Saver setup launcher.
# If Chat Saver (same or newer version) is already installed in ~/Applications, this just opens it.
# Otherwise it uses macOS's built-in AppleScript compiler (osacompile — no Xcode needed) to build
# a real applet like TabVault, installs it to ~/Applications with its icon, signs it ad-hoc, and opens it.
VERSION="1.9"
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
OUT="$HOME/Downloads/Chat Saver"
DEST="$HOME/Applications/Chat Saver.app"
mkdir -p "$HOME/Applications" "$HOME/Library/Logs" 2>/dev/null
mkdir -p "$OUT" 2>/dev/null
# Log where no permission prompt is ever needed; also mirror to Downloads when allowed.
LOG="$HOME/Library/Logs/Chat Saver setup.log"
note() { echo "$*" >>"$LOG" 2>/dev/null; echo "$*" >>"$OUT/.chatsaver.log" 2>/dev/null; true; }

# true if version $1 >= version $2
ver_ge() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$1" ]; }

INSTALLED="$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$DEST/Contents/Info.plist" 2>/dev/null)"
SETUP_ONLY=0
if [ -f "$OUT/.setup-only" ]; then SETUP_ONLY=1; rm -f "$OUT/.setup-only" 2>/dev/null; fi

# Already installed (same or newer)? Just open it — extra copies never rebuild or downgrade.
if [ "$SETUP_ONLY" = 0 ] && [ -n "$INSTALLED" ] && ver_ge "$INSTALLED" "$VERSION"; then
  note "[setup] $(date '+%F %T') installed $INSTALLED is current — opening it"
  exec /usr/bin/open "$DEST"
fi

fail() {
  note "[setup] FAILED at step $1"
  /usr/bin/osascript -e "display dialog \"Chat Saver setup failed (step $1).\" & return & return & \"Details: ~/Library/Logs/Chat Saver setup.log\" with title \"Chat Saver\" buttons {\"OK\"} default button 1 with icon caution" >/dev/null 2>&1
  [ -d "$DEST" ] && [ "$SETUP_ONLY" = 0 ] && /usr/bin/open "$DEST"
  exit 1
}

note "[setup] $(date '+%F %T') building $VERSION from $RES"
(
  WORK="$(/usr/bin/mktemp -d)" || exit 10
  APP="$WORK/Chat Saver.app"
  /usr/bin/osacompile -l JavaScript -o "$APP" "$RES/chatsaver.js" || exit 11
  R="$APP/Contents/Resources"
  cp "$RES/content.js" "$RES/print.css" "$R/" || exit 12
  cp "$RES/AppIcon.icns" "$R/applet.icns"
  cp "$RES/AppIcon.icns" "$R/AppIcon.icns"
  rm -f "$R/Assets.car"
  P="$APP/Contents/Info.plist"
  /usr/bin/plutil -replace CFBundleIdentifier -string "local.brane.chatsaver" "$P"
  /usr/bin/plutil -replace CFBundleName -string "Chat Saver" "$P"
  /usr/bin/plutil -replace CFBundleDisplayName -string "Chat Saver" "$P"
  /usr/bin/plutil -replace CFBundleShortVersionString -string "$VERSION" "$P"
  /usr/bin/plutil -replace CFBundleIconFile -string "applet" "$P"
  /usr/bin/plutil -remove CFBundleIconName "$P" >/dev/null 2>&1
  /usr/bin/plutil -replace NSAppleEventsUsageDescription -string "Chat Saver reads the AI chat open in Safari so it can save it as PDF and text." "$P"
  /usr/bin/codesign --force --deep --sign - "$APP" || exit 13
  /usr/bin/xattr -cr "$APP" 2>/dev/null
  rm -rf "$DEST" || exit 14
  mv "$APP" "$DEST" || exit 15
  /usr/bin/touch "$DEST"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST" 2>/dev/null
  rm -rf "$WORK"
  exit 0
) >>"$LOG" 2>&1
code=$?
[ $code -eq 0 ] || fail "$code"
note "[setup] installed $DEST ($VERSION)"

if [ "$SETUP_ONLY" = 1 ]; then note "[setup] setup-only run, not opening"; exit 0; fi
/usr/bin/open "$DEST"
