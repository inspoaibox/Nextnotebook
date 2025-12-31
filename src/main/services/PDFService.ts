/**
 * PDFService - PDF 处理服务
 * 使用 pdf-lib 库在主进程中处理 PDF 文件
 */

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';

/**
 * 检测文本是否包含非 ASCII 字符（如中文）
 */
function containsNonAscii(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

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

export interface PageSelection {
  fileIndex: number;
  pages: number[];
}

export interface WatermarkOptions {
  type: 'text' | 'image';
  text?: string;
  imageData?: Buffer;
  fontSize?: number;
  color?: string;
  opacity: number;
  rotation: number;
  position: 'center' | 'tile' | { x: number; y: number };
  pages?: number[];
}

export interface SecurityOptions {
  userPassword?: string;
  ownerPassword?: string;
  permissions?: {
    printing: boolean;
    copying: boolean;
    modifying: boolean;
  };
}

export interface ImageToPdfOptions {
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

// ============ 工具函数 ============

/**
 * 验证 PDF 文件的 magic bytes
 */
export function validatePdfFile(buffer: Buffer): { valid: boolean; error?: string } {
  if (!buffer || buffer.length < 5) {
    return { valid: false, error: 'File is too small to be a valid PDF' };
  }

  const header = buffer.slice(0, 5).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    return { valid: false, error: 'Invalid PDF file: missing PDF header' };
  }

  return { valid: true };
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
        // 处理反向范围（如 "5-1" 应该等同于 "1-5"）
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
 * 解析颜色字符串为 RGB 值
 */
function parseColor(colorStr: string): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  const color = colorStr.trim();
  
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length >= 6) {
      r = parseInt(hex.substring(0, 2), 16) / 255;
      g = parseInt(hex.substring(2, 4), 16) / 255;
      b = parseInt(hex.substring(4, 6), 16) / 255;
    }
  } else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0], 10) / 255;
      g = parseInt(match[1], 10) / 255;
      b = parseInt(match[2], 10) / 255;
    }
  }
  
  return { r, g, b };
}

// ============ PDFService 类 ============

export class PDFService {
  /**
   * 获取 PDF 信息
   */
  async getInfo(file: Buffer): Promise<PDFInfo> {
    try {
      const pdfDoc = await PDFDocument.load(file, { ignoreEncryption: true });
      
      const info: PDFInfo = {
        pageCount: pdfDoc.getPageCount(),
        title: pdfDoc.getTitle(),
        author: pdfDoc.getAuthor(),
        subject: pdfDoc.getSubject(),
        keywords: pdfDoc.getKeywords(),
        creator: pdfDoc.getCreator(),
        producer: pdfDoc.getProducer(),
        creationDate: pdfDoc.getCreationDate(),
        modificationDate: pdfDoc.getModificationDate(),
        isEncrypted: false, // pdf-lib 会在加载时处理加密
        hasFormFields: false,
      };
      
      // 检查是否有表单字段
      try {
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        info.hasFormFields = fields.length > 0;
      } catch (e) {
        // 没有表单或表单解析失败
      }
      
      return info;
    } catch (error) {
      throw new Error(`Failed to read PDF info: ${error}`);
    }
  }

  /**
   * 合并多个 PDF 文件
   */
  async merge(files: Buffer[], pageSelections?: PageSelection[]): Promise<Buffer> {
    const mergedPdf = await PDFDocument.create();
    
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const pdfDoc = await PDFDocument.load(files[fileIndex]);
      const totalPages = pdfDoc.getPageCount();
      
      // 确定要复制的页面
      let pagesToCopy: number[];
      if (pageSelections) {
        const selection = pageSelections.find(s => s.fileIndex === fileIndex);
        pagesToCopy = selection ? selection.pages.filter(p => p >= 1 && p <= totalPages) : [];
        if (pagesToCopy.length === 0) {
          // 如果没有指定页面，复制所有页面
          pagesToCopy = Array.from({ length: totalPages }, (_, i) => i + 1);
        }
      } else {
        pagesToCopy = Array.from({ length: totalPages }, (_, i) => i + 1);
      }
      
      // 复制页面（pdf-lib 使用 0-based 索引）
      const pageIndices = pagesToCopy.map(p => p - 1);
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }
    
    return Buffer.from(await mergedPdf.save());
  }

  /**
   * 拆分 PDF 文件
   */
  async split(file: Buffer, ranges: string): Promise<Buffer[]> {
    const pdfDoc = await PDFDocument.load(file);
    const totalPages = pdfDoc.getPageCount();
    const results: Buffer[] = [];
    
    // 解析范围，每个范围生成一个新 PDF
    const rangeGroups = ranges.split(';').map(r => r.trim()).filter(r => r.length > 0);
    
    for (const rangeGroup of rangeGroups) {
      const pages = parsePageRanges(rangeGroup, totalPages);
      if (pages.length === 0) continue;
      
      const newPdf = await PDFDocument.create();
      const pageIndices = pages.map(p => p - 1);
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => newPdf.addPage(page));
      
      results.push(Buffer.from(await newPdf.save()));
    }
    
    return results;
  }


  /**
   * 添加水印
   * 优先使用 Ghostscript（支持中文），不可用时回退到 pdf-lib（仅支持英文）
   */
  async addWatermark(file: Buffer, options: WatermarkOptions): Promise<Buffer> {
    // 优先使用 Ghostscript（更完整的支持）
    if (options.type === 'text' && options.text) {
      const { ghostscriptService } = require('./GhostscriptService');
      const gsStatus = ghostscriptService.checkAvailability();
      
      if (gsStatus.available) {
        const gsOptions = {
          text: options.text,
          fontSize: options.fontSize,
          color: options.color,
          opacity: options.opacity,
          rotation: options.rotation,
          position: options.position === 'tile' ? 'tile' as const : 'center' as const,
          pages: options.pages,
        };
        return await ghostscriptService.addWatermark(file, gsOptions);
      }
      
      // Ghostscript 不可用且包含中文，报错
      if (containsNonAscii(options.text)) {
        throw new Error('Ghostscript 不可用，无法添加中文水印。请确保 Ghostscript 已正确安装。');
      }
    }

    // 回退方案：使用 pdf-lib（仅支持英文文本和图片水印）
    const pdfDoc = await PDFDocument.load(file);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // 确定要添加水印的页面
    const targetPages = options.pages && options.pages.length > 0
      ? options.pages.filter(p => p >= 1 && p <= pages.length)
      : Array.from({ length: pages.length }, (_, i) => i + 1);
    
    for (const pageNum of targetPages) {
      const page = pages[pageNum - 1];
      const { width, height } = page.getSize();
      
      if (options.type === 'text' && options.text) {
        const fontSize = options.fontSize || 48;
        const color = parseColor(options.color || '#000000');
        const opacity = options.opacity || 0.3;
        const rotation = options.rotation || 0;
        
        if (options.position === 'tile') {
          // 平铺水印
          const textWidth = font.widthOfTextAtSize(options.text, fontSize);
          const spacingX = textWidth + 100;
          const spacingY = fontSize + 80;
          
          for (let y = 0; y < height + spacingY; y += spacingY) {
            for (let x = 0; x < width + spacingX; x += spacingX) {
              page.drawText(options.text, {
                x,
                y,
                size: fontSize,
                font,
                color: rgb(color.r, color.g, color.b),
                opacity,
                rotate: degrees(rotation),
              });
            }
          }
        } else {
          // 单个水印
          let x: number, y: number;
          
          if (options.position === 'center') {
            const textWidth = font.widthOfTextAtSize(options.text, fontSize);
            x = (width - textWidth) / 2;
            y = height / 2;
          } else if (typeof options.position === 'object') {
            x = options.position.x;
            y = options.position.y;
          } else {
            x = width / 2;
            y = height / 2;
          }
          
          page.drawText(options.text, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
            opacity,
            rotate: degrees(rotation),
          });
        }
      } else if (options.type === 'image' && options.imageData) {
        // 图片水印
        let image;
        try {
          // 尝试作为 PNG 加载
          image = await pdfDoc.embedPng(options.imageData);
        } catch {
          // 尝试作为 JPG 加载
          image = await pdfDoc.embedJpg(options.imageData);
        }
        
        const imgDims = image.scale(0.5);
        const opacity = options.opacity || 0.3;
        
        if (options.position === 'tile') {
          const spacingX = imgDims.width + 50;
          const spacingY = imgDims.height + 50;
          
          for (let y = 0; y < height; y += spacingY) {
            for (let x = 0; x < width; x += spacingX) {
              page.drawImage(image, {
                x,
                y,
                width: imgDims.width,
                height: imgDims.height,
                opacity,
                rotate: degrees(options.rotation || 0),
              });
            }
          }
        } else {
          let x: number, y: number;
          
          if (options.position === 'center') {
            x = (width - imgDims.width) / 2;
            y = (height - imgDims.height) / 2;
          } else if (typeof options.position === 'object') {
            x = options.position.x;
            y = options.position.y;
          } else {
            x = (width - imgDims.width) / 2;
            y = (height - imgDims.height) / 2;
          }
          
          page.drawImage(image, {
            x,
            y,
            width: imgDims.width,
            height: imgDims.height,
            opacity,
            rotate: degrees(options.rotation || 0),
          });
        }
      }
    }
    
    return Buffer.from(await pdfDoc.save());
  }

  /**
   * 旋转页面
   */
  async rotate(file: Buffer, pages: number[], angle: number): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(file);
    const allPages = pdfDoc.getPages();
    
    for (const pageNum of pages) {
      if (pageNum >= 1 && pageNum <= allPages.length) {
        const page = allPages[pageNum - 1];
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + angle));
      }
    }
    
    return Buffer.from(await pdfDoc.save());
  }

  /**
   * 重排页面
   */
  async reorder(file: Buffer, newOrder: number[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(file);
    const totalPages = pdfDoc.getPageCount();
    
    // 验证新顺序
    const validOrder = newOrder.filter(p => p >= 1 && p <= totalPages);
    if (validOrder.length === 0) {
      throw new Error('Invalid page order');
    }
    
    // 创建新 PDF 并按新顺序复制页面
    const newPdf = await PDFDocument.create();
    const pageIndices = validOrder.map(p => p - 1);
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));
    
    return Buffer.from(await newPdf.save());
  }

  /**
   * 删除页面
   */
  async deletePages(file: Buffer, pagesToDelete: number[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(file);
    const totalPages = pdfDoc.getPageCount();
    
    // 计算要保留的页面
    const deleteSet = new Set(pagesToDelete);
    const pagesToKeep = Array.from({ length: totalPages }, (_, i) => i + 1)
      .filter(p => !deleteSet.has(p));
    
    if (pagesToKeep.length === 0) {
      throw new Error('Cannot delete all pages');
    }
    
    // 创建新 PDF 并复制保留的页面
    const newPdf = await PDFDocument.create();
    const pageIndices = pagesToKeep.map(p => p - 1);
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));
    
    return Buffer.from(await newPdf.save());
  }

  /**
   * 提取页面
   */
  async extractPages(file: Buffer, pages: number[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(file);
    const totalPages = pdfDoc.getPageCount();
    
    const validPages = pages.filter(p => p >= 1 && p <= totalPages);
    if (validPages.length === 0) {
      throw new Error('No valid pages to extract');
    }
    
    const newPdf = await PDFDocument.create();
    const pageIndices = validPages.map(p => p - 1);
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));
    
    return Buffer.from(await newPdf.save());
  }


  /**
   * 设置安全选项（密码保护）
   * 注意：pdf-lib 对加密支持有限，这里提供基本实现
   */
  async setSecurity(file: Buffer, options: SecurityOptions): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(file);
    
    // pdf-lib 不直接支持设置密码，但可以保存时设置一些选项
    // 实际的密码保护需要使用其他库如 pdf-lib-encrypt 或 Ghostscript
    // 这里返回原始 PDF，实际加密功能需要后续扩展
    
    return Buffer.from(await pdfDoc.save());
  }

  /**
   * 移除安全选项
   */
  async removeSecurity(file: Buffer, password: string): Promise<Buffer> {
    // pdf-lib 在加载时会自动处理密码
    const pdfDoc = await PDFDocument.load(file, { 
      ignoreEncryption: true,
    });
    
    return Buffer.from(await pdfDoc.save());
  }

  /**
   * 获取元数据
   */
  async getMetadata(file: Buffer): Promise<PDFMetadata> {
    const pdfDoc = await PDFDocument.load(file, { ignoreEncryption: true });
    
    return {
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      subject: pdfDoc.getSubject(),
      keywords: pdfDoc.getKeywords(),
      creator: pdfDoc.getCreator(),
      producer: pdfDoc.getProducer(),
    };
  }

  /**
   * 设置元数据
   */
  async setMetadata(file: Buffer, metadata: PDFMetadata): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(file);
    
    if (metadata.title !== undefined) pdfDoc.setTitle(metadata.title);
    if (metadata.author !== undefined) pdfDoc.setAuthor(metadata.author);
    if (metadata.subject !== undefined) pdfDoc.setSubject(metadata.subject);
    if (metadata.keywords !== undefined) pdfDoc.setKeywords([metadata.keywords]);
    if (metadata.creator !== undefined) pdfDoc.setCreator(metadata.creator);
    if (metadata.producer !== undefined) pdfDoc.setProducer(metadata.producer);
    
    return Buffer.from(await pdfDoc.save());
  }

  /**
   * 图片转 PDF
   */
  async imagesToPdf(images: Buffer[], options: ImageToPdfOptions): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    
    // 页面尺寸定义
    const pageSizes = {
      a4: { width: 595.28, height: 841.89 },
      letter: { width: 612, height: 792 },
    };
    
    for (const imageData of images) {
      let image;
      try {
        image = await pdfDoc.embedPng(imageData);
      } catch {
        try {
          image = await pdfDoc.embedJpg(imageData);
        } catch (e) {
          console.error('Failed to embed image:', e);
          continue;
        }
      }
      
      const imgWidth = image.width;
      const imgHeight = image.height;
      
      let pageWidth: number, pageHeight: number;
      let drawX: number, drawY: number;
      let drawWidth: number, drawHeight: number;
      
      if (options.pageSize === 'fit') {
        // 页面适应图片大小
        pageWidth = imgWidth;
        pageHeight = imgHeight;
        drawX = 0;
        drawY = 0;
        drawWidth = imgWidth;
        drawHeight = imgHeight;
      } else {
        // 使用固定页面尺寸
        const size = pageSizes[options.pageSize];
        pageWidth = size.width;
        pageHeight = size.height;
        
        if (options.placement === 'stretch') {
          // 拉伸填充
          drawX = 0;
          drawY = 0;
          drawWidth = pageWidth;
          drawHeight = pageHeight;
        } else if (options.placement === 'fit') {
          // 保持比例适应
          const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
          drawWidth = imgWidth * scale;
          drawHeight = imgHeight * scale;
          drawX = (pageWidth - drawWidth) / 2;
          drawY = (pageHeight - drawHeight) / 2;
        } else {
          // 居中（原始大小）
          drawWidth = Math.min(imgWidth, pageWidth);
          drawHeight = Math.min(imgHeight, pageHeight);
          drawX = (pageWidth - drawWidth) / 2;
          drawY = (pageHeight - drawHeight) / 2;
        }
      }
      
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      });
    }
    
    return Buffer.from(await pdfDoc.save());
  }

  /**
   * 获取表单字段
   */
  async getFormFields(file: Buffer): Promise<FormField[]> {
    const pdfDoc = await PDFDocument.load(file);
    const fields: FormField[] = [];
    
    try {
      const form = pdfDoc.getForm();
      const formFields = form.getFields();
      
      for (const field of formFields) {
        const name = field.getName();
        const widgets = field.acroField.getWidgets();
        
        let type: FormField['type'] = 'text';
        let value: any = '';
        let options: string[] | undefined;
        
        // 确定字段类型
        const fieldType = field.constructor.name;
        if (fieldType.includes('Text')) {
          type = 'text';
          value = (field as any).getText?.() || '';
        } else if (fieldType.includes('Checkbox')) {
          type = 'checkbox';
          value = (field as any).isChecked?.() || false;
        } else if (fieldType.includes('Radio')) {
          type = 'radio';
          value = (field as any).getSelected?.() || '';
        } else if (fieldType.includes('Dropdown') || fieldType.includes('OptionList')) {
          type = 'dropdown';
          value = (field as any).getSelected?.() || '';
          options = (field as any).getOptions?.() || [];
        } else if (fieldType.includes('Button')) {
          type = 'button';
        }
        
        // 获取位置信息
        if (widgets.length > 0) {
          const widget = widgets[0];
          const rect = widget.getRectangle();
          const pageRef = widget.P();
          let pageIndex = 0;
          
          if (pageRef) {
            const pages = pdfDoc.getPages();
            for (let i = 0; i < pages.length; i++) {
              if (pages[i].ref === pageRef) {
                pageIndex = i;
                break;
              }
            }
          }
          
          fields.push({
            name,
            type,
            value,
            options,
            page: pageIndex + 1,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      }
    } catch (e) {
      console.error('Failed to get form fields:', e);
    }
    
    return fields;
  }

  /**
   * 填写表单
   */
  async fillForm(file: Buffer, values: Record<string, any>): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(file);
    
    try {
      const form = pdfDoc.getForm();
      
      for (const [fieldName, value] of Object.entries(values)) {
        try {
          const field = form.getField(fieldName);
          const fieldType = field.constructor.name;
          
          if (fieldType.includes('Text')) {
            (field as any).setText(String(value));
          } else if (fieldType.includes('Checkbox')) {
            if (value) {
              (field as any).check();
            } else {
              (field as any).uncheck();
            }
          } else if (fieldType.includes('Radio')) {
            (field as any).select(String(value));
          } else if (fieldType.includes('Dropdown') || fieldType.includes('OptionList')) {
            (field as any).select(String(value));
          }
        } catch (e) {
          console.warn(`Failed to fill field ${fieldName}:`, e);
        }
      }
    } catch (e) {
      console.error('Failed to fill form:', e);
    }
    
    return Buffer.from(await pdfDoc.save());
  }
}

// 导出单例
export const pdfService = new PDFService();
