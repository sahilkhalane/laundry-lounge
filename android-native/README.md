# Laundry Lounge for Android

This is the installable Android application. It uses Java and Android's native UI, SQLite database, Camera2 QR scanning, PDF printing and Android share controls. It runs independently on the phone; it does not need a browser, Railway, Expo Go or a development server.

## Install

Use the `Laundry-Lounge-Android.apk` download provided in the chat. Download/open it on an Android 8.0 or newer phone and allow installation from the browser or file manager if Android asks. This is a test-signed preview APK, not a Play Store release signed with a private production key. Do not uninstall an existing copy without first exporting its records.

The app starts with an empty real workspace. Add a customer or tap **New order** to add one while creating their bill. Settings accepts your original logo and business details. The supplied Windows logo file was not readable from the cloud workspace, so the bundled launcher mark is temporary brand artwork; a logo selected on the phone appears in the header and on printed bills/tags.

## Everyday workflow

- **New order:** choose/add customer, add garments and service rates, collection date and care instructions, then discount/payment. The app calculates the bill and creates a unique QR tag for each piece.
- **Order details:** record partial/full payments, change the entire order's garment status, print its bill or tags, share its PDF, or open a prepared WhatsApp message.
- **Scan tag:** Android requests camera permission and reads the printed QR offline. Update one garment's status; the order advances when all pieces reach the stage. Printed-code entry is also available.
- **Customers:** native search, add/edit contact information, order counts and outstanding balances.
- **Expenses/reports:** track dated expenses and view collections by actual payment date, service mix, balances and CSV exports.
- **Settings:** business details, original-logo selection and validated JSON backup/restore. Reset requires explicit confirmation and preserves business settings.

Bills and tags are actual native PDFs. Android's print menu can print or save PDF using compatible print services. A dedicated Bluetooth/thermal-printer driver is not included. WhatsApp opens a draft for review and sending; background messaging is not connected.

Records are saved privately in SQLite on this phone. Each record has its own row, and updates run in a transaction. Customer/order backup JSON is compatible with the previous workspace format. Export backups regularly; uninstalling the app can remove data. Records do not automatically sync to another phone or the earlier web workspace. No login or multi-business service is included.

## Build and verify

Open this directory in Android Studio, or use JDK17 and Android SDK36/build-tools36.0.0. No React Native artifacts or Expo account are required.

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug --max-workers=3
```

On Windows use `gradlew.bat`. Output is `app/build/outputs/apk/debug/app-debug.apk`. The Gradle wrapper has the official distribution SHA256 pinned. The debug APK is standalone and Android test-signs it automatically. Configure your own protected release signing for store distribution.

The native business-rule suite exercises billing, payments, unique tags, aggregate garment status and backup validation. These tests and a successful build do not replace checking the actual business phone's camera, printer and sharing apps.

In the prepared cloud workspace the verified toolchain/cache can be activated with `source /workspace/android-build-tools/activate.sh`; then run `gradle -p android-native :app:testDebugUnitTest :app:assembleDebug --max-workers=3` from the repository root. Build artifacts and local SDK configuration are ignored by Git.
