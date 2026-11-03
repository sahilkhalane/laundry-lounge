# Verified Android APK

The standalone Android SDK app has been built successfully and copied to `/workspace/Laundry-Lounge-Android.apk` for download.

- Package: `com.laundrylounge.app`, version 1.0.0 / code 1.
- Android 8.0+ (min API26, target36); ARM64, ARMv7, x86 and x86_64 libraries included.
- File size: 26,336,849 bytes.
- SHA256: `9d5cc761f29aad0f65276ff5ad1674eb3e404a1927f67c44587079bd59e57c93`.
- 12 Java business-rule tests passed, zero skipped/failed/errors.
- Android lint passed with zero errors; remaining warnings are nonblocking.
- APK signature, archive integrity, 16KB ZIP alignment, merged permissions, native app classes and the bundled offline barcode models were verified.
- Back gestures use Android's current callback API, with legacy phone navigation handled separately.
- Android automatic backup, microphone and overlay permissions are not enabled.

This is an Android test-signed, debuggable preview APK. Camera, printer and sharing behavior still require checking on the business phone. There is no claim of a physical-device UI test or store-ready private release signing.

The Android SDK implementation does not use the blocked React Native repository. Earlier environment network requirements for the React Native prototype and hosting are not required to install this APK. Source and build steps are in README.md. Build logs/verification details remain in `/workspace/android-build-tools/`.
