#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f "$HOME/.config/issue/android-signing.properties" ]; then
  echo 'Missing release signing: ~/.config/issue/android-signing.properties' >&2
  exit 1
fi
if [ ! -x android/gradlew ]; then
  echo 'Run npx expo prebuild --platform android first.' >&2
  exit 1
fi

export NODE_ENV=production
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a --max-workers=2 --console=plain
cd ..
mkdir -p artifacts
cp android/app/build/outputs/apk/release/app-release.apk artifacts/Issue.apk
echo 'APK: artifacts/Issue.apk'
