/**
 * GhostscriptService - Ghostscript 调用服务
 * 封装 Ghostscript 命令行操作，用于 PDF 转图片和压缩
 * 支持内置便携版和系统安装版
 */

import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ============ 类型定义 ============

export interface ToImageOptions {
  format: 'png' | 'jpg';
  dpi: number;
  pages?: number[];
}

export interface CompressResult {
  data: Buffer;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

export type CompressLevel = 'low' | 'medium' | 'high';

// PDF/A 标准类型
export type PDFALevel = '1b' | '2b' | '3b';

// PDF 版本
export type PDFVersion = '1.4' | '1.5' | '1.6' | '1.7' | '2.0';

// 转换结果
export interface ConvertResult {
  data: Buffer;
  originalSize: number;
  convertedSize: number;
}

// 水印选项
export interface GSWatermarkOptions {
  text: string;
  fontSize?: number;
  color?: string;  // hex color like '#FF0000'
  opacity?: number; // 0-1
  rotation?: number; // degrees
  position: 'center' | 'tile';
  spacingX?: number;  // 横向间距
  spacingY?: number;  // 纵向间距
  pages?: number[];
}

// ============ GhostscriptService 类 ============

export class GhostscriptService {
  private gsPath: string | null = null;
  private gsLibPath: string | null = null;
  private tempDir: string;
  private isAvailable: boolean = false;
  private version: string | null = null;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'mucheng-pdf');
    this.ensureTempDir();
    this.detectGhostscript();
  }

  /**
   * 确保临时目录存在
   */
  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 获取应用资源路径
   */
  private getResourcesPath(): string {
    // 生产环境: 从 resources 目录读取
    if (process.resourcesPath) {
      const prodPath = path.join(process.resourcesPath, 'gs');
      console.log('GhostscriptService: Production path =', prodPath);
      console.log('GhostscriptService: resourcesPath =', process.resourcesPath);
      return prodPath;
    }
    
    // 开发环境: __dirname 是 dist/main（webpack 输出目录）
    const devPath = path.join(__dirname, '..', '..', 'gs-portable');
    console.log('GhostscriptService: Dev path =', devPath);
    console.log('GhostscriptService: __dirname =', __dirname);
    return devPath;
  }


  /**
   * 检测 Ghostscript 路径
   */
  private detectGhostscript(): void {
    const resourcesPath = this.getResourcesPath();
    console.log('GhostscriptService: Detecting Ghostscript...');
    console.log('GhostscriptService: Resources path =', resourcesPath);
    
    // 可能的 Ghostscript 路径（按优先级排序）
    const possiblePaths: Array<{ exe: string; lib?: string }> = [];
    
    if (process.platform === 'win32') {
      // 1. 内置便携版（最高优先级）
      const builtinExe = path.join(resourcesPath, 'bin', 'gswin64c.exe');
      console.log('GhostscriptService: Checking builtin path =', builtinExe);
      console.log('GhostscriptService: Builtin exists =', fs.existsSync(builtinExe));
      
      possiblePaths.push({
        exe: builtinExe,
        lib: path.join(resourcesPath, 'lib'),
      });
      
      // 2. 系统安装的 Ghostscript（各版本）
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      
      // 扫描常见版本
      const versions = ['10.04.0', '10.03.1', '10.02.1', '10.01.2', '10.00.0', '9.56.1', '9.55.0'];
      for (const ver of versions) {
        possiblePaths.push({
          exe: path.join(programFiles, 'gs', `gs${ver}`, 'bin', 'gswin64c.exe'),
          lib: path.join(programFiles, 'gs', `gs${ver}`, 'lib'),
        });
        possiblePaths.push({
          exe: path.join(programFilesX86, 'gs', `gs${ver}`, 'bin', 'gswin32c.exe'),
          lib: path.join(programFilesX86, 'gs', `gs${ver}`, 'lib'),
        });
      }
      
      // 3. 环境变量中的 gs
      possiblePaths.push({ exe: 'gswin64c.exe' });
      possiblePaths.push({ exe: 'gswin32c.exe' });
      
    } else if (process.platform === 'darwin') {
      // macOS
      possiblePaths.push({
        exe: path.join(resourcesPath, 'bin', 'gs'),
        lib: path.join(resourcesPath, 'lib'),
      });
      possiblePaths.push({ exe: '/opt/homebrew/bin/gs' });
      possiblePaths.push({ exe: '/usr/local/bin/gs' });
      possiblePaths.push({ exe: 'gs' });
      
    } else {
      // Linux
      possiblePaths.push({
        exe: path.join(resourcesPath, 'bin', 'gs'),
        lib: path.join(resourcesPath, 'lib'),
      });
      possiblePaths.push({ exe: '/usr/bin/gs' });
      possiblePaths.push({ exe: '/usr/local/bin/gs' });
      possiblePaths.push({ exe: 'gs' });
    }

    // 检测可用的路径
    for (const gsConfig of possiblePaths) {
      if (this.testGhostscript(gsConfig.exe)) {
        this.gsPath = gsConfig.exe;
        this.gsLibPath = gsConfig.lib || null;
        this.isAvailable = true;
        this.version = this.getGsVersion();
        console.log(`Ghostscript found at: ${gsConfig.exe}`);
        if (gsConfig.lib) {
          console.log(`Ghostscript lib path: ${gsConfig.lib}`);
        }
        console.log(`Ghostscript version: ${this.version}`);
        return;
      }
    }

    console.warn('Ghostscript not found. PDF compression and conversion features will use fallback methods.');
    this.isAvailable = false;
  }

  /**
   * 测试 Ghostscript 是否可用
   */
  private testGhostscript(gsPath: string): boolean {
    try {
      // 检查文件是否存在（对于绝对路径）
      if (path.isAbsolute(gsPath)) {
        if (!fs.existsSync(gsPath)) {
          return false;
        }
      }
      
      // 尝试执行 --version 命令
      try {
        execSync(`"${gsPath}" --version`, { 
          stdio: 'pipe',
          timeout: 5000,
          windowsHide: true,
        });
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * 获取 Ghostscript 版本
   */
  private getGsVersion(): string | null {
    if (!this.gsPath) return null;
    
    try {
      const result = execSync(`"${this.gsPath}" --version`, {
        stdio: 'pipe',
        timeout: 5000,
        windowsHide: true,
      });
      return result.toString().trim();
    } catch {
      return null;
    }
  }

  /**
   * 检查 Ghostscript 是否可用
   */
  checkAvailability(): { available: boolean; path: string | null; version: string | null } {
    return {
      available: this.isAvailable,
      path: this.gsPath,
      version: this.version,
    };
  }

  /**
   * 生成唯一的临时文件名
   */
  private generateTempPath(prefix: string, ext: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(this.tempDir, `${prefix}_${timestamp}_${random}.${ext}`);
  }

  /**
   * 清理临时文件
   */
  private cleanupTempFiles(files: string[]): void {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (e) {
        console.warn(`Failed to cleanup temp file: ${file}`, e);
      }
    }
  }


  /**
   * 构建 Ghostscript 命令参数
   * 如果有内置 lib 路径，添加 -I 参数
   */
  private buildArgs(baseArgs: string[]): string[] {
    const args = [...baseArgs];
    
    // 如果有内置 lib 路径，添加搜索路径
    if (this.gsLibPath && fs.existsSync(this.gsLibPath)) {
      args.unshift(`-I${this.gsLibPath}`);
    }
    
    return args;
  }

  /**
   * 执行 Ghostscript 命令
   */
  private execute(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.gsPath) {
        reject(new Error('Ghostscript is not available'));
        return;
      }

      const finalArgs = this.buildArgs(args);
      console.log(`Executing Ghostscript: ${this.gsPath} ${finalArgs.join(' ')}`);

      const gsProcess = spawn(this.gsPath, finalArgs, {
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      gsProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      gsProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      gsProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Ghostscript failed with code ${code}: ${stderr || stdout}`));
        }
      });

      gsProcess.on('error', (err) => {
        reject(new Error(`Failed to start Ghostscript: ${err.message}`));
      });
    });
  }

  /**
   * PDF 转图片
   */
  async toImage(inputBuffer: Buffer, options: ToImageOptions): Promise<Buffer[]> {
    if (!this.isAvailable) {
      throw new Error('Ghostscript is not available');
    }

    const tempFiles: string[] = [];
    const results: Buffer[] = [];

    try {
      // 写入临时 PDF 文件
      const inputPath = this.generateTempPath('input', 'pdf');
      fs.writeFileSync(inputPath, inputBuffer);
      tempFiles.push(inputPath);

      // 设置输出参数
      const device = options.format === 'png' ? 'png16m' : 'jpeg';
      const ext = options.format === 'png' ? 'png' : 'jpg';
      const outputPattern = this.generateTempPath('page', ext).replace(`.${ext}`, `_%03d.${ext}`);

      const args = [
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        `-sDEVICE=${device}`,
        `-r${options.dpi}`,
        // 字体渲染优化
        '-dTextAlphaBits=4',      // 文字抗锯齿
        '-dGraphicsAlphaBits=4',  // 图形抗锯齿
        // 使用 PDF 中嵌入的字体，不替换
        '-dNOSUBSTDEVICECOLORS',
        '-dUseCIEColor',
        `-sOutputFile=${outputPattern}`,
      ];

      // 添加系统字体路径（Windows）
      if (process.platform === 'win32') {
        const fontPath = 'C:/Windows/Fonts';
        if (fs.existsSync(fontPath)) {
          args.push(`-sFONTPATH=${fontPath}`);
        }
      } else if (process.platform === 'darwin') {
        // macOS 字体路径
        args.push('-sFONTPATH=/System/Library/Fonts:/Library/Fonts:~/Library/Fonts');
      } else {
        // Linux 字体路径
        args.push('-sFONTPATH=/usr/share/fonts:/usr/local/share/fonts');
      }

      // 如果指定了页面范围
      if (options.pages && options.pages.length > 0) {
        const minPage = Math.min(...options.pages);
        const maxPage = Math.max(...options.pages);
        args.push(`-dFirstPage=${minPage}`);
        args.push(`-dLastPage=${maxPage}`);
      }

      // JPEG 质量设置
      if (options.format === 'jpg') {
        args.push('-dJPEGQ=95');
      }

      args.push(inputPath);

      // 执行转换
      await this.execute(args);

      // 读取生成的图片文件
      const outputDir = path.dirname(outputPattern);
      const outputPrefix = path.basename(outputPattern).replace('_%03d.' + ext, '');
      
      const files = fs.readdirSync(outputDir)
        .filter(f => f.startsWith(outputPrefix) && f.endsWith(`.${ext}`))
        .sort();

      for (const file of files) {
        const filePath = path.join(outputDir, file);
        tempFiles.push(filePath);
        
        // 如果指定了特定页面，检查是否在范围内
        if (options.pages && options.pages.length > 0) {
          const pageMatch = file.match(/_(\d+)\./);
          if (pageMatch) {
            const pageNum = parseInt(pageMatch[1], 10);
            if (!options.pages.includes(pageNum)) {
              continue;
            }
          }
        }
        
        results.push(fs.readFileSync(filePath));
      }

      return results;
    } finally {
      // 清理临时文件
      this.cleanupTempFiles(tempFiles);
    }
  }


  /**
   * PDF 压缩
   */
  async compress(inputBuffer: Buffer, level: CompressLevel): Promise<CompressResult> {
    if (!this.isAvailable) {
      throw new Error('Ghostscript is not available');
    }

    const tempFiles: string[] = [];

    try {
      // 写入临时 PDF 文件
      const inputPath = this.generateTempPath('input', 'pdf');
      const outputPath = this.generateTempPath('output', 'pdf');
      fs.writeFileSync(inputPath, inputBuffer);
      tempFiles.push(inputPath);
      tempFiles.push(outputPath);

      // 压缩级别设置
      // /screen - 72 dpi, 最小文件
      // /ebook - 150 dpi, 中等质量
      // /printer - 300 dpi, 高质量
      // /prepress - 300 dpi, 最高质量
      const settings: Record<CompressLevel, string> = {
        high: '/screen',       // 最高压缩，最小文件
        medium: '/ebook',      // 中等压缩
        low: '/printer',       // 低压缩，高质量
      };

      const args = [
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        '-sDEVICE=pdfwrite',
        `-dPDFSETTINGS=${settings[level]}`,
        '-dCompatibilityLevel=1.4',
        // 图片压缩设置
        '-dColorImageDownsampleType=/Bicubic',
        '-dGrayImageDownsampleType=/Bicubic',
        '-dMonoImageDownsampleType=/Subsample',
        // 根据压缩级别设置图片分辨率
        ...(level === 'high' ? [
          '-dColorImageResolution=72',
          '-dGrayImageResolution=72',
          '-dMonoImageResolution=150',
        ] : level === 'medium' ? [
          '-dColorImageResolution=150',
          '-dGrayImageResolution=150',
          '-dMonoImageResolution=300',
        ] : [
          '-dColorImageResolution=300',
          '-dGrayImageResolution=300',
          '-dMonoImageResolution=600',
        ]),
        // 嵌入字体
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        // 输出文件
        `-sOutputFile=${outputPath}`,
        inputPath,
      ];

      // 执行压缩
      await this.execute(args);

      // 读取压缩后的文件
      const compressedBuffer = fs.readFileSync(outputPath);
      const originalSize = inputBuffer.length;
      const compressedSize = compressedBuffer.length;

      return {
        data: compressedBuffer,
        originalSize,
        compressedSize,
        ratio: originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0,
      };
    } finally {
      // 清理临时文件
      this.cleanupTempFiles(tempFiles);
    }
  }

  /**
   * PDF 转灰度
   * 将彩色 PDF 转换为灰度 PDF，可显著减小文件大小
   */
  async toGrayscale(inputBuffer: Buffer): Promise<ConvertResult> {
    if (!this.isAvailable) {
      throw new Error('Ghostscript is not available');
    }

    const tempFiles: string[] = [];

    try {
      const inputPath = this.generateTempPath('input', 'pdf');
      const outputPath = this.generateTempPath('output_gray', 'pdf');
      fs.writeFileSync(inputPath, inputBuffer);
      tempFiles.push(inputPath);
      tempFiles.push(outputPath);

      const args = [
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        // 灰度转换设置
        '-sColorConversionStrategy=Gray',
        '-dProcessColorModel=/DeviceGray',
        '-dAutoRotatePages=/None',
        // 保持质量
        '-dPDFSETTINGS=/printer',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ];

      await this.execute(args);

      const convertedBuffer = fs.readFileSync(outputPath);
      return {
        data: convertedBuffer,
        originalSize: inputBuffer.length,
        convertedSize: convertedBuffer.length,
      };
    } finally {
      this.cleanupTempFiles(tempFiles);
    }
  }

  /**
   * PDF/A 转换
   * 将 PDF 转换为符合存档标准的 PDF/A 格式
   */
  async toPDFA(inputBuffer: Buffer, level: PDFALevel = '2b'): Promise<ConvertResult> {
    if (!this.isAvailable) {
      throw new Error('Ghostscript is not available');
    }

    const tempFiles: string[] = [];

    try {
      const inputPath = this.generateTempPath('input', 'pdf');
      const outputPath = this.generateTempPath('output_pdfa', 'pdf');
      fs.writeFileSync(inputPath, inputBuffer);
      tempFiles.push(inputPath);
      tempFiles.push(outputPath);

      // PDF/A 级别对应的参数
      const pdfaParams: Record<PDFALevel, string> = {
        '1b': '1',
        '2b': '2',
        '3b': '3',
      };

      const args = [
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        '-sDEVICE=pdfwrite',
        `-dPDFA=${pdfaParams[level]}`,
        '-dPDFACompatibilityPolicy=1',
        '-dAutoRotatePages=/None',
        // 嵌入所有字体
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        // 颜色设置
        '-sColorConversionStrategy=UseDeviceIndependentColor',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ];

      await this.execute(args);

      const convertedBuffer = fs.readFileSync(outputPath);
      return {
        data: convertedBuffer,
        originalSize: inputBuffer.length,
        convertedSize: convertedBuffer.length,
      };
    } finally {
      this.cleanupTempFiles(tempFiles);
    }
  }

  /**
   * PDF 修复
   * 尝试修复损坏的 PDF 文件
   */
  async repair(inputBuffer: Buffer): Promise<ConvertResult> {
    if (!this.isAvailable) {
      throw new Error('Ghostscript is not available');
    }

    const tempFiles: string[] = [];

    try {
      const inputPath = this.generateTempPath('input', 'pdf');
      const outputPath = this.generateTempPath('output_repaired', 'pdf');
      fs.writeFileSync(inputPath, inputBuffer);
      tempFiles.push(inputPath);
      tempFiles.push(outputPath);

      const args = [
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        // 修复设置
        '-dPDFDontUseFontObjectNum=true',
        '-dAutoRotatePages=/None',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ];

      await this.execute(args);

      const repairedBuffer = fs.readFileSync(outputPath);
      return {
        data: repairedBuffer,
        originalSize: inputBuffer.length,
        convertedSize: repairedBuffer.length,
      };
    } finally {
      this.cleanupTempFiles(tempFiles);
    }
  }

  /**
   * PDF 版本转换
   * 将 PDF 转换为指定版本
   */
  async convertVersion(inputBuffer: Buffer, version: PDFVersion): Promise<ConvertResult> {
    if (!this.isAvailable) {
      throw new Error('Ghostscript is not available');
    }

    const tempFiles: string[] = [];

    try {
      const inputPath = this.generateTempPath('input', 'pdf');
      const outputPath = this.generateTempPath('output_version', 'pdf');
      fs.writeFileSync(inputPath, inputBuffer);
      tempFiles.push(inputPath);
      tempFiles.push(outputPath);

      const args = [
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        '-sDEVICE=pdfwrite',
        `-dCompatibilityLevel=${version}`,
        '-dAutoRotatePages=/None',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ];

      await this.execute(args);

      const convertedBuffer = fs.readFileSync(outputPath);
      return {
        data: convertedBuffer,
        originalSize: inputBuffer.length,
        convertedSize: convertedBuffer.length,
      };
    } finally {
      this.cleanupTempFiles(tempFiles);
    }
  }

  /**
   * PDF 线性化（Web 优化）
   * 优化 PDF 以便在 Web 上快速查看
   */
  async linearize(inputBuffer: Buffer): Promise<ConvertResult> {
    if (!this.isAvailable) {
      throw new Error('Ghostscript is not available');
    }

    const tempFiles: string[] = [];

    try {
      const inputPath = this.generateTempPath('input', 'pdf');
      const outputPath = this.generateTempPath('output_linear', 'pdf');
      fs.writeFileSync(inputPath, inputBuffer);
      tempFiles.push(inputPath);
      tempFiles.push(outputPath);

      const args = [
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        // 线性化设置
        '-dFastWebView=true',
        '-dAutoRotatePages=/None',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ];

      await this.execute(args);

      const linearizedBuffer = fs.readFileSync(outputPath);
      return {
        data: linearizedBuffer,
        originalSize: inputBuffer.length,
        convertedSize: linearizedBuffer.length,
      };
    } finally {
      this.cleanupTempFiles(tempFiles);
    }
  }

  /**
   * 添加文字水印
   * 方案：使用 sharp 生成水印图片，然后用 pdf-lib 添加图片水印
   * 这样可以完美支持中文
   */
  async addWatermark(inputBuffer: Buffer, options: GSWatermarkOptions): Promise<Buffer> {
    try {
      const { PDFDocument } = require('pdf-lib');
      const sharp = require('sharp');
      
      // 加载原 PDF
      const pdfDoc = await PDFDocument.load(inputBuffer);
      const pages = pdfDoc.getPages();
      
      if (pages.length === 0) {
        throw new Error('PDF has no pages');
      }
      
      // 解析颜色
      const color = options.color || '#888888';
      const fontSize = options.fontSize || 48;
      const opacity = options.opacity || 0.3;
      const rotation = options.rotation || -45;
      const text = options.text;
      
      // 获取第一页尺寸作为参考
      const firstPage = pages[0];
      const { width: pageWidth, height: pageHeight } = firstPage.getSize();
      
      // 使用 sharp 生成水印图片
      // 计算画布大小（需要足够大以容纳旋转后的文本）
      const diagonal = Math.sqrt(pageWidth * pageWidth + pageHeight * pageHeight);
      const canvasSize = Math.ceil(diagonal);
      
      // 创建 SVG 水印
      const svgWatermark = this.createWatermarkSVG(
        text,
        canvasSize,
        canvasSize,
        fontSize,
        color,
        opacity,
        rotation,
        options.position,
        options.spacingX,
        options.spacingY
      );
      
      // 使用 sharp 将 SVG 转换为 PNG
      const watermarkPng = await sharp(Buffer.from(svgWatermark))
        .png()
        .toBuffer();
      
      // 将水印图片嵌入到每一页
      const watermarkImage = await pdfDoc.embedPng(watermarkPng);
      
      for (const page of pages) {
        const { width, height } = page.getSize();
        
        // 计算水印图片的位置和大小
        // 将水印居中放置
        const scale = Math.min(width / canvasSize, height / canvasSize);
        const drawWidth = canvasSize * scale;
        const drawHeight = canvasSize * scale;
        const x = (width - drawWidth) / 2;
        const y = (height - drawHeight) / 2;
        
        page.drawImage(watermarkImage, {
          x,
          y,
          width: drawWidth,
          height: drawHeight,
          opacity: 1, // 透明度已经在 SVG 中设置
        });
      }
      
      return Buffer.from(await pdfDoc.save());
    } catch (error) {
      console.error('GhostscriptService: addWatermark failed:', error);
      throw error;
    }
  }
  
  /**
   * 创建水印 SVG
   */
  private createWatermarkSVG(
    text: string,
    width: number,
    height: number,
    fontSize: number,
    color: string,
    opacity: number,
    rotation: number,
    position: 'center' | 'tile',
    spacingX?: number,
    spacingY?: number
  ): string {
    // 获取字体族
    const fontFamily = this.getCanvasFontFamily();
    
    // 估算文本宽度（中文字符约等于字号宽度）
    const textWidth = text.length * fontSize;
    const textHeight = fontSize;
    
    let textElements = '';
    
    if (position === 'tile') {
      // 平铺水印 - 使用用户指定的间距或默认值
      const gapX = spacingX !== undefined ? spacingX : 100;
      const gapY = spacingY !== undefined ? spacingY : 80;
      const stepX = textWidth + gapX;
      const stepY = textHeight + gapY;
      
      // 生成平铺的文本元素
      for (let y = -height; y < height * 2; y += stepY) {
        for (let x = -width; x < width * 2; x += stepX) {
          textElements += `
            <text 
              x="${x}" 
              y="${y}" 
              font-family="${fontFamily}, Microsoft YaHei, SimHei, sans-serif"
              font-size="${fontSize}"
              fill="${color}"
              fill-opacity="${opacity}"
              transform="rotate(${rotation}, ${x}, ${y})"
            >${this.escapeXml(text)}</text>`;
        }
      }
    } else {
      // 居中水印
      const centerX = width / 2;
      const centerY = height / 2;
      
      textElements = `
        <text 
          x="${centerX}" 
          y="${centerY}" 
          font-family="${fontFamily}, Microsoft YaHei, SimHei, sans-serif"
          font-size="${fontSize}"
          fill="${color}"
          fill-opacity="${opacity}"
          text-anchor="middle"
          dominant-baseline="middle"
          transform="rotate(${rotation}, ${centerX}, ${centerY})"
        >${this.escapeXml(text)}</text>`;
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${textElements}
</svg>`;
  }
  
  /**
   * 转义 XML 特殊字符
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  /**
   * 获取 Canvas 使用的字体族
   * 优先使用中文字体
   */
  private getCanvasFontFamily(): string {
    if (process.platform === 'win32') {
      // Windows 中文字体优先级
      return 'Microsoft YaHei';
    } else if (process.platform === 'darwin') {
      return 'PingFang SC';
    } else {
      return 'Noto Sans CJK SC';
    }
  }

  /**
   * 清理所有临时文件
   */
  cleanupAll(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          const filePath = path.join(this.tempDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch {
            // 忽略删除失败
          }
        }
      }
    } catch (e) {
      console.warn('Failed to cleanup temp directory:', e);
    }
  }
}

// 导出单例
export const ghostscriptService = new GhostscriptService();
