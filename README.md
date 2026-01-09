# 暮城笔记

一款安全、简洁的本地加密笔记应用，支持桌面端和移动端。

## ✨ 特性

### 核心功能
- 🔐 **端到端加密** - 所有笔记内容使用 AES-256-GCM 加密存储
- 📝 **Markdown 支持** - 完整的 Markdown 编辑和实时预览
- 📁 **文件夹管理** - 支持创建文件夹分类管理笔记
- 🔒 **笔记独立密码** - 可为单个笔记设置额外密码保护
- 📌 **置顶功能** - 重要笔记可置顶显示
- 🏷️ **标签系统** - 支持为笔记添加标签
- 🖼️ **图片支持** - 支持粘贴和拖拽插入图片
- 📤 **导出功能** - 支持导出为 Markdown 和 PDF
- 💾 **本地存储** - 数据完全存储在本地，保护隐私
- 🎨 **主题切换** - 支持浅色/深色/跟随系统主题

### 同步功能
- ☁️ **WebDAV 同步** - 支持通过 WebDAV 同步数据
- 🔄 **增量同步** - 只同步变更的内容
- 🔐 **加密同步** - 可选择加密或明文同步模式
- 📱 **多设备支持** - 支持多设备间数据同步

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 构建应用
```bash
# 构建代码
npm run build

# 启动应用
npm start
```

### 打包发布

详细构建流程请参考下方 [构建指南](#-构建指南) 章节。

```bash
# Windows
npm run dist:win

# 所有平台
npm run dist
```

## 🔨 构建指南

### 电脑端 (Windows/Electron)

#### 环境要求
- Node.js >= 18
- npm >= 9
- Windows 10/11 (用于构建 Windows 版本)

#### 构建步骤

1. **安装依赖**
```bash
npm install
```

2. **构建代码**
```bash
npm run build
```
此命令会依次执行：
- `npm run build:main` - 构建 Electron 主进程
- `npm run build:renderer` - 构建 React 渲染进程

3. **打包 Windows 安装包**
```bash
npm run dist:win
```

#### 输出文件
构建完成后，输出文件位于 `release/` 目录：
- `暮城笔记 Setup 1.0.0.exe` - NSIS 安装版（支持自定义安装目录）
- `暮城笔记 1.0.0.exe` - 便携版（无需安装，直接运行）

#### 其他平台
```bash
# macOS
npm run dist:mac

# Linux
npm run dist:linux

# 所有平台
npm run dist
```

---

### 安卓端 (Android)

#### 环境要求
- JDK 17+
- Android SDK (API 34)
- Gradle 8.9+

#### 项目结构
```
android/
├── app/
│   ├── build.gradle.kts      # 应用构建配置
│   ├── proguard-rules.pro    # ProGuard 混淆规则
│   ├── mucheng-release.jks   # 签名密钥文件
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml
│           ├── java/com/mucheng/notes/  # Kotlin 源码
│           └── res/                      # 资源文件
├── build.gradle.kts          # 项目构建配置
├── gradle.properties         # Gradle 属性
├── settings.gradle.kts       # 项目设置
└── gradlew.bat              # Gradle 包装器 (Windows)
```

#### 签名配置
签名信息已配置在 `android/app/build.gradle.kts` 中：
```kotlin
signingConfigs {
    create("release") {
        storeFile = file("mucheng-release.jks")
        storePassword = "mucheng123"
        keyAlias = "mucheng"
        keyPassword = "mucheng123"
    }
}
```

> ⚠️ **安全提示**: 生产环境建议将签名信息移至 `local.properties` 或环境变量中，不要提交到版本控制。

#### 构建步骤

1. **进入 Android 目录**
```bash
cd android
```

2. **构建 Release APK**
```bash
# Windows
.\gradlew.bat assembleRelease

# macOS/Linux
./gradlew assembleRelease
```

3. **清理后重新构建（可选）**
```bash
# Windows
.\gradlew.bat clean assembleRelease

# macOS/Linux
./gradlew clean assembleRelease
```

#### 输出文件
构建完成后，APK 文件位于：
```
android/app/build/outputs/apk/release/app-release.apk
```

#### 构建 Debug 版本
```bash
.\gradlew.bat assembleDebug
```
输出：`android/app/build/outputs/apk/debug/app-debug.apk`

#### 常见问题

1. **R8 混淆错误 (XmlPullParser 冲突)**
   
   已在 `build.gradle.kts` 中排除冲突依赖：
   ```kotlin
   implementation(libs.sardine) {
       exclude(group = "xmlpull", module = "xmlpull")
       exclude(group = "xpp3", module = "xpp3")
   }
   ```

2. **Lint 检查失败**
   
   已禁用 Release 构建的 Lint 检查以加快构建速度。

3. **签名密钥丢失**
   
   重新生成签名密钥：
   ```bash
   keytool -genkey -v -keystore android/app/mucheng-release.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias mucheng -storepass mucheng123 -keypass mucheng123 \
     -dname "CN=MuchengNotes, OU=Dev, O=Mucheng, L=Beijing, ST=Beijing, C=CN"
   ```
   > ⚠️ 注意：更换签名密钥后，用户需要卸载旧版本才能安装新版本。

---

### 构建脚本速查

| 平台 | 命令 | 输出 |
|------|------|------|
| Windows 电脑端 | `npm run dist:win` | `release/暮城笔记 Setup 1.0.0.exe` |
| Windows 便携版 | `npm run dist:win` | `release/暮城笔记 1.0.0.exe` |
| Android Release | `cd android && .\gradlew.bat assembleRelease` | `android/app/build/outputs/apk/release/app-release.apk` |
| Android Debug | `cd android && .\gradlew.bat assembleDebug` | `android/app/build/outputs/apk/debug/app-debug.apk` |

## 📁 项目结构

```
src/
├── main/                 # Electron 主进程
│   ├── main.ts          # 主进程入口
│   ├── preload.ts       # 预加载脚本
│   └── services/        # 主进程服务
├── renderer/            # React 渲染进程
│   ├── components/      # UI 组件
│   ├── contexts/        # React Context
│   ├── hooks/           # 自定义 Hooks
│   ├── services/        # API 服务
│   └── styles/          # 样式文件
├── core/                # 核心业务逻辑
│   ├── database/        # 数据库管理
│   ├── crypto/          # 加密引擎
│   ├── sync/            # 同步引擎
│   ├── backup/          # 备份管理
│   ├── export/          # 导出功能
│   └── resources/       # 资源管理
└── shared/              # 共享类型定义
    └── types/           # TypeScript 类型
```

## 🛠️ 技术栈

- **框架**: Electron + React + TypeScript
- **UI**: Ant Design
- **数据库**: SQLite (better-sqlite3)
- **加密**: AES-256-GCM + PBKDF2
- **同步**: WebDAV
- **编辑器**: Monaco Editor / Textarea
- **Markdown**: react-markdown

## 📝 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm start` | 运行构建后的应用 |
| `npm test` | 运行测试 |
| `npm run lint` | 代码检查 |
| `npm run format` | 代码格式化 |
| `npm run type-check` | TypeScript 类型检查 |

## 📄 许可证

MIT License
