/**
 * ImageService - 图片处理服务
 * 使用 Sharp 库在主进程中处理图片
 */

import sharp from 'sharp';

// ============ 类型定义 ============

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  space: string;
  channels: number;
  depth: string;
  density?: number;
  hasAlpha: boolean;
  size: number;
  exif?: Record<string, any>;
  icc?: {
    name: string;
    description?: string;
  };
}

export interface ProcessOptions {
  // 格式转换
  format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff';
  quality?: number;
  compressionLevel?: number;
  lossless?: boolean;
  progressive?: boolean;
  mozjpeg?: boolean;
  effort?: number;
  
  // 尺寸调整
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    position?: string;
    background?: string;
    withoutEnlargement?: boolean;
  };
  
  // 扩展/裁边
  extend?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    background?: string;
  };
  trim?: boolean | { threshold?: number };
  
  // 裁剪
  extract?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  
  // 旋转/翻转
  rotate?: number;
  rotateBackground?: string;
  flip?: boolean;
  flop?: boolean;
  
  // 颜色处理
  grayscale?: boolean;
  tint?: string;
  modulate?: {
    brightness?: number;
    saturation?: number;
    hue?: number;
  };
  
  // 滤镜
  blur?: number;
  sharpen?: {
    sigma?: number;
    flat?: number;
    jagged?: number;
  };
  median?: number;
  gamma?: number | number[];
  negate?: boolean;
  normalise?: boolean;
  
  // 合成
  composite?: Array<{
    input: string; // Base64
    gravity?: string;
    top?: number;
    left?: number;
    blend?: string;
    opacity?: number;
  }>;
  
  // 文字水印
  textWatermark?: {
    text: string;
    font?: string;
    fontSize?: number;
    color?: string;
    opacity?: number;
    gravity?: string;
    offsetX?: number;
    offsetY?: number;
    rotate?: number;
    // 平铺选项
    tile?: boolean;
    tileSpacingX?: number;
    tileSpacingY?: number;
  };
  
  // 元数据
  withMetadata?: boolean;
  stripMetadata?: boolean;
}

export interface ProcessResult {
  buffer: string; // Base64
  info: {
    format: string;
    width: number;
    height: number;
    size: number;
  };
}

// ============ ImageService 类 ============

export class ImageService {
  /**
   * 获取图片元数据
   */
  async getMetadata(input: string): Promise<ImageMetadata> {
    const buffer = this.decodeBase64(input);
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const stats = await image.stats();
    
    const result: ImageMetadata = {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      space: metadata.space || 'unknown',
      channels: metadata.channels || 0,
      depth: metadata.depth || 'unknown',
      density: metadata.density,
      hasAlpha: metadata.hasAlpha || false,
      size: buffer.length,
    };
    
    // 提取 EXIF 数据
    if (metadata.exif) {
      try {
        result.exif = this.parseExif(metadata.exif);
      } catch (e) {
        // EXIF 解析失败，忽略
      }
    }
    
    // 提取 ICC 配置文件
    if (metadata.icc) {
      try {
        result.icc = this.parseIcc(metadata.icc);
      } catch (e) {
        // ICC 解析失败，忽略
      }
    }
    
    return result;
  }

  /**
   * 处理图片
   */
  async process(input: string, options: ProcessOptions): Promise<ProcessResult> {
    const buffer = this.decodeBase64(input);
    let image = sharp(buffer);
    
    // 应用处理选项
    image = await this.applyOptions(image, options);
    
    // 输出格式
    const outputFormat = options.format || 'png';
    image = this.applyFormat(image, outputFormat, options);
    
    // 元数据处理
    if (options.stripMetadata) {
      image = image.withMetadata({ orientation: undefined });
    } else if (options.withMetadata) {
      image = image.withMetadata();
    }
    
    // 执行处理
    const { data, info } = await image.toBuffer({ resolveWithObject: true });
    
    return {
      buffer: data.toString('base64'),
      info: {
        format: info.format,
        width: info.width,
        height: info.height,
        size: data.length,
      },
    };
  }

  /**
   * 生成预览缩略图
   */
  async generatePreview(input: string, maxSize: number = 800): Promise<string> {
    const buffer = this.decodeBase64(input);
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // 计算缩放尺寸
    const width = metadata.width || maxSize;
    const height = metadata.height || maxSize;
    const scale = Math.min(maxSize / width, maxSize / height, 1);
    
    const result = await image
      .resize({
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    
    return result.toString('base64');
  }

  // ============ 私有方法 ============

  private decodeBase64(input: string): Buffer {
    // 移除 data URL 前缀（如果有）
    const base64Data = input.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }

  private async applyOptions(image: sharp.Sharp, options: ProcessOptions): Promise<sharp.Sharp> {
    // 旋转（需要在其他操作之前）
    if (options.rotate !== undefined) {
      const background = options.rotateBackground || '#ffffff';
      image = image.rotate(options.rotate, { background });
    }
    
    // 翻转
    if (options.flip) {
      image = image.flip();
    }
    if (options.flop) {
      image = image.flop();
    }
    
    // 尺寸调整
    if (options.resize) {
      const resizeOptions: sharp.ResizeOptions = {
        width: options.resize.width,
        height: options.resize.height,
        fit: options.resize.fit || 'cover',
        withoutEnlargement: options.resize.withoutEnlargement,
      };
      if (options.resize.background) {
        resizeOptions.background = options.resize.background;
      }
      if (options.resize.position) {
        resizeOptions.position = options.resize.position as any;
      }
      image = image.resize(resizeOptions);
    }
    
    // 扩展
    if (options.extend) {
      image = image.extend({
        top: options.extend.top || 0,
        bottom: options.extend.bottom || 0,
        left: options.extend.left || 0,
        right: options.extend.right || 0,
        background: options.extend.background || '#ffffff',
      });
    }
    
    // 裁边
    if (options.trim) {
      const trimOptions = typeof options.trim === 'object' ? options.trim : {};
      if (trimOptions.threshold !== undefined) {
        image = image.trim({ threshold: trimOptions.threshold });
      } else {
        image = image.trim();
      }
    }
    
    // 裁剪
    if (options.extract) {
      image = image.extract(options.extract);
    }
    
    // 颜色处理
    if (options.grayscale) {
      image = image.grayscale();
    }
    
    if (options.tint) {
      image = image.tint(options.tint);
    }
    
    if (options.modulate) {
      image = image.modulate({
        brightness: options.modulate.brightness,
        saturation: options.modulate.saturation,
        hue: options.modulate.hue,
      });
    }
    
    // 滤镜
    if (options.blur && options.blur > 0) {
      image = image.blur(options.blur);
    }
    
    if (options.sharpen) {
      image = image.sharpen(
        options.sharpen.sigma,
        options.sharpen.flat,
        options.sharpen.jagged
      );
    }
    
    if (options.median && options.median > 0) {
      image = image.median(options.median);
    }
    
    if (options.gamma) {
      const gammaValue = Array.isArray(options.gamma) ? options.gamma : [options.gamma];
      image = image.gamma(...gammaValue);
    }
    
    if (options.negate) {
      image = image.negate();
    }
    
    if (options.normalise) {
      image = image.normalise();
    }
    
    // 合成
    if (options.composite && options.composite.length > 0) {
      const compositeInputs = options.composite.map(item => {
        const inputBuffer = this.decodeBase64(item.input);
        return {
          input: inputBuffer,
          gravity: item.gravity as any,
          top: item.top,
          left: item.left,
          blend: item.blend as any,
        };
      });
      image = image.composite(compositeInputs);
    }
    
    // 文字水印
    if (options.textWatermark) {
      const metadata = await image.metadata();
      const imageWidth = metadata.width || 800;
      const imageHeight = metadata.height || 600;
      
      const textWatermarkBuffer = await this.createTextWatermark(
        options.textWatermark,
        imageWidth,
        imageHeight
      );
      
      image = image.composite([{
        input: textWatermarkBuffer,
        gravity: options.textWatermark.gravity as any || 'southeast',
        top: options.textWatermark.offsetY,
        left: options.textWatermark.offsetX,
      }]);
    }
    
    return image;
  }

  private applyFormat(image: sharp.Sharp, format: string, options: ProcessOptions): sharp.Sharp {
    switch (format) {
      case 'jpeg':
        return image.jpeg({
          quality: options.quality || 80,
          progressive: options.progressive || false,
          mozjpeg: options.mozjpeg || false,
        });
      
      case 'png':
        return image.png({
          compressionLevel: options.compressionLevel ?? 6,
          progressive: options.progressive || false,
        });
      
      case 'webp':
        return image.webp({
          quality: options.quality || 80,
          lossless: options.lossless || false,
          effort: options.effort ?? 4,
        });
      
      case 'avif':
        return image.avif({
          quality: options.quality || 50,
          lossless: options.lossless || false,
          effort: options.effort ?? 4,
        });
      
      case 'gif':
        return image.gif();
      
      case 'tiff':
        return image.tiff({
          quality: options.quality || 80,
          compression: 'lzw',
        });
      
      default:
        return image.png();
    }
  }

  private parseExif(exifBuffer: Buffer): Record<string, any> {
    // 简单的 EXIF 解析，返回原始数据
    // 实际项目中可以使用 exif-reader 库进行更详细的解析
    try {
      const exifReader = require('exif-reader');
      return exifReader(exifBuffer);
    } catch (e) {
      // 如果没有 exif-reader，返回空对象
      return {};
    }
  }

  private parseIcc(iccBuffer: Buffer): { name: string; description?: string } {
    // 简单的 ICC 解析
    // ICC 配置文件的描述通常在固定位置
    try {
      // 尝试提取 ICC 配置文件名称
      const name = iccBuffer.toString('utf8', 48, 80).replace(/\0/g, '').trim() || 'Unknown';
      return { name };
    } catch (e) {
      return { name: 'Unknown' };
    }
  }

  /**
   * 创建文字水印 SVG
   */
  private async createTextWatermark(
    options: NonNullable<ProcessOptions['textWatermark']>,
    imageWidth: number,
    imageHeight: number
  ): Promise<Buffer> {
    const {
      text,
      font = 'Microsoft YaHei, SimHei, Arial, sans-serif', // 支持中文字体
      fontSize = 24,
      color = '#ffffff',
      opacity = 0.5,
      rotate = 0,
      tile = false,
      tileSpacingX = 100,
      tileSpacingY = 80,
    } = options;

    // 解析颜色 - 支持多种格式
    let r = 255, g = 255, b = 255;
    const colorStr = color.trim();
    
    if (colorStr.startsWith('#')) {
      // 处理 #RGB 或 #RRGGBB 格式
      const hex = colorStr.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length >= 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      }
    } else if (colorStr.startsWith('rgb')) {
      // 处理 rgb(r, g, b) 格式
      const match = colorStr.match(/\d+/g);
      if (match && match.length >= 3) {
        r = parseInt(match[0], 10);
        g = parseInt(match[1], 10);
        b = parseInt(match[2], 10);
      }
    }
    
    // 确保值在有效范围内
    r = Math.max(0, Math.min(255, isNaN(r) ? 255 : r));
    g = Math.max(0, Math.min(255, isNaN(g) ? 255 : g));
    b = Math.max(0, Math.min(255, isNaN(b) ? 255 : b));
    const a = Math.max(0, Math.min(1, opacity));

    // 处理多行文本
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.4; // 增加行高以适应中文
    const textHeight = lines.length * lineHeight;
    
    // 估算文本宽度（中文字符约等于 fontSize，英文约 0.6 * fontSize）
    const maxLineWidth = Math.max(...lines.map(line => {
      let width = 0;
      for (const char of line) {
        // 判断是否为中文字符
        if (/[\u4e00-\u9fa5]/.test(char)) {
          width += fontSize; // 中文字符宽度约等于字体大小
        } else {
          width += fontSize * 0.6; // 英文字符宽度约为字体大小的 0.6
        }
      }
      return width;
    }));
    
    const padding = 20;

    if (tile) {
      // 平铺模式：创建覆盖整个图片的水印
      const singleWatermarkWidth = maxLineWidth + tileSpacingX;
      const singleWatermarkHeight = textHeight + tileSpacingY;
      
      // 计算需要多少个水印来覆盖整个图片（考虑旋转后的扩展）
      const diagonal = Math.sqrt(imageWidth * imageWidth + imageHeight * imageHeight);
      const cols = Math.ceil(diagonal / singleWatermarkWidth) + 2;
      const rows = Math.ceil(diagonal / singleWatermarkHeight) + 2;
      
      // 生成平铺的水印
      const watermarks: string[] = [];
      const startX = -singleWatermarkWidth;
      const startY = -singleWatermarkHeight;
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = startX + col * singleWatermarkWidth;
          const y = startY + row * singleWatermarkHeight;
          
          // 生成单个水印的文本行
          const textLines = lines.map((line, index) => {
            const textY = y + fontSize + index * lineHeight;
            return `<text x="${x}" y="${textY}" font-family="${font}" font-size="${fontSize}" fill="rgba(${r},${g},${b},${a})">${this.escapeXml(line)}</text>`;
          }).join('\n');
          
          watermarks.push(textLines);
        }
      }

      // 创建覆盖整个图片的 SVG
      const svg = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(${rotate}, ${imageWidth / 2}, ${imageHeight / 2})">
    ${watermarks.join('\n    ')}
  </g>
</svg>`;

      return Buffer.from(svg);
    } else {
      // 单个水印模式 - 需要考虑旋转后的尺寸
      const baseWidth = maxLineWidth + padding * 2;
      const baseHeight = textHeight + padding * 2;
      
      // 计算旋转后需要的尺寸（使用对角线长度确保不被裁剪）
      const radians = Math.abs(rotate) * Math.PI / 180;
      const rotatedWidth = Math.ceil(baseWidth * Math.cos(radians) + baseHeight * Math.sin(radians));
      const rotatedHeight = Math.ceil(baseWidth * Math.sin(radians) + baseHeight * Math.cos(radians));
      
      // SVG 尺寸取旋转后的最大值
      const svgWidth = Math.max(baseWidth, rotatedWidth) + padding * 2;
      const svgHeight = Math.max(baseHeight, rotatedHeight) + padding * 2;
      
      // 文本起始位置（居中）
      const textStartX = (svgWidth - maxLineWidth) / 2;
      const textStartY = (svgHeight - textHeight) / 2;

      // 生成文本行
      const textLines = lines.map((line, index) => {
        const y = textStartY + fontSize + index * lineHeight;
        return `<text x="${textStartX}" y="${y}" font-family="${font}" font-size="${fontSize}" fill="rgba(${r},${g},${b},${a})">${this.escapeXml(line)}</text>`;
      }).join('\n    ');

      // 创建 SVG - 围绕中心点旋转
      const svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(${rotate}, ${svgWidth / 2}, ${svgHeight / 2})">
    ${textLines}
  </g>
</svg>`;

      return Buffer.from(svg);
    }
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
}

// 导出单例
export const imageService = new ImageService();
