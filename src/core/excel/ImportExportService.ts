/**
 * Excel 导入导出服务
 * 支持 .xlsx 和 .csv 文件的导入导出
 */

import {
  ExcelNotePayload,
  ExcelSheet,
  ExcelRow,
  ExcelCell,
  CellValue,
  CellStyle,
  createDefaultExcelSheet,
} from '../../shared/types';

// 导入导出错误
export class ImportExportError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ImportExportError';
  }
}

export const ImportExportErrors = {
  INVALID_FORMAT: 'INVALID_FORMAT',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  EXPORT_FAILED: 'EXPORT_FAILED',
} as const;

// 最大文件大小 (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 导入导出服务
 */
export class ImportExportService {
  /**
   * 导入 XLSX 文件
   */
  async importXlsx(file: File): Promise<ExcelNotePayload> {
    if (file.size > MAX_FILE_SIZE) {
      throw new ImportExportError('文件过大，请选择小于 10MB 的文件', ImportExportErrors.FILE_TOO_LARGE);
    }

    try {
      // 动态导入 xlsx 库
      const XLSX = await import('xlsx');
      
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      const sheets: ExcelSheet[] = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const sheet = this.worksheetToExcelSheet(worksheet, sheetName, XLSX);
        sheets.push(sheet);
      }

      if (sheets.length === 0) {
        sheets.push(createDefaultExcelSheet('Sheet1'));
      }

      const title = file.name.replace(/\.(xlsx|xls)$/i, '') || '导入的表格';

      return {
        title,
        description: '',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
        sheets,
        active_sheet_index: 0,
      };
    } catch (error) {
      if (error instanceof ImportExportError) throw error;
      throw new ImportExportError('无法解析 Excel 文件，文件可能已损坏', ImportExportErrors.FILE_CORRUPTED);
    }
  }

  /**
   * 导入 CSV 文件
   */
  async importCsv(file: File): Promise<ExcelNotePayload> {
    if (file.size > MAX_FILE_SIZE) {
      throw new ImportExportError('文件过大，请选择小于 10MB 的文件', ImportExportErrors.FILE_TOO_LARGE);
    }

    try {
      const text = await file.text();
      const sheet = this.csvToExcelSheet(text, 'Sheet1');

      const title = file.name.replace(/\.csv$/i, '') || '导入的表格';

      return {
        title,
        description: '',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
        sheets: [sheet],
        active_sheet_index: 0,
      };
    } catch (error) {
      if (error instanceof ImportExportError) throw error;
      throw new ImportExportError('无法解析 CSV 文件', ImportExportErrors.FILE_CORRUPTED);
    }
  }

  /**
   * 导出为 XLSX
   */
  async exportToXlsx(payload: ExcelNotePayload): Promise<Blob> {
    try {
      const XLSX = await import('xlsx');
      
      const workbook = XLSX.utils.book_new();

      for (const sheet of payload.sheets) {
        const worksheet = this.excelSheetToWorksheet(sheet, XLSX);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      }

      const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } catch (error) {
      throw new ImportExportError('导出失败，请重试', ImportExportErrors.EXPORT_FAILED);
    }
  }

  /**
   * 导出为 CSV
   */
  async exportToCsv(sheet: ExcelSheet): Promise<Blob> {
    try {
      const csv = this.excelSheetToCsv(sheet);
      return new Blob([csv], { type: 'text/csv;charset=utf-8' });
    } catch (error) {
      throw new ImportExportError('导出失败，请重试', ImportExportErrors.EXPORT_FAILED);
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 将 xlsx worksheet 转换为 ExcelSheet
   */
  private worksheetToExcelSheet(worksheet: any, name: string, XLSX: any): ExcelSheet {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const rows: ExcelRow[] = [];
    const columnWidths: number[] = [];
    const rowHeights: number[] = [];

    // 获取列宽
    if (worksheet['!cols']) {
      for (let i = 0; i < worksheet['!cols'].length; i++) {
        const col = worksheet['!cols'][i];
        columnWidths.push(col?.wpx || col?.wch ? col.wch * 8 : 100);
      }
    }

    // 获取行高
    if (worksheet['!rows']) {
      for (let i = 0; i < worksheet['!rows'].length; i++) {
        const row = worksheet['!rows'][i];
        rowHeights.push(row?.hpx || row?.hpt ? row.hpt * 1.33 : 25);
      }
    }

    // 遍历单元格
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: ExcelCell[] = [];

      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[cellAddress];

        if (cell) {
          const value = this.xlsxCellToValue(cell);
          const style = this.xlsxCellToStyle(cell);

          cells.push({
            column_index: c,
            value,
            formula: cell.f ? `=${cell.f}` : null,
            style,
          });
        }
      }

      if (cells.length > 0) {
        rows.push({ row_index: r, cells });
      }
    }

    return {
      id: `sheet-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      name,
      rows,
      column_widths: columnWidths,
      row_heights: rowHeights,
      frozen_rows: 0,
      frozen_columns: 0,
    };
  }

  /**
   * 将 xlsx 单元格值转换为 CellValue
   */
  private xlsxCellToValue(cell: any): CellValue {
    if (cell.t === 'n') return cell.v as number;
    if (cell.t === 'b') return cell.v as boolean;
    if (cell.t === 's' || cell.t === 'str') return cell.v as string;
    if (cell.v !== undefined) return String(cell.v);
    return null;
  }

  /**
   * 将 xlsx 单元格样式转换为 CellStyle
   */
  private xlsxCellToStyle(cell: any): CellStyle | null {
    // xlsx 库的样式信息有限，这里只做基础转换
    if (!cell.s) return null;

    const style = cell.s;
    return {
      font_bold: style.font?.bold || false,
      font_italic: style.font?.italic || false,
      font_color: style.font?.color?.rgb ? `#${style.font.color.rgb}` : null,
      background_color: style.fill?.fgColor?.rgb ? `#${style.fill.fgColor.rgb}` : null,
      text_align: style.alignment?.horizontal || 'left',
      vertical_align: style.alignment?.vertical || 'middle',
      number_format: null,
    };
  }

  /**
   * 将 CSV 文本转换为 ExcelSheet
   */
  private csvToExcelSheet(csv: string, name: string): ExcelSheet {
    const rows: ExcelRow[] = [];
    const lines = this.parseCsvLines(csv);

    lines.forEach((line, rowIndex) => {
      const cells: ExcelCell[] = [];

      line.forEach((value, colIndex) => {
        // 尝试解析为数字
        const numValue = parseFloat(value);
        const cellValue: CellValue = !isNaN(numValue) && value.trim() !== '' ? numValue : value;

        cells.push({
          column_index: colIndex,
          value: cellValue,
          formula: null,
          style: null,
        });
      });

      if (cells.length > 0) {
        rows.push({ row_index: rowIndex, cells });
      }
    });

    return {
      id: `sheet-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      name,
      rows,
      column_widths: [],
      row_heights: [],
      frozen_rows: 0,
      frozen_columns: 0,
    };
  }

  /**
   * 解析 CSV 行（处理引号和逗号）
   */
  private parseCsvLines(csv: string): string[][] {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      const nextChar = csv[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentField += '"';
          i++; // 跳过下一个引号
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentLine.push(currentField);
          currentField = '';
        } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          currentLine.push(currentField);
          lines.push(currentLine);
          currentLine = [];
          currentField = '';
          if (char === '\r') i++; // 跳过 \n
        } else if (char !== '\r') {
          currentField += char;
        }
      }
    }

    // 处理最后一行
    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField);
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * 将 ExcelSheet 转换为 xlsx worksheet
   */
  private excelSheetToWorksheet(sheet: ExcelSheet, XLSX: any): any {
    const data: any[][] = [];

    // 找出最大行列
    let maxRow = 0;
    let maxCol = 0;
    for (const row of sheet.rows) {
      maxRow = Math.max(maxRow, row.row_index);
      for (const cell of row.cells) {
        maxCol = Math.max(maxCol, cell.column_index);
      }
    }

    // 初始化数据数组
    for (let r = 0; r <= maxRow; r++) {
      data[r] = [];
      for (let c = 0; c <= maxCol; c++) {
        data[r][c] = null;
      }
    }

    // 填充数据
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        data[row.row_index][cell.column_index] = cell.value;
      }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // 设置列宽
    if (sheet.column_widths.length > 0) {
      worksheet['!cols'] = sheet.column_widths.map(w => ({ wch: w / 8 }));
    }

    // 设置行高
    if (sheet.row_heights.length > 0) {
      worksheet['!rows'] = sheet.row_heights.map(h => ({ hpt: h / 1.33 }));
    }

    return worksheet;
  }

  /**
   * 将 ExcelSheet 转换为 CSV 字符串
   */
  private excelSheetToCsv(sheet: ExcelSheet): string {
    // 找出最大行列
    let maxRow = 0;
    let maxCol = 0;
    for (const row of sheet.rows) {
      maxRow = Math.max(maxRow, row.row_index);
      for (const cell of row.cells) {
        maxCol = Math.max(maxCol, cell.column_index);
      }
    }

    // 构建数据矩阵
    const data: CellValue[][] = [];
    for (let r = 0; r <= maxRow; r++) {
      data[r] = [];
      for (let c = 0; c <= maxCol; c++) {
        data[r][c] = null;
      }
    }

    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        data[row.row_index][cell.column_index] = cell.value;
      }
    }

    // 转换为 CSV
    const lines = data.map(row =>
      row.map(cell => this.escapeCsvField(cell)).join(',')
    );

    return lines.join('\n');
  }

  /**
   * 转义 CSV 字段
   */
  private escapeCsvField(value: CellValue): string {
    if (value === null || value === undefined) return '';
    
    const str = String(value);
    
    // 如果包含逗号、引号或换行，需要用引号包裹
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
  }
}

// 导出单例
export const importExportService = new ImportExportService();
