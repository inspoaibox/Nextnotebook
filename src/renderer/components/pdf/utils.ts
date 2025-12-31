/**
 * PDF 工具共享工具函数
 */

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * 解析页面范围字符串，如 "1-3,5,7-10"
 */
export function parsePageRanges(rangeStr: string, totalPages: number): number[] {
  const pages: Set<number> = new Set();
  const parts = rangeStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      
      if (!isNaN(start) && !isNaN(end)) {
        const rangeStart = Math.min(start, end);
        const rangeEnd = Math.max(start, end);
        for (let i = Math.max(1, rangeStart); i <= Math.min(rangeEnd, totalPages); i++) {
          pages.add(i);
        }
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        pages.add(page);
      }
    }
  }
  
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * 验证 PDF 文件头
 */
export function validatePdfHeader(arrayBuffer: ArrayBuffer): boolean {
  const header = new Uint8Array(arrayBuffer.slice(0, 5));
  const pdfHeader = String.fromCharCode(...header);
  return pdfHeader.startsWith('%PDF-');
}

/**
 * ArrayBuffer 转 Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 转 ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 下载文件
 */
export function downloadFile(data: ArrayBuffer | Blob, filename: string, mimeType: string = 'application/pdf'): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 批量下载文件（使用延迟避免浏览器阻止）
 */
export async function downloadFilesSequentially(
  files: { data: ArrayBuffer | Blob; filename: string; mimeType?: string }[],
  delayMs: number = 200
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const { data, filename, mimeType } = files[i];
    downloadFile(data, filename, mimeType);
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Data URL 转 Blob
 */
export function dataURLtoBlob(dataURL: string): Blob {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
