@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\91937\AppData\Local\Android\Sdk"
set "NODE_OPTIONS=--max-old-space-size=8192"
cd /d "c:\Aamir Delta\city_backup\admin\android"
if exist "app\build\outputs\apk\release\app-release.apk" del /f /q "app\build\outputs\apk\release\app-release.apk"
call gradlew.bat assembleRelease
if exist "app\build\outputs\apk\release\app-release.apk" (
    copy /y "app\build\outputs\apk\release\app-release.apk" "..\..\HotelCityPark-Owner.apk"
    copy /y "app\build\outputs\apk\release\app-release.apk" "..\..\public\HotelCityPark-Owner.apk"
    echo APK_DEPLOY_SUCCESS
) else (
    echo APK_DEPLOY_FAILED
)
