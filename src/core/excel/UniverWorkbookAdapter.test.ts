import {
  applyUniverSnapshot,
  getUniverSnapshot,
  isUniverWorkbookSnapshot,
  legacyPayloadToUniverSnapshot,
  univerSnapshotToLegacySheets,
} from './UniverWorkbookAdapter';
import type { ExcelNotePayload } from '@shared/types';

describe('UniverWorkbookAdapter', () => {
  const legacyPayload: ExcelNotePayload = {
    title: '迁移测试',
    description: '',
    folder_id: null,
    is_pinned: false,
    is_locked: false,
    lock_password_hash: null,
    tags: [],
    sheets: [
      {
        id: 'sheet-1',
        name: 'Sheet1',
        rows: [
          {
            row_index: 0,
            cells: [
              {
                column_index: 0,
                value: '名称',
                formula: null,
                style: {
                  font_bold: true,
                  font_italic: false,
                  font_color: '#ff0000',
                  background_color: '#ffff00',
                  text_align: 'center',
                  vertical_align: 'middle',
                  number_format: null,
                },
              },
              {
                column_index: 1,
                value: 123,
                formula: '=SUM(B2:B3)',
                style: null,
              },
            ],
          },
        ],
        column_widths: [120, 140],
        row_heights: [32],
        frozen_rows: 1,
        frozen_columns: 1,
        merged_cells: [
          {
            start_row: 2,
            start_col: 0,
            end_row: 2,
            end_col: 1,
          },
        ],
      },
    ],
    active_sheet_index: 0,
  };

  it('converts legacy payloads into Univer workbook snapshots', () => {
    const snapshot = legacyPayloadToUniverSnapshot(legacyPayload, 'workbook-1');

    expect(isUniverWorkbookSnapshot(snapshot)).toBe(true);
    expect(snapshot.id).toBe('workbook-1');
    expect(snapshot.name).toBe('迁移测试');
    expect(snapshot.sheetOrder).toEqual(['sheet-1']);
    expect(snapshot.sheets?.['sheet-1']?.cellData?.[0]?.[0]?.v).toBe('名称');
    expect(snapshot.sheets?.['sheet-1']?.cellData?.[0]?.[1]?.f).toBe('=SUM(B2:B3)');
    expect(snapshot.sheets?.['sheet-1']?.mergeData?.[0]).toMatchObject({
      startRow: 2,
      startColumn: 0,
      endRow: 2,
      endColumn: 1,
    });
  });

  it('creates a legacy sheets mirror from a Univer snapshot', () => {
    const snapshot = legacyPayloadToUniverSnapshot(legacyPayload, 'workbook-1');
    const sheets = univerSnapshotToLegacySheets(snapshot);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows[0].cells[0]).toMatchObject({
      column_index: 0,
      value: '名称',
    });
    expect(sheets[0].rows[0].cells[0].style).toMatchObject({
      font_bold: true,
      font_color: '#ff0000',
      background_color: '#ffff00',
      text_align: 'center',
    });
    expect(sheets[0].rows[0].cells[1].formula).toBe('=SUM(B2:B3)');
    expect(sheets[0].column_widths[1]).toBe(140);
    expect(sheets[0].row_heights[0]).toBe(32);
    expect(sheets[0].merged_cells?.[0]).toMatchObject({
      start_row: 2,
      start_col: 0,
      end_row: 2,
      end_col: 1,
    });
  });

  it('stores Univer as the desktop source of truth while keeping mobile-compatible sheets', () => {
    const snapshot = legacyPayloadToUniverSnapshot(legacyPayload, 'workbook-1');
    const payload = applyUniverSnapshot(legacyPayload, snapshot);

    expect(payload.engine).toBe('univer');
    expect(payload.format_version).toBe(2);
    expect(isUniverWorkbookSnapshot(payload.univer_snapshot)).toBe(true);
    expect(payload.sheets[0].rows[0].cells[0].value).toBe('名称');
  });

  it('prefers an existing Univer snapshot over legacy sheets', () => {
    const snapshot = legacyPayloadToUniverSnapshot(legacyPayload, 'workbook-1');
    const payload = applyUniverSnapshot(legacyPayload, snapshot);

    expect(getUniverSnapshot(payload)).toEqual(snapshot);
  });

  it('keeps cached formula results and mobile display values in the legacy mirror', () => {
    const snapshot = {
      id: 'workbook-formula',
      name: '公式测试',
      sheetOrder: ['sheet-1'],
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Sheet1',
          cellData: {
            0: {
              0: { v: 10, t: 2 },
              1: {
                v: 0.25,
                f: '=A1/40',
                t: 2,
                s: { n: { pattern: '0.0%' } },
              },
              2: {
                f: '=SUM(A1:A2)',
              },
            },
          },
        },
      },
    };

    const sheets = univerSnapshotToLegacySheets(snapshot);
    const formulaWithValue = sheets[0].rows[0].cells[1];
    const formulaWithoutValue = sheets[0].rows[0].cells[2];

    expect(formulaWithValue.value).toBe(0.25);
    expect(formulaWithValue.formula).toBe('=A1/40');
    expect(formulaWithValue.display_value).toBe('25.0%');
    expect(formulaWithoutValue.value).toBeNull();
    expect(formulaWithoutValue.display_value).toBe('=SUM(A1:A2)');
  });

  it('preserves mobile-readable layout and style fields from Univer snapshots', () => {
    const snapshot = {
      id: 'workbook-style',
      name: '样式测试',
      sheetOrder: ['sheet-1'],
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Sheet1',
          cellData: {
            0: {
              0: {
                v: '标题',
                s: {
                  bl: 1,
                  it: 1,
                  fs: 18,
                  ff: 'Arial',
                  cl: { rgb: '#ffffff' },
                  bg: { rgb: '#1f6feb' },
                  ht: 2,
                  vt: 2,
                  tb: 3,
                  ul: { s: 1 },
                  st: { s: 1 },
                  bd: {
                    b: { s: 1, cl: { rgb: '#333333' } },
                  },
                },
              },
            },
          },
          rowData: {
            0: { h: 40 },
            1: { hd: 1 },
          },
          columnData: {
            0: { w: 180 },
            2: { hd: 1 },
          },
          mergeData: [
            { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 },
          ],
        },
      },
    };

    const sheets = univerSnapshotToLegacySheets(snapshot);
    const cell = sheets[0].rows[0].cells[0];

    expect(cell.style).toMatchObject({
      font_bold: true,
      font_italic: true,
      font_size: 18,
      font_family: 'Arial',
      font_color: '#ffffff',
      background_color: '#1f6feb',
      text_align: 'center',
      vertical_align: 'middle',
      underline: true,
      strikethrough: true,
      wrap_text: true,
      border_color: '#333333',
    });
    expect(sheets[0].row_heights[0]).toBe(40);
    expect(sheets[0].column_widths[0]).toBe(180);
    expect(sheets[0].hidden_rows).toEqual([1]);
    expect(sheets[0].hidden_columns).toEqual([2]);
  });
});
