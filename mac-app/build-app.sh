#!/bin/bash
# Assembles "Chat Saver.app" (the setup launcher) from the files in this folder.
# Open the resulting app once: it compiles itself into a real applet with macOS's
# built-in osacompile (no Xcode) and installs to ~/Applications/Chat Saver.app.
set -e
cd "$(dirname "$0")"
OUT="${1:-build}/Chat Saver.app/Contents"
rm -rf "${1:-build}/Chat Saver.app"
mkdir -p "$OUT/MacOS" "$OUT/Resources"
cp launcher.sh "$OUT/MacOS/ChatSaver" && chmod 755 "$OUT/MacOS/ChatSaver"
cp chatsaver.js print.css AppIcon.icns "$OUT/Resources/"
cp ../extension/content.js "$OUT/Resources/"
VER="$(sed -n 's/^VERSION="\(.*\)"/\1/p' launcher.sh)"
cat > "$OUT/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>ChatSaver</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>local.brane.chatsaver</string>
  <key>CFBundleName</key><string>Chat Saver</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VER</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSAppleEventsUsageDescription</key><string>Chat Saver reads the AI chat open in Safari so it can save it as PDF and text.</string>
</dict></plist>
PLIST
echo "Built ${1:-build}/Chat Saver.app ($VER)"
