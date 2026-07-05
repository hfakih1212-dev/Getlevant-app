# EAS Build

Trigger an EAS cloud build for Android (development APK by default, or use $ARGUMENTS to specify profile/platform).

Steps:
1. Run `eas build --profile development --platform android` (adjust if $ARGUMENTS specifies otherwise)
2. Report the build URL from the output
3. When the build completes, report the APK download URL

To install on the connected emulator after download:
```
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r "$env:USERPROFILE\Downloads\souk-dev.apk"
```
