# Android build status

The application in this directory uses native React Native controls and Android modules. It is not the web app packaged in a browser shell.

## Verified

- Expo SDK 54.0.38 / React Native 0.81.5 / React 19.1.0, Android-only application ID `com.laundrylounge.app`.
- Strict TypeScript check and 11 domain/SQLite/QR tests pass.
- Production Android Hermes bundle exports successfully with the app icon and Ionicons font bundled locally.
- Android project prebuild succeeds, native code generation runs, and SDK/module/plugin configuration passes.
- Android SDK 36, build-tools 36.0.0 and 35.0.0, NDK 27.1.12297006, CMake 3.22.1, Java 17 and Gradle 8.14.3 are installed in the current cloud workspace. SDK and Java artifacts/checksums were verified. Official SDKManager 19 accepted the vendor licenses normally.
- The manifest requests camera access and blocks microphone and overlay permissions. Android automatic backup is disabled. The final merged APK still needs verification after a successful build.

## Current blocker — no APK yet

The release build cannot download two required official artifacts: `react-android-0.81.5-release.aar` and `hermes-android-0.81.5-release.aar`. Both Maven Central frontends redirect those requests to `repo.reactnative.dev`; the environment's enforced policy currently denies that hostname with HTTP 403.

A network requirement for `repo.reactnative.dev` is saved in the environment configuration draft, preserving the existing custom hosts. Apply it through environment settings, then resume the build. No Netlify token or Expo account is needed for this local Android build. Do not bypass the proxy or disable TLS/artifact verification to work around a network denial.

## Resume in this cloud workspace

First check the current runtime's network policy. A saved draft alone does not mean access is applied. Once `repo.reactnative.dev` is allowed:

```sh
cd /workspace/laundry-lounge/mobile
source /workspace/android-build-tools/activate.sh
export EXPO_OFFLINE=1
gradle -p android :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=3 --console=plain
```

The activation helper uses the verified local Java/SDK/Gradle installation and preserves proxy/TLS trust. Do not reinstall these prerequisites unnecessarily. If working outside this environment, follow the standard Android Studio/JDK setup in README.md instead.

Build output: `android/app/build/outputs/apk/release/app-release.apk`. After a successful build, verify its signature, app ID, min SDK, `allowBackup=false`, blocked permissions, embedded Hermes bundle and ARM64 libraries. Copy the verified file to `/workspace/Laundry-Lounge-Android.apk` for download. The generated release configuration uses a template test key; it is not a private production-signing-key release. Do not call the APK complete or installed on a device without evidence.

Build diagnostics are retained outside the repo under `/workspace/android-build-tools/`. Actual phone camera, printer and sharing behavior remains a separate device check.
