# Android APK

Use the local Android SDK and JDK 17. Do not use EAS.

```sh
npm ci
npx expo prebuild --platform android
npm run apk
```

The signed release APK is written to `artifacts/Issue.apk`. It bundles the
JavaScript and supports ARM64 and ARMv7 phones without an Expo development server.
The API values are compiled from the local `.env` during the build.

Release signing is stored outside the repository:

- `~/.config/issue/android-release.jks`
- `~/.config/issue/android-signing.properties`

The properties file contains `storeFile`, `storePassword`, `keyAlias` and
`keyPassword`. Back up both files privately; future updates must use the same key.
The build fails if the release signing configuration is missing.

Install on a connected Android device or emulator:

```sh
adb install -r artifacts/Issue.apk
adb shell am start -n com.qiuzizhao.issueapp/.MainActivity
```

Android screens leave space for the system navigation bar. The system back
button dismisses an open form sheet, and form keyboards resize the available area.
