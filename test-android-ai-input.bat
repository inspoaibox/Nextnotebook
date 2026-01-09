@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ==========================================
echo Android AI 输入框修复验证
echo ==========================================
echo.

REM 检查是否在正确的目录
if not exist "android" (
    echo ❌ 错误：请在项目根目录运行此脚本
    exit /b 1
)

echo ✅ 当前目录正确
echo.

REM 检查修改的文件
echo 📝 检查修改的文件...
findstr /C:"navigationBarsPadding" android\app\src\main\java\com\mucheng\notes\presentation\screens\ai\AIScreen.kt >nul
if %errorlevel% equ 0 (
    echo ✅ AIScreen.kt 已添加 navigationBarsPadding
) else (
    echo ❌ AIScreen.kt 缺少 navigationBarsPadding
    exit /b 1
)

findstr /C:"Surface" android\app\src\main\java\com\mucheng\notes\presentation\screens\ai\AIScreen.kt >nul
if %errorlevel% equ 0 (
    echo ✅ AIScreen.kt 已使用 Surface 容器
) else (
    echo ❌ AIScreen.kt 缺少 Surface 容器
    exit /b 1
)

echo.
echo ==========================================
echo 开始编译 Android 应用...
echo ==========================================
echo.

cd android

REM 清理旧的构建
echo 🧹 清理旧的构建...
call gradlew.bat clean

REM 编译 Debug 版本
echo.
echo 🔨 编译 Debug 版本...
call gradlew.bat assembleDebug

if %errorlevel% equ 0 (
    echo.
    echo ==========================================
    echo ✅ 编译成功！
    echo ==========================================
    echo.
    echo APK 位置：
    echo android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo 下一步：
    echo 1. 连接 Android 设备或启动模拟器
    echo 2. 运行以下命令安装：
    echo    adb install app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo 3. 测试步骤：
    echo    - 打开应用
    echo    - 进入 AI 助手页面
    echo    - 创建新对话
    echo    - 点击输入框
    echo    - 检查键盘弹出时输入框是否可见
    echo.
) else (
    echo.
    echo ==========================================
    echo ❌ 编译失败
    echo ==========================================
    echo.
    echo 请检查错误信息并修复
    exit /b 1
)

cd ..

