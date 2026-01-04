# 暮城笔记 Android 客户端

暮城笔记的 Android 移动客户端，与桌面端完全兼容，支持 WebDAV 同步。

## 功能特性

### 核心功能
- 📝 **笔记管理** - 富文本笔记、文件夹组织、标签分类、置顶和加锁
- 🔖 **书签管理** - 网址收藏、文件夹分类、快速访问
- ✅ **待办事项** - 四象限管理、提醒通知、优先级排序
- 🤖 **AI 助手** - 多渠道 AI 对话、流式响应
- 🔐 **密码库** - 安全存储密码、银行卡、身份信息、TOTP 验证码

### 同步功能
- WebDAV 同步（支持坚果云、NextCloud 等）
- 端到端加密（AES-256-GCM）
- 离线队列，网络恢复自动同步
- 冲突检测和处理

### 安全特性
- 应用锁（PIN/图案/生物识别）
- SQLCipher 数据库加密
- Android Keystore 密钥存储
- 敏感数据自动加密
- 剪贴板自动清除
- 防截图保护

## 系统要求

- Android 8.0 (API 26) 或更高版本
- 推荐 Android 13+ 以获得最佳体验

## 构建说明

### 环境准备

1. 安装 [Android Studio](https://developer.android.com/studio) (Hedgehog 或更新版本)
2. 安装 JDK 17
3. 配置 Android SDK (API 34)

### 构建步骤

```bash
# 进入 Android 项目目录
cd android

# 使用 Gradle Wrapper 构建 Debug 版本
./gradlew assembleDebug

# 构建 Release 版本（需要签名配置）
./gradlew assembleRelease

# 运行单元测试
./gradlew test

# 安装到连接的设备
./gradlew installDebug
```

### Windows 构建

```powershell
# 进入 Android 项目目录
cd android

# 构建 Debug 版本
.\gradlew.bat assembleDebug

# 构建 Release 版本
.\gradlew.bat assembleRelease
```

### 输出文件

- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `app/build/outputs/apk/release/app-release.apk`

## 安装说明

### 方式一：直接安装 APK

1. 在手机上启用"允许安装未知来源应用"
2. 将 APK 文件传输到手机
3. 点击 APK 文件进行安装

### 方式二：通过 ADB 安装

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 方式三：Android Studio 直接运行

1. 用 Android Studio 打开 `android` 目录
2. 连接手机或启动模拟器
3. 点击 Run 按钮

## 配置同步

### WebDAV 配置

1. 打开应用 → 设置 → 同步设置
2. 输入 WebDAV 服务器地址（如 `https://dav.jianguoyun.com/dav/`）
3. 输入用户名和密码
4. 设置同步路径（默认 `/mucheng-notes`）
5. 选择是否启用加密同步

### 坚果云配置示例

- 服务器地址: `https://dav.jianguoyun.com/dav/`
- 用户名: 你的坚果云账号
- 密码: 应用密码（在坚果云网页版 → 账户信息 → 安全选项 → 第三方应用管理 中创建）

### NextCloud 配置示例

- 服务器地址: `https://your-nextcloud.com/remote.php/dav/files/username/`
- 用户名: NextCloud 用户名
- 密码: NextCloud 密码或应用密码

## 与桌面端同步

1. 确保桌面端和 Android 端使用相同的 WebDAV 配置
2. 如果启用加密，两端必须使用相同的同步密码
3. 首次同步会自动下载所有数据
4. 之后的同步是增量的，只传输变更

## 项目结构

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/mucheng/notes/
│   │   │   │   ├── data/           # 数据层
│   │   │   │   │   ├── local/      # Room 数据库
│   │   │   │   │   ├── remote/     # WebDAV/API 客户端
│   │   │   │   │   ├── repository/ # Repository 实现
│   │   │   │   │   └── sync/       # 同步引擎
│   │   │   │   ├── di/             # Hilt 依赖注入
│   │   │   │   ├── domain/         # 领域层
│   │   │   │   │   ├── model/      # 数据模型
│   │   │   │   │   └── repository/ # Repository 接口
│   │   │   │   ├── presentation/   # 表现层
│   │   │   │   │   ├── components/ # 可复用组件
│   │   │   │   │   ├── navigation/ # 导航
│   │   │   │   │   ├── screens/    # 页面
│   │   │   │   │   ├── theme/      # 主题
│   │   │   │   │   └── viewmodel/  # ViewModel
│   │   │   │   ├── security/       # 安全组件
│   │   │   │   └── service/        # 后台服务
│   │   │   └── res/                # 资源文件
│   │   └── test/                   # 单元测试
│   └── build.gradle.kts
├── gradle/
│   └── libs.versions.toml          # 版本目录
├── build.gradle.kts
└── settings.gradle.kts
```

## 技术栈

- **语言**: Kotlin 2.0
- **UI**: Jetpack Compose + Material Design 3
- **架构**: MVVM + Clean Architecture
- **依赖注入**: Hilt
- **数据库**: Room + SQLCipher
- **网络**: OkHttp + Sardine (WebDAV)
- **序列化**: Kotlinx Serialization
- **异步**: Kotlin Coroutines + Flow
- **测试**: JUnit + Kotest (属性测试)

## 常见问题

### Q: 同步失败，提示"同步锁被占用"
A: 另一个设备正在同步，请等待几分钟后重试。如果问题持续，可以在 WebDAV 服务器上删除 `locks/sync.lock` 文件。

### Q: 同步失败，提示"同步密钥不匹配"
A: 桌面端和 Android 端使用了不同的同步密码。请确保两端使用相同的密码。

### Q: 密码库无法访问
A: 密码库需要主密码或生物识别验证。如果忘记主密码，需要在桌面端重置。

### Q: 应用被锁定，忘记 PIN
A: 可以尝试使用生物识别解锁。如果都不行，需要清除应用数据重新设置。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
