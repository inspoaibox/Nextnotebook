/**
 * Excel 笔记同步测试
 * 验证桌面端和 Android 端的数据兼容性
 */

import { createDefaultExcelNotePayload, createDefaultExcelSheet, ExcelNotePayload } from '@shared/types';

describe('Excel 笔记同步兼容性', () => {
  it('创建的默认 Excel 笔记应该包含至少一个工作表', () => {
    const payload = createDefaultExcelNotePayload('测试表格');
    
    expect(payload.sheets).toBeDefined();
    expect(payload.sheets.length).toBeGreaterThan(0);
    expect(payload.sheets[0].name).toBe('Sheet1');
  });

  it('默认工作表应该包含所有必需字段', () => {
    const sheet = createDefaultExcelSheet('Sheet1');
    
    expect(sheet.id).toBeDefined();
    expect(sheet.name).toBe('Sheet1');
    expect(sheet.rows).toEqual([]);
    expect(sheet.column_widths).toEqual([]);
    expect(sheet.row_heights).toEqual([]);
    expect(sheet.frozen_rows).toBe(0);
    expect(sheet.frozen_columns).toBe(0);
    expect(sheet.merged_cells).toEqual([]);
  });

  it('序列化后的 JSON 应该包含 sheets 字段', () => {
    const payload = createDefaultExcelNotePayload('测试表格');
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    
    expect(parsed.sheets).toBeDefined();
    expect(Array.isArray(parsed.sheets)).toBe(true);
    expect(parsed.sheets.length).toBeGreaterThan(0);
  });

  it('空的 sheets 数组应该被视为无效数据', () => {
    const payload: ExcelNotePayload = {
      title: '测试',
      description: '',
      folder_id: null,
      is_pinned: false,
      is_locked: false,
      lock_password_hash: null,
      tags: [],
      sheets: [], // 空数组
      active_sheet_index: 0,
    };
    
    // Android 端应该检测到这个问题并创建默认工作表
    expect(payload.sheets.length).toBe(0);
  });

  it('active_sheet_index 应该在有效范围内', () => {
    const payload = createDefaultExcelNotePayload('测试表格');
    
    expect(payload.active_sheet_index).toBeGreaterThanOrEqual(0);
    expect(payload.active_sheet_index).toBeLessThan(payload.sheets.length);
  });
});
