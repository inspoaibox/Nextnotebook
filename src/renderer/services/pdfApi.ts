/**
 * pdfApi - PDF 处理 API 服务
 * 渲染进程通过 IPC 与主进程通信
 */

// ============ 类型定义 ============

export interface PDFInfo {
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  isEncrypted: boolean;
  hasFormFields: boolean;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
}

export interface MergeOptions {
  files: ArrayBuffer[];
  pageSelections?: { fileIndex: number; pages: number[] }[];
}

export interface SplitOptions {
  file: ArrayBuffer;
  ranges: string;  // e.g., "1-3;5;7-10" (分号分隔多个输出文件)
}

export interface ToImageOptions {
  file: ArrayBuffer;
  pages?: number[];
  format: 'png' | 'jpg';
  dpi: number;
}

export interface CompressOptions {
  file: ArrayBuffer;
  level: 'low' | 'medium' | 'high';
}

export interface CompressResult {
  data: ArrayBuffer;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

export interface WatermarkOptions {
  file: ArrayBuffer;
  type: 'text' | 'image';
  text?: string;
  imageData?: ArrayBuffer;
  fontSize?: number;
  color?: string;
  opacity: number;
  rotation: number;
  position: 'center' | 'tile' | { x: number; y: number };
  pages?: number[];
}

export interface RotateOptions {
  file: ArrayBuffer;
  pages: number[];
  angle: 90 | -90 | 180;
}

export interface ReorderOptions {
  file: ArrayBuffer;
  newOrder: number[];
}

export interface DeletePagesOptions {
  file: ArrayBuffer;
  pages: number[];
}

export interface ExtractPagesOptions {
  file: ArrayBuffer;
  pages: number[];
}

export interface SecurityOptions {
  file: ArrayBuffer;
  userPassword?: string;
  ownerPassword?: string;
  permissions?: {
    printing: boolean;
    copying: boolean;
    modifying: boolean;
  };
}

export interface MetadataOptions {
  file: ArrayBuffer;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export interface ImageToPdfOptions {
  images: ArrayBuffer[];
  pageSize: 'fit' | 'a4' | 'letter';
  placement: 'center' | 'stretch' | 'fit';
}

export interface FormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'button';
  value: any;
  options?: string[];
  page: number;
  rect: { x: number; y: number; width: number; height: number };
}

export interface GhostscriptStatus {
  available: boolean;
  path: string | null;
}

export interface ConvertResult {
  data: ArrayBuffer;
  originalSize: number;
  convertedSize: number;
}

// ============ 辅助函数 ============

/**
 * ArrayBuffer 转 Base64
 * 注意：此函数不会修改原始 buffer，只是读取数据
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // 创建 Uint8Array 视图来读取数据，不会 detach 原始 buffer
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
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============ API 定义 ============

// 获取 electronAPI
const getElectronAPI = () => (window as any).electronAPI;

export const pdfApi = {
  /**
   * 获取 PDF 信息
   */
  async getInfo(file: ArrayBuffer): Promise<PDFInfo> {
    const api = getElectronAPI();
    const base64 = arrayBufferToBase64(file);
    return await api.pdf.getInfo(base64);
  },

  /**
   * 合并 PDF
   */
  async merge(options: MergeOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const filesBase64 = options.files.map(f => arrayBufferToBase64(f));
    const result = await api.pdf.merge({
      files: filesBase64,
      pageSelections: options.pageSelections,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 拆分 PDF
   */
  async split(options: SplitOptions): Promise<ArrayBuffer[]> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const results = await api.pdf.split({
      file: fileBase64,
      ranges: options.ranges,
    });
    return results.map((r: string) => base64ToArrayBuffer(r));
  },

  /**
   * PDF 转图片
   */
  async toImage(options: ToImageOptions): Promise<ArrayBuffer[]> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const results = await api.pdf.toImage({
      file: fileBase64,
      pages: options.pages,
      format: options.format,
      dpi: options.dpi,
    });
    return results.map((r: string) => base64ToArrayBuffer(r));
  },

  /**
   * 压缩 PDF
   */
  async compress(options: CompressOptions): Promise<CompressResult> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const result = await api.pdf.compress({
      file: fileBase64,
      level: options.level,
    });
    return {
      data: base64ToArrayBuffer(result.data),
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      ratio: result.ratio,
    };
  },

  /**
   * 添加水印
   */
  async addWatermark(options: WatermarkOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const imageBase64 = options.imageData ? arrayBufferToBase64(options.imageData) : undefined;
    const result = await api.pdf.addWatermark({
      file: fileBase64,
      type: options.type,
      text: options.text,
      imageData: imageBase64,
      fontSize: options.fontSize,
      color: options.color,
      opacity: options.opacity,
      rotation: options.rotation,
      position: options.position,
      pages: options.pages,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 旋转页面
   */
  async rotate(options: RotateOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const result = await api.pdf.rotate({
      file: fileBase64,
      pages: options.pages,
      angle: options.angle,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 重排页面
   */
  async reorder(options: ReorderOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const result = await api.pdf.reorder({
      file: fileBase64,
      newOrder: options.newOrder,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 删除页面
   */
  async deletePages(options: DeletePagesOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const result = await api.pdf.deletePages({
      file: fileBase64,
      pages: options.pages,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 提取页面
   */
  async extractPages(options: ExtractPagesOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const result = await api.pdf.extractPages({
      file: fileBase64,
      pages: options.pages,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 设置安全选项
   */
  async setSecurity(options: SecurityOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const result = await api.pdf.setSecurity({
      file: fileBase64,
      userPassword: options.userPassword,
      ownerPassword: options.ownerPassword,
      permissions: options.permissions,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 移除安全选项
   */
  async removeSecurity(file: ArrayBuffer, password: string): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(file);
    const result = await api.pdf.removeSecurity(fileBase64, password);
    return base64ToArrayBuffer(result);
  },

  /**
   * 获取元数据
   */
  async getMetadata(file: ArrayBuffer): Promise<PDFMetadata> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(file);
    return await api.pdf.getMetadata(fileBase64);
  },

  /**
   * 设置元数据
   */
  async setMetadata(options: MetadataOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(options.file);
    const result = await api.pdf.setMetadata({
      file: fileBase64,
      title: options.title,
      author: options.author,
      subject: options.subject,
      keywords: options.keywords,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 图片转 PDF
   */
  async imagesToPdf(options: ImageToPdfOptions): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const imagesBase64 = options.images.map(img => arrayBufferToBase64(img));
    const result = await api.pdf.imagesToPdf({
      images: imagesBase64,
      pageSize: options.pageSize,
      placement: options.placement,
    });
    return base64ToArrayBuffer(result);
  },

  /**
   * 获取表单字段
   */
  async getFormFields(file: ArrayBuffer): Promise<FormField[]> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(file);
    return await api.pdf.getFormFields(fileBase64);
  },

  /**
   * 填写表单
   */
  async fillForm(file: ArrayBuffer, values: Record<string, any>): Promise<ArrayBuffer> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(file);
    const result = await api.pdf.fillForm(fileBase64, values);
    return base64ToArrayBuffer(result);
  },

  /**
   * 检查 Ghostscript 可用性
   */
  async checkGhostscript(): Promise<GhostscriptStatus> {
    const api = getElectronAPI();
    return await api.pdf.checkGhostscript();
  },

  /**
   * PDF 转灰度
   */
  async toGrayscale(file: ArrayBuffer): Promise<ConvertResult> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(file);
    const result = await api.pdf.toGrayscale(fileBase64);
    return {
      data: base64ToArrayBuffer(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  },

  /**
   * PDF/A 转换
   */
  async toPDFA(options: { file: ArrayBuffer; level: '1b' | '2b' | '3b' }): Promise<ConvertResult> {
    const api = getElectronAPI();
    const result = await api.pdf.toPDFA({
      file: arrayBufferToBase64(options.file),
      level: options.level,
    });
    return {
      data: base64ToArrayBuffer(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  },

  /**
   * PDF 修复
   */
  async repair(file: ArrayBuffer): Promise<ConvertResult> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(file);
    const result = await api.pdf.repair(fileBase64);
    return {
      data: base64ToArrayBuffer(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  },

  /**
   * PDF 版本转换
   */
  async convertVersion(options: { file: ArrayBuffer; version: '1.4' | '1.5' | '1.6' | '1.7' | '2.0' }): Promise<ConvertResult> {
    const api = getElectronAPI();
    const result = await api.pdf.convertVersion({
      file: arrayBufferToBase64(options.file),
      version: options.version,
    });
    return {
      data: base64ToArrayBuffer(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  },

  /**
   * PDF 线性化（Web 优化）
   */
  async linearize(file: ArrayBuffer): Promise<ConvertResult> {
    const api = getElectronAPI();
    const fileBase64 = arrayBufferToBase64(file);
    const result = await api.pdf.linearize(fileBase64);
    return {
      data: base64ToArrayBuffer(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  },

  /**
   * 保存 PDF 文件
   */
  async saveFile(buffer: ArrayBuffer, defaultName: string): Promise<boolean> {
    const api = getElectronAPI();
    const base64 = arrayBufferToBase64(buffer);
    return await api.pdf.saveFile(base64, defaultName);
  },
};

export default pdfApi;
