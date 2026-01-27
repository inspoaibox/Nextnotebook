/**
 * 图片处理工具函数
 */

// 支持的图片格式
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

// 最大图片大小（5MB）
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// 最大图片尺寸
export const MAX_IMAGE_DIMENSION = 2048;

/**
 * 验证图片文件
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: '不支持的图片格式，请使用 JPG、PNG、GIF 或 WebP 格式' };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return { valid: false, error: '图片大小超过 5MB，请选择更小的图片' };
  }

  return { valid: true };
}

/**
 * 将文件转换为 base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 压缩图片
 */
export function compressImage(base64: string, maxWidth: number = MAX_IMAGE_DIMENSION, maxHeight: number = MAX_IMAGE_DIMENSION, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // 计算缩放比例
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      // 创建 canvas 进行压缩
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // 转换为 base64
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = reject;
    img.src = base64;
  });
}

/**
 * 从剪贴板获取图片
 */
export async function getImageFromClipboard(event: ClipboardEvent | React.ClipboardEvent): Promise<File | null> {
  const clipboardData = (event as any).clipboardData || (window as any).clipboardData;
  if (!clipboardData) return null;

  // Check for files directly (e.g. copying a file from Explorer)
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file.type.startsWith('image/')) {
        return file;
      }
    }
  }

  // Check items (e.g. screenshot data)
  const items = clipboardData.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        return file;
      }
    }
  }

  return null;
}

/**
 * 获取图片尺寸
 */
export function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = base64;
  });
}
