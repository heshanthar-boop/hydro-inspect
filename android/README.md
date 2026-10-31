# HydroInspect Operator for Android

An installable, signed APK for Android 8.0+ (API 26). The operator screens, chart library, and draft storage are packaged inside the APK, so the first launch can work without internet. No Google account is required for operators.

## Operator workflow

1. Choose the operator (remembered on this installation).
2. Enter six cumulative meter counters, one large field at a time. Each change is committed to SQLite synchronously. The previous locally cached/submitted counter is shown alongside its unit and time.
3. Review all readings, acknowledge the check, and submit. Submission atomically moves the draft into an immutable SQLite outbox and records the device time.
4. WorkManager schedules network-constrained uploads and retry/backoff. A periodic recovery task covers interrupted scheduling. Sync status is based on a server acknowledgement, not network availability alone. Repeated uploads use the same UUID and a transaction that creates only when absent; operators have no update/delete bridge.

Keep automatic phone date/time enabled. Offline capture time is device-clock evidence, not a verified server timestamp. Shared records contain both `capturedAt` (entry time), `readingAt` (server receipt), creation/last-edit audit, per-install random ID, model, and operator. The website uses `capturedAt` for Android reading intervals; owner edits can replace the date/time explicitly. Anonymous Firebase Authentication occurs once a network is available; a first-ever offline launch does not depend on authentication.

## Permissions and ownership

The app requests only internet and connection-state permissions. It does not request contacts, phone identifiers, location, or storage permissions. Device IDs identify installations, not people. Operator names are self-selected. The local WebView serves only packaged assets, blocks remote navigation, and uses a restrictive CSP. Firebase security rules continue to enforce verified owner email `heshantha.pcl@gmail.com` for editing/deletion. The owner button opens the existing secure website in the system browser for Google sign-in, inspection work, and corrections. This release does not embed Google sign-in in a WebView.

## Data and charts

CEB import/export and LT are kWh. Generator panels and transformer are MWh; energy differences convert once to kWh. No net CEB import metric. Three chart groups mirror the website: CEB import + both generators + transformer; CEB export + LT; CEB import minus transformer signed deviation. All charts show start/end times, period values, and valid-interval coverage. Negative/missing counters are unavailable, not zero. Known replacement intervals are excluded in this companion; the owner workspace supports configured replacement calculations. Charts use synced records only, and never invent daily values across gaps.

## Offline limits

Android schedules background work; battery saver, manufacturer restrictions, force-stop, or missing internet can delay it. Reopen the app to verify the queue. Clearing storage or uninstalling deletes unsynced local data. Android backup is disabled to prevent a restored installation from replaying another installation's queue. Do not uninstall before every queued reading is synced. Cached shared readings are only as recent as the last connection.

## Build and signing

`gradle testReleaseUnitTest lintRelease assembleRelease` from this directory with JDK 17, Gradle 8.13, and Android SDK 36. The GitHub Actions workflow produces a signed APK plus SHA-256 checksum. Release signing uses the repository's `HYDRO_ANDROID_KEYSTORE` and `HYDRO_ANDROID_PASSWORD` secrets. These are never committed. Retain the original signing key for future APK updates; changing the key would require uninstalling the old app. The local backup lives in the ignored `output/signing` directory of the maintainer's checkout.

Android app registration: `com.hydroinspect.operator`, Firebase project `solarpv-field-tool`. The public Firebase SDK configuration is initialized programmatically; no service-account credentials are shipped.

## Validation

- `node tests/android-model.test.cjs`: native-unit maths, missing/decreasing/replaced counters, signed deviation, tombstones, period aggregation, offline chronology.
- Gradle unit tests enforce the operator list and numeric validation.
- Android lint and signed APK verification run in CI.
- Browser tests can inject the minimal `HydroAndroid` bridge to exercise phone layouts, durable drafts, review, local locking, and charts without writing synthetic records to the live plant.
