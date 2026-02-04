/**
 * ImportExportService 属性测试
 * 使用 fast-check 进行基于属性的测试
 * 
 * Feature: Excel Notes - Import/Export
 */

import * as fc from 'fast-check';
import { ImportExportService } from './ImportExportService';
import { ExcelNotePayload, ExcelSheet, ExcelRow, ExcelCell, CellValue } from '../../shared/types';

describe('ImportExportService Property Tests', () => {
  let service: ImportExportService;

  beforeEach(() => {
    service = new ImportExportService();
  });

  // 生成有效的单元格值
  const cellValueArb = fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 0, maxLength: 100 }).filter(s => !s.includes(',') && !s.includes('"') && !s.includes('\n')),
    fc.integer({ min: -1000000, max: 1000000 }),
    fc.float({ min: -1000, max: 1000, noNaN: true })
  );

  // 生成简单的单元格（无特殊字符，便于 CSV 测试）
  const simpleCellArb = fc.record({
    column_index: fc.integer({ min: 0, max: 10 }),
    value: cellValueArb,
    formula: fc.constant(null),
    style: fc.constant(null),
  });

  // 生成行
  const rowArb = (rowIndex: number) => fc.record({
    row_index: fc.constant(rowIndex),
    cells: fc.array(simpleCellArb, { minLength: 1, maxLength: 5 }),
  });

  // 生成工作表
  const sheetArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9\u4e00-\u9fa5]+$/.test(s)),
    rows: fc.array(
      fc.integer({ min: 0, max: 10 }).chain(rowIndex => rowArb(rowIndex)),
      { minLength: 1, maxLength: 5 }
    ),
    column_widths: fc.array(fc.integer({ min: 50, max: 200 }), { maxLength: 10 }),
    row_heights: fc.array(fc.integer({ min: 20, max: 50 }), { maxLength: 10 }),
    frozen_rows: fc.constant(0),
    frozen_columns: fc.constant(0),
  });

  /**
   * Property 15: 导入导出往返
   * 导出后再导入应该保持数据一致性
   */
  describe('Property 15: 导入导出往返', () => {
    it('CSV 导出后导入应该保持数值数据一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 5 }),
            { minLength: 1, maxLength: 5 }
          ),
          async (data) => {
            // 构建工作表
            const rows: ExcelRow[] = data.map((rowData, rowIndex) => ({
              row_index: rowIndex,
              cells: rowData.map((value, colIndex) => ({
                column_index: colIndex,
                value: value,
                formula: null,
                style: null,
              })),
            }));

            const sheet: ExcelSheet = {
              id: 'test-sheet',
              name: 'Sheet1',
              rows,
              column_widths: [],
              row_heights: [],
              frozen_rows: 0,
              frozen_columns: 0,
            };

            // 导出为 CSV
            const blob = await service.exportToCsv(sheet);
            const csvText = await blob.text();

            // 导入 CSV
            const file = new File([csvText], 'test.csv', { type: 'text/csv' });
            const imported = await service.importCsv(file);

            // 验证数据一致性
            const importedSheet = imported.sheets[0];
            
            for (let r = 0; r < data.length; r++) {
              const originalRow = data[r];
              const importedRow = importedSheet.rows.find(row => row.row_index === r);
              
              if (!importedRow) return false;
              
              for (let c = 0; c < originalRow.length; c++) {
                const originalValue = originalRow[c];
                const importedCell = importedRow.cells.find(cell => cell.column_index === c);
                
                if (!importedCell) return false;
                if (importedCell.value !== originalValue) return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('XLSX 导出后导入应该保持数值数据一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 3 }),
            { minLength: 1, maxLength: 3 }
          ),
          async (data) => {
            // 构建 payload
            const rows: ExcelRow[] = data.map((rowData, rowIndex) => ({
              row_index: rowIndex,
              cells: rowData.map((value, colIndex) => ({
                column_index: colIndex,
                value: value,
                formula: null,
                style: null,
              })),
            }));

            const payload: ExcelNotePayload = {
              title: 'Test',
              description: '',
              folder_id: null,
              is_pinned: false,
              is_locked: false,
              lock_password_hash: null,
              tags: [],
              sheets: [{
                id: 'test-sheet',
                name: 'Sheet1',
                rows,
                column_widths: [],
                row_heights: [],
                frozen_rows: 0,
                frozen_columns: 0,
              }],
              active_sheet_index: 0,
            };

            // 导出为 XLSX
            const blob = await service.exportToXlsx(payload);

            // 导入 XLSX
            const file = new File([blob], 'test.xlsx', {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const imported = await service.importXlsx(file);

            // 验证数据一致性
            const importedSheet = imported.sheets[0];
            
            for (let r = 0; r < data.length; r++) {
              const originalRow = data[r];
              const importedRow = importedSheet.rows.find(row => row.row_index === r);
              
              if (!importedRow) return false;
              
              for (let c = 0; c < originalRow.length; c++) {
                const originalValue = originalRow[c];
                const importedCell = importedRow.cells.find(cell => cell.column_index === c);
                
                if (!importedCell) return false;
                if (importedCell.value !== originalValue) return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('CSV 导出应该保持行数一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 5 }),
          async (rowCount, colCount) => {
            // 构建工作表
            const rows: ExcelRow[] = [];
            for (let r = 0; r < rowCount; r++) {
              const cells: ExcelCell[] = [];
              for (let c = 0; c < colCount; c++) {
                cells.push({
                  column_index: c,
                  value: r * colCount + c,
                  formula: null,
                  style: null,
                });
              }
              rows.push({ row_index: r, cells });
            }

            const sheet: ExcelSheet = {
              id: 'test-sheet',
              name: 'Sheet1',
              rows,
              column_widths: [],
              row_heights: [],
              frozen_rows: 0,
              frozen_columns: 0,
            };

            // 导出为 CSV
            const blob = await service.exportToCsv(sheet);
            const csvText = await blob.text();

            // 验证行数
            const lines = csvText.split('\n').filter(line => line.trim() !== '');
            return lines.length === rowCount;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: 文件大小限制
   */
  describe('Property: 文件大小限制', () => {
    it('超过 10MB 的文件应该被拒绝', async () => {
      // 创建一个超过 10MB 的文件
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      const file = new File([largeContent], 'large.csv', { type: 'text/csv' });

      try {
        await service.importCsv(file);
        return false; // 应该抛出错误
      } catch (error: any) {
        return error.code === 'FILE_TOO_LARGE';
      }
    });
  });

  /**
   * Property: 空数据处理
   */
  describe('Property: 空数据处理', () => {
    it('导出空工作表应该产生有效的 CSV', async () => {
      const sheet: ExcelSheet = {
        id: 'empty-sheet',
        name: 'Empty',
        rows: [],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const blob = await service.exportToCsv(sheet);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/csv;charset=utf-8');
    });

    it('导出空 payload 应该产生有效的 XLSX', async () => {
      const payload: ExcelNotePayload = {
        title: 'Empty',
        description: '',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
        sheets: [{
          id: 'empty-sheet',
          name: 'Sheet1',
          rows: [],
          column_widths: [],
          row_heights: [],
          frozen_rows: 0,
          frozen_columns: 0,
        }],
        active_sheet_index: 0,
      };

      const blob = await service.exportToXlsx(payload);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  /**
   * Property: 特殊字符处理
   */
  describe('Property: 特殊字符处理', () => {
    it('CSV 应该正确转义包含逗号的值', async () => {
      const sheet: ExcelSheet = {
        id: 'test-sheet',
        name: 'Sheet1',
        rows: [{
          row_index: 0,
          cells: [{
            column_index: 0,
            value: 'Hello, World',
            formula: null,
            style: null,
          }],
        }],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const blob = await service.exportToCsv(sheet);
      const csvText = await blob.text();

      // 包含逗号的值应该被引号包裹
      expect(csvText).toContain('"Hello, World"');
    });

    it('CSV 应该正确转义包含引号的值', async () => {
      const sheet: ExcelSheet = {
        id: 'test-sheet',
        name: 'Sheet1',
        rows: [{
          row_index: 0,
          cells: [{
            column_index: 0,
            value: 'Say "Hello"',
            formula: null,
            style: null,
          }],
        }],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const blob = await service.exportToCsv(sheet);
      const csvText = await blob.text();

      // 引号应该被双引号转义
      expect(csvText).toContain('"Say ""Hello"""');
    });
  });
});
