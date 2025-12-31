# Ghostscript 便携版设置

本目录包含 Ghostscript 10.04.0 便携版文件，用于 PDF 压缩和转换功能。

## 当前版本

- Ghostscript 10.04.0 (Windows 64-bit)
- 已包含所有必要的运行时文件

## 目录结构

```
gs-portable/
├── bin/
│   ├── gswin64c.exe    (命令行版本)
│   └── gsdll64.dll     (动态链接库)
├── lib/                 (PostScript 库文件)
├── Resource/            (字体和资源文件)
│   ├── CIDFont/
│   ├── CMap/
│   ├── Font/
│   └── Init/
└── README.md
```

## 验证安装

运行以下命令验证 Ghostscript 是否正常工作:

```bash
# Windows
gs-portable\bin\gswin64c.exe --version
```

应输出: `10.04.0`

## 打包说明

在 electron-builder 配置中，gs-portable 目录会被打包到应用的 resources/gs 目录中。
应用会自动检测并使用内置的 Ghostscript。

## 手动更新步骤

如需更新 Ghostscript 版本：

1. 下载新版本:
   - 访问 https://ghostscript.com/releases/gsdnld.html
   - 下载 Windows 64-bit 版本

2. 安装到临时目录

3. 复制以下文件到此目录:
   - `bin/gswin64c.exe`
   - `bin/gsdll64.dll`
   - `lib/*` (所有文件)
   - `Resource/*` (所有子目录)

4. 验证新版本可正常运行
