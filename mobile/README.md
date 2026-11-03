# Laundry Lounge — React Native prototype

**The installable app is now built from [`../android-native/`](../android-native/README.md).** This folder retains the React Native implementation. Its environment-specific dependency block below does not affect the Android SDK implementation or the APK.

This directory contains the Android application built with React Native and Expo. Screens use native Android controls, records use native SQLite, QR scanning uses the phone camera, and bills/tags use Android printing and file sharing. A generated standalone APK includes the app and does not need a browser, Railway, Expo Go, or a development server to run.

## Features

- Native home overview and order search/filtering.
- Three-step customer/garment/bill flow with quantities, rates, discounts, partial payments, and a unique QR tag for every garment.
- Native camera QR scanning and manual code input, with per-garment statuses and automatic order progress.
- Bills and garment tags in Android's print menu; PDF bills shared through Android's share sheet.
- Customers, expense entry, actual-payment-date reports, CSV exports and WhatsApp message drafts.
- Native Android date pickers, original-logo selection, validated JSON backups and confirmed restore/reset.
- Offline SQLite transactions. Broken data and failed writes are preserved rather than silently replaced.

The app starts with clearly marked fictional samples. Set your business details in Settings, select the original logo from your phone, export a backup if needed, then explicitly clear samples before using real records. The Windows logo path from the initial request was inaccessible to the cloud machine; the bundled mark uses the supplied brand colours and is temporary artwork.

## Install a built APK

The native source, typecheck, SQL tests and Android Hermes bundle are validated. **An APK has not been produced yet**: this cloud environment blocks the official `repo.reactnative.dev` host to which React Native Android artifacts redirect. The required domain has been saved in the environment draft; review/save and publish that change before resuming the native build. See BUILD_STATUS.md.

Once the APK build finishes, download its output onto an ARM64 Android phone, open it, and allow installation from the browser/file manager if Android asks. The configured APK is an internally test-signed release build. It is not a Play Store submission or a release signed with your private production key. Keep the same application ID and signing key for compatible updates that retain data.

Camera permission is requested when you start scanning. Logo selection uses Android's photo picker. Printing requires a compatible installed Android print service/printer. Use regular garment-safe labels suitable for your laundry process. These camera, printer and sharing functions need checks on the actual business phone/hardware; compiling the APK is not a physical-device test.

## Development

Use Node.js 24 and the existing checkout. Do not create a Git worktree unless explicitly requested.

```sh
cd mobile
npm ci
npm run typecheck
npm test
npm start
```

The tests use Node's SQLite engine to exercise the same SQL/repository contract, including records over 3 MB and rollback after an interrupted write. They do not claim to test Expo's Android SQLite bridge on a phone.

## Build a standalone APK locally

Install JDK 17 and the Android SDK with Android Studio/command-line tools. The verified build uses Android SDK 36, build-tools 36.0.0 and 35.0.0, NDK 27.1.12297006 and CMake 3.22.1. Set `JAVA_HOME` and `ANDROID_HOME` for your machine. Keep dependency/artifact checksum and TLS verification enabled.

From this directory:

```sh
npm ci
npx expo prebuild --platform android
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=3
```

On Windows use `gradlew.bat` in place of `./gradlew`. The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. The generated Android directory is ignored by Git and can be reproduced by Expo prebuild from the pinned dependency lockfile and app config. The default generated release configuration uses the template test/debug key. Configure your own protected release signing before distributing a production build through a store.

`npm run bundle` verifies a production Android Hermes JavaScript bundle and bundled offline assets without needing a phone. `npm run apk:release` combines prebuild and the local Gradle command on a Unix development machine.

In the restricted cloud environment, Expo API discovery was unavailable, so the build used `EXPO_OFFLINE=1` with Expo's bundled SDK-54 dependency versions; native dependency downloads still used the approved registries and verified Android repositories. The toolchain outside this repo was prepared for this session. It is not a prerequisite for installing the finished APK on a phone.

## Records and integrations

Records are stored privately on this phone and do not sync with another phone or the web workspace. Export regular JSON backups from Settings and keep them private. Uninstalling the app can remove its records; export first. Android automatic cloud backup is disabled, so backups remain under the owner's control.

WhatsApp opens a customer-addressed draft for review and sending. Automatic background messages require a separate Business API/server integration. Printing uses Android print services; a specific Bluetooth/thermal printer driver is not included. No tax is added to bills. The app currently records payments rather than charging a payment gateway.
