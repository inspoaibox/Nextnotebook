/**
 * ImportExportService 单元测试
 */

import {
  ImportExportService,
  ImportExportError,
  ImportExportErrors,
} from './ImportExportService';
import { ExcelNotePayload, ExcelSheet, ExcelRow, ExcelCell } from '../../shared/types';

describe('ImportExportService', () => {
  let service: ImportExportService;

  beforeEach(() => {
    service = new ImportExportService();
  });

  describe('CSV 导入', () => {
    it('应该正确解析简单 CSV', async () => {
      const csvContent = 'A,B,C\n1,2,3\n4,5,6';
      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

      const result = await service.importCsv(file);

      expect(result.title).toBe('test');
      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0].rows).toHaveLength(3);
      
      // 第一行
      expect(result.sheets[0].rows[0].cells[0].value).toBe('A');
      expect(result.sheets[0].rows[0].cells[1].value).toBe('B');
      expect(result.sheets[0].rows[0].cells[2].value).toBe('C');
      
      // 第二行 - 数字应该被解析
      expect(result.sheets[0].rows[1].cells[0].value).toBe(1);
      expect(result.sheets[0].rows[1].cells[1].value).toBe(2);
      expect(result.sheets[0].rows[1].cells[2].value).toBe(3);
    });

    it('应该处理带引号的 CSV 字段', async () => {
      const csvContent = '"Hello, World","Test"\n"Line1\nLine2",Value';
      const file = new File([csvContent], 'quoted.csv', { type: 'text/csv' });

      const result = await service.importCsv(file);

      expect(result.sheets[0].rows[0].cells[0].value).toBe('Hello, World');
      expect(result.sheets[0].rows[0].cells[1].value).toBe('Test');
      expect(result.sheets[0].rows[1].cells[0].value).toBe('Line1\nLine2');
    });

    it('应该处理转义的引号', async () => {
      const csvContent = '"He said ""Hello""",Normal';
      const file = new File([csvContent], 'escaped.csv', { type: 'text/csv' });

      const result = await service.importCsv(file);

      expect(result.sheets[0].rows[0].cells[0].value).toBe('He said "Hello"');
    });

    it('应该拒绝过大的文件', async () => {
      // 创建一个超过 10MB 的文件
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      const file = new File([largeContent], 'large.csv', { type: 'text/csv' });

      await expect(service.importCsv(file)).rejects.toThrow(ImportExportError);
      await expect(service.importCsv(file)).rejects.toMatchObject({
        code: ImportExportErrors.FILE_TOO_LARGE,
      });
    });

    it('应该处理空 CSV', async () => {
      const file = new File([''], 'empty.csv', { type: 'text/csv' });

      const result = await service.importCsv(file);

      expect(result.sheets).toHaveLength(1);
      // 空 CSV 可能产生空行数组
      expect(result.sheets[0].rows.length).toBeGreaterThanOrEqual(0);
    });

    it('应该处理混合数字和文本', async () => {
      const csvContent = 'Name,Age,Score\nAlice,25,95.5\nBob,30,88';
      const file = new File([csvContent], 'mixed.csv', { type: 'text/csv' });

      const result = await service.importCsv(file);

      expect(result.sheets[0].rows[1].cells[0].value).toBe('Alice');
      expect(result.sheets[0].rows[1].cells[1].value).toBe(25);
      expect(result.sheets[0].rows[1].cells[2].value).toBe(95.5);
    });
  });

  describe('CSV 导出', () => {
    it('应该正确导出简单表格', async () => {
      const sheet: ExcelSheet = {
        id: 'test-sheet',
        name: 'Sheet1',
        rows: [
          {
            row_index: 0,
            cells: [
              { column_index: 0, value: 'A', formula: null, style: null },
              { column_index: 1, value: 'B', formula: null, style: null },
            ],
          },
          {
            row_index: 1,
            cells: [
              { column_index: 0, value: 1, formula: null, style: null },
              { column_index: 1, value: 2, formula: null, style: null },
            ],
          },
        ],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const blob = await service.exportToCsv(sheet);
      const text = await blob.text();

      expect(text).toBe('A,B\n1,2');
    });

    it('应该正确转义特殊字符', async () => {
      const sheet: ExcelSheet = {
        id: 'test-sheet',
        name: 'Sheet1',
        rows: [
          {
            row_index: 0,
            cells: [
              { column_index: 0, value: 'Hello, World', formula: null, style: null },
              { column_index: 1, value: 'Say "Hi"', formula: null, style: null },
            ],
          },
        ],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const blob = await service.exportToCsv(sheet);
      const text = await blob.text();

      expect(text).toBe('"Hello, World","Say ""Hi"""');
    });

    it('应该处理 null 值', async () => {
      const sheet: ExcelSheet = {
        id: 'test-sheet',
        name: 'Sheet1',
        rows: [
          {
            row_index: 0,
            cells: [
              { column_index: 0, value: 'A', formula: null, style: null },
              { column_index: 2, value: 'C', formula: null, style: null },
            ],
          },
        ],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const blob = await service.exportToCsv(sheet);
      const text = await blob.text();

      expect(text).toBe('A,,C');
    });

    it('应该处理稀疏行', async () => {
      const sheet: ExcelSheet = {
        id: 'test-sheet',
        name: 'Sheet1',
        rows: [
          {
            row_index: 0,
            cells: [{ column_index: 0, value: 'A', formula: null, style: null }],
          },
          {
            row_index: 2,
            cells: [{ column_index: 0, value: 'C', formula: null, style: null }],
          },
        ],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const blob = await service.exportToCsv(sheet);
      const text = await blob.text();

      expect(text).toBe('A\n\nC');
    });
  });

  describe('CSV 往返测试', () => {
    it('导入后导出应该保持数据一致', async () => {
      const originalCsv = 'Name,Value\nTest,123\nHello,456';
      const file = new File([originalCsv], 'roundtrip.csv', { type: 'text/csv' });

      const imported = await service.importCsv(file);
      const exported = await service.exportToCsv(imported.sheets[0]);
      const exportedText = await exported.text();

      expect(exportedText).toBe(originalCsv);
    });
  });

  describe('XLSX 导入', () => {
    it('应该拒绝过大的文件', async () => {
      const largeContent = new ArrayBuffer(11 * 1024 * 1024);
      const file = new File([largeContent], 'large.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await expect(service.importXlsx(file)).rejects.toThrow(ImportExportError);
      await expect(service.importXlsx(file)).rejects.toMatchObject({
        code: ImportExportErrors.FILE_TOO_LARGE,
      });
    });

    it('应该处理无效的 XLSX 文件', async () => {
      // xlsx 库会尝试解析任何内容，所以我们测试真正损坏的二进制数据
      const invalidContent = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0xFF, 0xFF]); // 损坏的 ZIP 头
      const file = new File([invalidContent], 'invalid.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await expect(service.importXlsx(file)).rejects.toThrow(ImportExportError);
      await expect(service.importXlsx(file)).rejects.toMatchObject({
        code: ImportExportErrors.FILE_CORRUPTED,
      });
    });
  });

  describe('XLSX 导出', () => {
    it('应该成功导出简单表格', async () => {
      const payload: ExcelNotePayload = {
        title: 'Test',
        description: '',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
        sheets: [
          {
            id: 'sheet1',
            name: 'Sheet1',
            rows: [
              {
                row_index: 0,
                cells: [
                  { column_index: 0, value: 'Hello', formula: null, style: null },
                  { column_index: 1, value: 123, formula: null, style: null },
                ],
              },
            ],
            column_widths: [100, 100],
            row_heights: [25],
            frozen_rows: 0,
            frozen_columns: 0,
          },
        ],
        active_sheet_index: 0,
      };

      const blob = await service.exportToXlsx(payload);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('应该导出多个工作表', async () => {
      const payload: ExcelNotePayload = {
        title: 'Multi-Sheet',
        description: '',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
        sheets: [
          {
            id: 'sheet1',
            name: 'Sheet1',
            rows: [{ row_index: 0, cells: [{ column_index: 0, value: 'A', formula: null, style: null }] }],
            column_widths: [],
            row_heights: [],
            frozen_rows: 0,
            frozen_columns: 0,
          },
          {
            id: 'sheet2',
            name: 'Sheet2',
            rows: [{ row_index: 0, cells: [{ column_index: 0, value: 'B', formula: null, style: null }] }],
            column_widths: [],
            row_heights: [],
            frozen_rows: 0,
            frozen_columns: 0,
          },
        ],
        active_sheet_index: 0,
      };

      const blob = await service.exportToXlsx(payload);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('XLSX 往返测试', () => {
    it('导出后导入应该保持数据一致', async () => {
      const originalPayload: ExcelNotePayload = {
        title: 'Roundtrip Test',
        description: '',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
        sheets: [
          {
            id: 'sheet1',
            name: 'TestSheet',
            rows: [
              {
                row_index: 0,
                cells: [
                  { column_index: 0, value: 'Name', formula: null, style: null },
                  { column_index: 1, value: 'Value', formula: null, style: null },
                ],
              },
              {
                row_index: 1,
                cells: [
                  { column_index: 0, value: 'Test', formula: null, style: null },
                  { column_index: 1, value: 123, formula: null, style: null },
                ],
              },
            ],
            column_widths: [],
            row_heights: [],
            frozen_rows: 0,
            frozen_columns: 0,
          },
        ],
        active_sheet_index: 0,
      };

      // 导出
      const blob = await service.exportToXlsx(originalPayload);
      
      // 导入
      const file = new File([blob], 'roundtrip.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const imported = await service.importXlsx(file);

      // 验证数据
      expect(imported.sheets).toHaveLength(1);
      expect(imported.sheets[0].name).toBe('TestSheet');
      expect(imported.sheets[0].rows).toHaveLength(2);
      
      // 验证单元格值
      const row0 = imported.sheets[0].rows.find(r => r.row_index === 0);
      const row1 = imported.sheets[0].rows.find(r => r.row_index === 1);
      
      expect(row0?.cells.find(c => c.column_index === 0)?.value).toBe('Name');
      expect(row0?.cells.find(c => c.column_index === 1)?.value).toBe('Value');
      expect(row1?.cells.find(c => c.column_index === 0)?.value).toBe('Test');
      expect(row1?.cells.find(c => c.column_index === 1)?.value).toBe(123);
    });
  });
});
