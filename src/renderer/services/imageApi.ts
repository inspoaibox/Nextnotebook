/**
 * Image API - 渲染进程图片处理接口
 */

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
    input: string;
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
  buffer: string;
  info: {
    format: string;
    width: number;
    height: number;
    size: number;
  };
}

// ============ API 函数 ============

/**
 * 从 File 对象读取为 Base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data URL 前缀
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Base64 转 Data URL
 */
export function base64ToDataUrl(base64: string, format: string = 'png'): string {
  const mimeType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : `image/${format}`;
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 计算压缩率
 */
export function calculateCompressionRatio(original: number, compressed: number): string {
  const ratio = ((original - compressed) / original * 100).toFixed(1);
  return `${ratio}%`;
}

// ============ Image API ============

export const imageApi = {
  /**
   * 获取图片元数据
   */
  getMetadata: async (input: string): Promise<ImageMetadata> => {
    return window.electronAPI.image.getMetadata(input);
  },

  /**
   * 处理图片
   */
  process: async (input: string, options: ProcessOptions): Promise<ProcessResult> => {
    return window.electronAPI.image.process(input, options);
  },

  /**
   * 生成预览缩略图
   */
  generatePreview: async (input: string, maxSize: number = 800): Promise<string> => {
    return window.electronAPI.image.generatePreview(input, maxSize);
  },

  /**
   * 保存文件（触发系统保存对话框）
   */
  saveFile: async (buffer: string, defaultName: string): Promise<boolean> => {
    return window.electronAPI.image.saveFile(buffer, defaultName);
  },
};

export default imageApi;
