/**
 * Ghostscript 下载脚本
 * 下载 Ghostscript 便携版到 gs-portable 目录
 * 
 * 使用方法: node scripts/download-ghostscript.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ghostscript 版本和下载地址
const GS_VERSION = '10.02.1';
const GS_DOWNLOAD_URL = `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10021/gs10021w64.exe`;

// 目标目录
const GS_DIR = path.join(__dirname, '..', 'gs-portable');
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 下载文件
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from: ${url}`);
    console.log(`Saving to: ${dest}`);
    
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        console.log(`Redirecting to: ${redirectUrl}`);
        file.close();
        fs.unlinkSync(dest);
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = totalSize ? ((downloadedSize / totalSize) * 100).toFixed(1) : '?';
        process.stdout.write(`\rDownloading: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)} MB)`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete!');
        resolve();
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// 提取 Ghostscript 文件（使用 7z 或手动提取）
async function extractGhostscript(installerPath) {
  console.log('\nExtracting Ghostscript...');
  
  // 尝试使用 7z 提取
  try {
    // 检查是否有 7z
    execSync('7z --help', { stdio: 'ignore' });
    
    // 使用 7z 提取
    const extractDir = path.join(TEMP_DIR, 'gs-extract');
    ensureDir(extractDir);
    
    execSync(`7z x "${installerPath}" -o"${extractDir}" -y`, { stdio: 'inherit' });
    
    // 查找并复制需要的文件
    const gsDir = findGsDir(extractDir);
    if (gsDir) {
      copyGsFiles(gsDir);
      return true;
    }
  } catch (e) {
    console.log('7z not available, trying alternative method...');
  }
  
  // 备用方案：提示用户手动安装
  console.log('\n========================================');
  console.log('自动提取失败，请手动操作：');
  console.log('1. 运行下载的安装程序: ' + installerPath);
  console.log('2. 安装到默认位置');
  console.log('3. 将以下文件复制到 gs-portable 目录:');
  console.log('   - bin/gswin64c.exe');
  console.log('   - bin/gsdll64.dll');
  console.log('   - lib/* (所有文件)');
  console.log('   - Resource/* (所有文件)');
  console.log('========================================\n');
  
  return false;
}

// 查找 Ghostscript 目录
function findGsDir(extractDir) {
  const items = fs.readdirSync(extractDir);
  for (const item of items) {
    const itemPath = path.join(extractDir, item);
    if (fs.statSync(itemPath).isDirectory()) {
      if (item.startsWith('gs') || fs.existsSync(path.join(itemPath, 'bin'))) {
        return itemPath;
      }
      // 递归查找
      const found = findGsDir(itemPath);
      if (found) return found;
    }
  }
  return null;
}

// 复制 Ghostscript 文件
function copyGsFiles(gsDir) {
  console.log(`Copying files from: ${gsDir}`);
  
  // 复制 bin 目录
  const binSrc = path.join(gsDir, 'bin');
  const binDest = path.join(GS_DIR, 'bin');
  if (fs.existsSync(binSrc)) {
    copyDir(binSrc, binDest);
  }
  
  // 复制 lib 目录
  const libSrc = path.join(gsDir, 'lib');
  const libDest = path.join(GS_DIR, 'lib');
  if (fs.existsSync(libSrc)) {
    copyDir(libSrc, libDest);
  }
  
  // 复制 Resource 目录
  const resSrc = path.join(gsDir, 'Resource');
  const resDest = path.join(GS_DIR, 'Resource');
  if (fs.existsSync(resSrc)) {
    copyDir(resSrc, resDest);
  }
  
  console.log('Files copied successfully!');
}

// 递归复制目录
function copyDir(src, dest) {
  ensureDir(dest);
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 清理临时文件
function cleanup() {
  console.log('\nCleaning up...');
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

// 主函数
async function main() {
  console.log('========================================');
  console.log(`Ghostscript Portable Setup v${GS_VERSION}`);
  console.log('========================================\n');
  
  try {
    ensureDir(GS_DIR);
    ensureDir(TEMP_DIR);
    
    // 检查是否已存在
    const gsExe = path.join(GS_DIR, 'bin', 'gswin64c.exe');
    if (fs.existsSync(gsExe)) {
      console.log('Ghostscript already exists in gs-portable/');
      console.log('Delete the directory to re-download.');
      return;
    }
    
    // 下载安装程序
    const installerPath = path.join(TEMP_DIR, 'gs-installer.exe');
    await downloadFile(GS_DOWNLOAD_URL, installerPath);
    
    // 提取文件
    const success = await extractGhostscript(installerPath);
    
    if (success) {
      console.log('\n========================================');
      console.log('Ghostscript setup complete!');
      console.log('Location: ' + GS_DIR);
      console.log('========================================');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    // cleanup();
  }
}

main();
