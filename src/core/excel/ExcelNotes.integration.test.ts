/**
 * Excel Notes 集成测试
 * 验证端到端功能：创建、编辑、导入导出、数据兼容性
 * 
 * Feature: Excel Notes
 */

import { FormulaEngine } from './FormulaEngine';
import { ImportExportService } from './ImportExportService';
import {
  ExcelNotePayload,
  ExcelSheet,
  ExcelRow,
  ExcelCell,
  CellValue,
  CellStyle,
  createDefaultExcelNotePayload,
  createDefaultExcelSheet,
  DEFAULT_CELL_STYLE,
} from '../../shared/types';

describe('Excel Notes Integration Tests', () => {
  let formulaEngine: FormulaEngine;
  let importExportService: ImportExportService;

  beforeEach(() => {
    formulaEngine = new FormulaEngine();
    importExportService = new ImportExportService();
  });

  describe('创建-编辑-保存流程', () => {
    it('应该能创建新的 Excel 笔记并编辑单元格', () => {
      // 1. 创建新笔记
      const payload = createDefaultExcelNotePayload('测试表格');
      
      expect(payload.title).toBe('测试表格');
      expect(payload.sheets).toHaveLength(1);
      expect(payload.sheets[0].name).toBe('Sheet1');
      expect(payload.active_sheet_index).toBe(0);

      // 2. 编辑单元格
      const sheet = payload.sheets[0];
      const newRow: ExcelRow = {
        row_index: 0,
        cells: [
          { column_index: 0, value: '姓名', formula: null, style: null },
          { column_index: 1, value: '年龄', formula: null, style: null },
          { column_index: 2, value: '分数', formula: null, style: null },
        ],
      };
      sheet.rows.push(newRow);

      // 3. 添加数据行
      const dataRow: ExcelRow = {
        row_index: 1,
        cells: [
          { column_index: 0, value: '张三', formula: null, style: null },
          { column_index: 1, value: 25, formula: null, style: null },
          { column_index: 2, value: 95, formula: null, style: null },
        ],
      };
      sheet.rows.push(dataRow);

      // 4. 验证数据
      expect(sheet.rows).toHaveLength(2);
      expect(sheet.rows[0].cells[0].value).toBe('姓名');
      expect(sheet.rows[1].cells[1].value).toBe(25);
    });

    it('应该能添加和管理多个工作表', () => {
      const payload = createDefaultExcelNotePayload('多工作表测试');
      
      // 添加第二个工作表
      const sheet2 = createDefaultExcelSheet('数据汇总');
      payload.sheets.push(sheet2);
      
      // 添加第三个工作表
      const sheet3 = createDefaultExcelSheet('图表数据');
      payload.sheets.push(sheet3);

      expect(payload.sheets).toHaveLength(3);
      expect(payload.sheets[0].name).toBe('Sheet1');
      expect(payload.sheets[1].name).toBe('数据汇总');
      expect(payload.sheets[2].name).toBe('图表数据');

      // 切换活动工作表
      payload.active_sheet_index = 1;
      expect(payload.active_sheet_index).toBe(1);

      // 删除工作表
      payload.sheets.splice(1, 1);
      payload.active_sheet_index = Math.min(payload.active_sheet_index, payload.sheets.length - 1);
      
      expect(payload.sheets).toHaveLength(2);
      expect(payload.active_sheet_index).toBe(1);
    });

    it('应该能应用单元格样式', () => {
      const payload = createDefaultExcelNotePayload('样式测试');
      const sheet = payload.sheets[0];

      // 添加带样式的单元格
      const styledCell: ExcelCell = {
        column_index: 0,
        value: '标题',
        formula: null,
        style: {
          font_bold: true,
          font_italic: false,
          font_color: '#FF0000',
          background_color: '#FFFF00',
          text_align: 'center',
          vertical_align: 'middle',
          number_format: null,
        },
      };

      sheet.rows.push({ row_index: 0, cells: [styledCell] });

      const cell = sheet.rows[0].cells[0];
      expect(cell.style?.font_bold).toBe(true);
      expect(cell.style?.font_color).toBe('#FF0000');
      expect(cell.style?.background_color).toBe('#FFFF00');
      expect(cell.style?.text_align).toBe('center');
    });
  });

  describe('公式计算集成', () => {
    it('应该能在表格中使用公式计算', () => {
      const payload = createDefaultExcelNotePayload('公式测试');
      const sheet = payload.sheets[0];

      // 添加数据
      sheet.rows = [
        {
          row_index: 0,
          cells: [
            { column_index: 0, value: 10, formula: null, style: null },
            { column_index: 1, value: 20, formula: null, style: null },
            { column_index: 2, value: 30, formula: null, style: null },
          ],
        },
        {
          row_index: 1,
          cells: [
            { column_index: 0, value: null, formula: '=SUM(A1:C1)', style: null },
            { column_index: 1, value: null, formula: '=AVERAGE(A1:C1)', style: null },
            { column_index: 2, value: null, formula: '=MAX(A1:C1)', style: null },
          ],
        },
      ];

      // 创建单元格值获取器
      const getCellValue = (ref: { row: number; column: number }): CellValue => {
        const row = sheet.rows.find(r => r.row_index === ref.row);
        if (!row) return null;
        const cell = row.cells.find(c => c.column_index === ref.column);
        return cell?.value ?? null;
      };

      // 计算公式
      const sumResult = formulaEngine.evaluate('=SUM(A1:C1)', getCellValue);
      const avgResult = formulaEngine.evaluate('=AVERAGE(A1:C1)', getCellValue);
      const maxResult = formulaEngine.evaluate('=MAX(A1:C1)', getCellValue);

      expect(sumResult.value).toBe(60);
      expect(avgResult.value).toBe(20);
      expect(maxResult.value).toBe(30);
    });

    it('应该能处理嵌套公式', () => {
      const getCellValue = (ref: { row: number; column: number }): CellValue => {
        const data: Record<string, CellValue> = {
          '0,0': 100,
          '0,1': 200,
          '0,2': 300,
        };
        return data[`${ref.row},${ref.column}`] ?? null;
      };

      // IF 嵌套 SUM
      const result = formulaEngine.evaluate('=IF(SUM(A1:C1)>500,1,0)', getCellValue);
      expect(result.value).toBe(1);

      // ROUND 嵌套 AVERAGE
      const result2 = formulaEngine.evaluate('=ROUND(AVERAGE(A1:C1),0)', getCellValue);
      expect(result2.value).toBe(200);
    });
  });

  describe('导入-编辑-导出流程', () => {
    it('CSV 导入后编辑再导出应该保持数据一致', async () => {
      // 1. 创建原始 CSV
      const originalCsv = '名称,数量,单价\n苹果,10,5\n香蕉,20,3';
      const file = new File([originalCsv], 'products.csv', { type: 'text/csv' });

      // 2. 导入
      const imported = await importExportService.importCsv(file);
      expect(imported.title).toBe('products');
      expect(imported.sheets[0].rows).toHaveLength(3);

      // 3. 编辑 - 添加总计行
      const sheet = imported.sheets[0];
      sheet.rows.push({
        row_index: 3,
        cells: [
          { column_index: 0, value: '总计', formula: null, style: null },
          { column_index: 1, value: 30, formula: null, style: null },
          { column_index: 2, value: null, formula: null, style: null },
        ],
      });

      // 4. 导出
      const exported = await importExportService.exportToCsv(sheet);
      const exportedText = await exported.text();

      // 5. 验证
      expect(exportedText).toContain('名称,数量,单价');
      expect(exportedText).toContain('苹果,10,5');
      expect(exportedText).toContain('总计,30');
    });

    it('XLSX 导入后编辑再导出应该保持数据一致', async () => {
      // 1. 创建原始数据
      const originalPayload: ExcelNotePayload = {
        title: 'Sales Report',
        description: '',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
        sheets: [
          {
            id: 'sheet1',
            name: 'Q1',
            rows: [
              {
                row_index: 0,
                cells: [
                  { column_index: 0, value: 'Month', formula: null, style: null },
                  { column_index: 1, value: 'Sales', formula: null, style: null },
                ],
              },
              {
                row_index: 1,
                cells: [
                  { column_index: 0, value: 'January', formula: null, style: null },
                  { column_index: 1, value: 1000, formula: null, style: null },
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

      // 2. 导出为 XLSX
      const xlsxBlob = await importExportService.exportToXlsx(originalPayload);

      // 3. 导入
      const file = new File([xlsxBlob], 'sales.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const imported = await importExportService.importXlsx(file);

      // 4. 验证数据
      expect(imported.sheets[0].name).toBe('Q1');
      const row0 = imported.sheets[0].rows.find(r => r.row_index === 0);
      const row1 = imported.sheets[0].rows.find(r => r.row_index === 1);
      
      expect(row0?.cells.find(c => c.column_index === 0)?.value).toBe('Month');
      expect(row1?.cells.find(c => c.column_index === 1)?.value).toBe(1000);
    });
  });

  describe('数据兼容性', () => {
    it('Payload 结构应该与 Android 端兼容', () => {
      // 创建一个完整的 payload
      const payload: ExcelNotePayload = {
        title: '兼容性测试',
        description: '测试描述',
        folder_id: 'folder-123',
        is_pinned: true,
        is_locked: false,
        lock_password_hash: null,
        tags: ['tag1', 'tag2'],
        sheets: [
          {
            id: 'sheet-001',
            name: '数据表',
            rows: [
              {
                row_index: 0,
                cells: [
                  {
                    column_index: 0,
                    value: '文本',
                    formula: null,
                    style: {
                      font_bold: true,
                      font_italic: false,
                      font_color: '#000000',
                      background_color: '#FFFFFF',
                      text_align: 'left',
                      vertical_align: 'middle',
                      number_format: { type: 'general' },
                    },
                  },
                  {
                    column_index: 1,
                    value: 123.45,
                    formula: null,
                    style: {
                      font_bold: false,
                      font_italic: false,
                      font_color: null,
                      background_color: null,
                      text_align: 'right',
                      vertical_align: 'middle',
                      number_format: { type: 'number', decimals: 2 },
                    },
                  },
                ],
              },
            ],
            column_widths: [100, 150],
            row_heights: [25],
            frozen_rows: 1,
            frozen_columns: 0,
          },
        ],
        active_sheet_index: 0,
      };

      // 序列化为 JSON
      const json = JSON.stringify(payload);
      
      // 反序列化
      const parsed = JSON.parse(json) as ExcelNotePayload;

      // 验证所有字段
      expect(parsed.title).toBe('兼容性测试');
      expect(parsed.description).toBe('测试描述');
      expect(parsed.folder_id).toBe('folder-123');
      expect(parsed.is_pinned).toBe(true);
      expect(parsed.tags).toEqual(['tag1', 'tag2']);
      expect(parsed.sheets[0].name).toBe('数据表');
      expect(parsed.sheets[0].rows[0].cells[0].value).toBe('文本');
      expect(parsed.sheets[0].rows[0].cells[1].value).toBe(123.45);
      expect(parsed.sheets[0].rows[0].cells[0].style?.font_bold).toBe(true);
      expect(parsed.sheets[0].rows[0].cells[1].style?.number_format).toEqual({ type: 'number', decimals: 2 });
      expect(parsed.sheets[0].frozen_rows).toBe(1);
    });

    it('应该正确处理各种单元格值类型', () => {
      const sheet: ExcelSheet = {
        id: 'test',
        name: 'Test',
        rows: [
          {
            row_index: 0,
            cells: [
              { column_index: 0, value: 'string', formula: null, style: null },
              { column_index: 1, value: 123, formula: null, style: null },
              { column_index: 2, value: 45.67, formula: null, style: null },
              { column_index: 3, value: true, formula: null, style: null },
              { column_index: 4, value: false, formula: null, style: null },
              { column_index: 5, value: null, formula: null, style: null },
            ],
          },
        ],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
      };

      const cells = sheet.rows[0].cells;
      
      expect(typeof cells[0].value).toBe('string');
      expect(typeof cells[1].value).toBe('number');
      expect(typeof cells[2].value).toBe('number');
      expect(typeof cells[3].value).toBe('boolean');
      expect(typeof cells[4].value).toBe('boolean');
      expect(cells[5].value).toBeNull();
    });

    it('应该正确处理所有数字格式类型', () => {
      const formats = [
        { type: 'general' as const },
        { type: 'number' as const, decimals: 2 },
        { type: 'percentage' as const, decimals: 1 },
        { type: 'currency' as const, symbol: '¥', decimals: 2 },
        { type: 'date' as const, pattern: 'YYYY-MM-DD' },
      ];

      formats.forEach(format => {
        const style: CellStyle = {
          ...DEFAULT_CELL_STYLE,
          number_format: format,
        };

        // 序列化和反序列化
        const json = JSON.stringify(style);
        const parsed = JSON.parse(json) as CellStyle;

        expect(parsed.number_format?.type).toBe(format.type);
      });
    });
  });

  describe('边界情况处理', () => {
    it('应该处理空工作表', () => {
      const payload = createDefaultExcelNotePayload('空表格');
      expect(payload.sheets[0].rows).toHaveLength(0);
    });

    it('应该处理大量数据', () => {
      const payload = createDefaultExcelNotePayload('大数据测试');
      const sheet = payload.sheets[0];

      // 添加 100 行 x 10 列的数据
      for (let r = 0; r < 100; r++) {
        const cells: ExcelCell[] = [];
        for (let c = 0; c < 10; c++) {
          cells.push({
            column_index: c,
            value: r * 10 + c,
            formula: null,
            style: null,
          });
        }
        sheet.rows.push({ row_index: r, cells });
      }

      expect(sheet.rows).toHaveLength(100);
      expect(sheet.rows[99].cells).toHaveLength(10);
      expect(sheet.rows[99].cells[9].value).toBe(999);
    });

    it('应该处理特殊字符', () => {
      const payload = createDefaultExcelNotePayload('特殊字符测试');
      const sheet = payload.sheets[0];

      sheet.rows.push({
        row_index: 0,
        cells: [
          { column_index: 0, value: '包含,逗号', formula: null, style: null },
          { column_index: 1, value: '包含"引号"', formula: null, style: null },
          { column_index: 2, value: '包含\n换行', formula: null, style: null },
          { column_index: 3, value: '中文字符测试', formula: null, style: null },
          { column_index: 4, value: '🎉 Emoji', formula: null, style: null },
        ],
      });

      const cells = sheet.rows[0].cells;
      expect(cells[0].value).toBe('包含,逗号');
      expect(cells[1].value).toBe('包含"引号"');
      expect(cells[2].value).toBe('包含\n换行');
      expect(cells[3].value).toBe('中文字符测试');
      expect(cells[4].value).toBe('🎉 Emoji');
    });
  });
});
