import type {
  ICellData,
  IStyleData,
  IWorkbookData,
  IWorksheetData,
} from '@univerjs/core';
import type {
  CellStyle,
  CellValue,
  ExcelCell,
  ExcelNotePayload,
  ExcelRow,
  ExcelSheet,
  NumberFormat,
} from '@shared/types';

const DEFAULT_ROW_COUNT = 1000;
const DEFAULT_COLUMN_COUNT = 26;
const FALSE = 0;
const TRUE = 1;
const HORIZONTAL_LEFT = 1;
const HORIZONTAL_CENTER = 2;
const HORIZONTAL_RIGHT = 3;
const VERTICAL_TOP = 1;
const VERTICAL_MIDDLE = 2;
const VERTICAL_BOTTOM = 3;
const CELL_STRING = 1;
const CELL_NUMBER = 2;
const CELL_BOOLEAN = 3;
const WRAP_STRATEGY_WRAP = 3;
const BORDER_THIN = 1;

type WorkbookSnapshot = Partial<IWorkbookData>;

function cloneSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkbookSnapshot;
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function getDimensionValue(values: unknown, index: number): number | undefined {
  if (Array.isArray(values)) {
    return values[index];
  }

  if (values && typeof values === 'object') {
    const value = (values as Record<string, unknown>)[String(index)];
    return typeof value === 'number' ? value : undefined;
  }

  return undefined;
}

function toHorizontalAlign(value: CellStyle['text_align']): IStyleData['ht'] {
  switch (value) {
    case 'center':
      return HORIZONTAL_CENTER;
    case 'right':
      return HORIZONTAL_RIGHT;
    default:
      return HORIZONTAL_LEFT;
  }
}

function toVerticalAlign(value: CellStyle['vertical_align']): IStyleData['vt'] {
  switch (value) {
    case 'top':
      return VERTICAL_TOP;
    case 'bottom':
      return VERTICAL_BOTTOM;
    default:
      return VERTICAL_MIDDLE;
  }
}

function toNumberFormatPattern(format: NumberFormat | null): string | undefined {
  if (!format || format.type === 'general') {
    return undefined;
  }

  if (format.type === 'date') {
    return format.pattern;
  }

  const decimals = format.decimals > 0 ? `.${'0'.repeat(format.decimals)}` : '';
  if (format.type === 'percentage') {
    return `0${decimals}%`;
  }
  if (format.type === 'currency') {
    return `${format.symbol}#,##0${decimals}`;
  }
  return `#,##0${decimals}`;
}

function legacyStyleToUniver(style: CellStyle | null): IStyleData | undefined {
  if (!style) {
    return undefined;
  }

  const border = style.border_color
    ? {
        t: { s: BORDER_THIN, cl: { rgb: style.border_color } },
        r: { s: BORDER_THIN, cl: { rgb: style.border_color } },
        b: { s: BORDER_THIN, cl: { rgb: style.border_color } },
        l: { s: BORDER_THIN, cl: { rgb: style.border_color } },
      }
    : undefined;

  return {
    ff: style.font_family || undefined,
    fs: typeof style.font_size === 'number' ? style.font_size : undefined,
    bl: style.font_bold ? TRUE : undefined,
    it: style.font_italic ? TRUE : undefined,
    ul: style.underline ? { s: TRUE } : undefined,
    st: style.strikethrough ? { s: TRUE } : undefined,
    cl: style.font_color ? { rgb: style.font_color } : undefined,
    bg: style.background_color ? { rgb: style.background_color } : undefined,
    bd: border,
    ht: toHorizontalAlign(style.text_align),
    vt: toVerticalAlign(style.vertical_align),
    tb: style.wrap_text ? WRAP_STRATEGY_WRAP : undefined,
    n: toNumberFormatPattern(style.number_format)
      ? { pattern: toNumberFormatPattern(style.number_format)! }
      : undefined,
  };
}

function inferCellType(value: ExcelCell['value']): ICellData['t'] {
  if (typeof value === 'number') {
    return CELL_NUMBER;
  }
  if (typeof value === 'boolean') {
    return CELL_BOOLEAN;
  }
  if (typeof value === 'string') {
    return CELL_STRING;
  }
  return undefined;
}

function legacySheetToUniver(sheet: ExcelSheet, fallbackIndex: number): Partial<IWorksheetData> {
  const id = sheet.id || createId(`sheet-${fallbackIndex + 1}`);
  const cellData: Record<number, Record<number, ICellData>> = {};
  const rowData: Record<number, { h?: number }> = {};
  const columnData: Record<number, { w?: number }> = {};
  let maxRow = 0;
  let maxColumn = 0;

  for (const row of sheet.rows) {
    maxRow = Math.max(maxRow, row.row_index);
    const cells: Record<number, ICellData> = {};
    for (const cell of row.cells) {
      maxColumn = Math.max(maxColumn, cell.column_index);
      const value = cell.value ?? undefined;
      const style = legacyStyleToUniver(cell.style);
      if (value !== undefined || cell.formula || style) {
        cells[cell.column_index] = {
          v: value,
          f: cell.formula || undefined,
          t: inferCellType(cell.value),
          s: style,
        };
      }
    }
    if (Object.keys(cells).length > 0) {
      cellData[row.row_index] = cells;
    }
  }

  for (let index = 0; index <= maxColumn; index++) {
    const width = getDimensionValue(sheet.column_widths, index);
    if (width !== undefined) {
      columnData[index] = { w: width };
    }
  }

  for (let index = 0; index <= maxRow; index++) {
    const height = getDimensionValue(sheet.row_heights, index);
    if (height !== undefined) {
      rowData[index] = { h: height };
    }
  }

  const frozenRows = Math.max(0, sheet.frozen_rows || 0);
  const frozenColumns = Math.max(0, sheet.frozen_columns || 0);

  return {
    id,
    name: sheet.name || `Sheet${fallbackIndex + 1}`,
    rowCount: Math.max(DEFAULT_ROW_COUNT, maxRow + 1),
    columnCount: Math.max(DEFAULT_COLUMN_COUNT, maxColumn + 1),
    cellData,
    rowData,
    columnData,
    mergeData: (sheet.merged_cells ?? []).map((range) => ({
      startRow: range.start_row,
      startColumn: range.start_col,
      endRow: range.end_row,
      endColumn: range.end_col,
    })),
    freeze: {
      xSplit: frozenColumns,
      ySplit: frozenRows,
      startRow: frozenRows,
      startColumn: frozenColumns,
    },
    showGridlines: TRUE,
    hidden: FALSE,
  };
}

/**
 * Converts the original portable Excel payload into a Univer workbook input.
 * The returned object is intentionally partial: Univer fills its own defaults
 * and returns a complete serializable snapshot through FWorkbook.save().
 */
export function legacyPayloadToUniverSnapshot(
  payload: ExcelNotePayload,
  workbookId = createId('workbook')
): WorkbookSnapshot {
  const legacySheets = payload.sheets.length > 0
    ? payload.sheets
    : [{
        id: createId('sheet'),
        name: 'Sheet1',
        rows: [],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
        merged_cells: [],
      }];

  const sheets: Record<string, Partial<IWorksheetData>> = {};
  const sheetOrder: string[] = [];

  legacySheets.forEach((sheet, index) => {
    const univerSheet = legacySheetToUniver(sheet, index);
    const id = univerSheet.id!;
    sheets[id] = univerSheet;
    sheetOrder.push(id);
  });

  return {
    id: workbookId,
    name: payload.title || '未命名表格',
    locale: 'zhCN' as IWorkbookData['locale'],
    sheetOrder,
    sheets,
  };
}

export function isUniverWorkbookSnapshot(value: unknown): value is WorkbookSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.id === 'string'
    && Array.isArray(snapshot.sheetOrder)
    && !!snapshot.sheets
    && typeof snapshot.sheets === 'object';
}

export function getUniverSnapshot(
  payload: ExcelNotePayload,
  workbookId?: string
): WorkbookSnapshot {
  if (isUniverWorkbookSnapshot(payload.univer_snapshot)) {
    return cloneSnapshot(payload.univer_snapshot);
  }

  return legacyPayloadToUniverSnapshot(payload, workbookId);
}

function resolveStyle(
  cell: ICellData,
  styles: IWorkbookData['styles'] | undefined
): IStyleData | null {
  if (!cell.s) {
    return null;
  }

  if (typeof cell.s === 'string') {
    return styles?.[cell.s] ?? null;
  }

  return cell.s;
}

function countDecimals(pattern: string): number {
  const decimalPart = pattern.match(/\.(0+)/);
  return decimalPart?.[1].length ?? 0;
}

function univerNumberFormatToLegacy(pattern: string | undefined): NumberFormat | null {
  if (!pattern || pattern.toLowerCase() === 'general') {
    return null;
  }

  if (pattern.includes('%')) {
    return { type: 'percentage', decimals: countDecimals(pattern) };
  }

  const currency = pattern.match(/[$¥€£]/);
  if (currency) {
    return {
      type: 'currency',
      symbol: currency[0],
      decimals: countDecimals(pattern),
    };
  }

  if (/[ymdhHsS]/.test(pattern)) {
    return { type: 'date', pattern };
  }

  if (pattern.includes('0') || pattern.includes('#')) {
    return { type: 'number', decimals: countDecimals(pattern) };
  }

  return null;
}

function univerStyleToLegacy(style: IStyleData | null): CellStyle | null {
  if (!style) {
    return null;
  }

  const textAlign: CellStyle['text_align'] =
    style.ht === HORIZONTAL_CENTER
      ? 'center'
      : style.ht === HORIZONTAL_RIGHT
        ? 'right'
        : 'left';
  const verticalAlign: CellStyle['vertical_align'] =
    style.vt === VERTICAL_TOP
      ? 'top'
      : style.vt === VERTICAL_BOTTOM
        ? 'bottom'
        : 'middle';

  return {
    font_bold: style.bl === TRUE,
    font_italic: style.it === TRUE,
    font_size: typeof style.fs === 'number' ? style.fs : null,
    font_family: style.ff ?? null,
    font_color: style.cl?.rgb ?? null,
    background_color: style.bg?.rgb ?? null,
    text_align: textAlign,
    vertical_align: verticalAlign,
    underline: style.ul?.s === TRUE,
    strikethrough: style.st?.s === TRUE,
    wrap_text: style.tb === WRAP_STRATEGY_WRAP,
    border_color: getFirstBorderColor(style.bd),
    number_format: univerNumberFormatToLegacy(style.n?.pattern),
  };
}

function getFirstBorderColor(style: IStyleData['bd'] | undefined): string | null {
  if (!style) {
    return null;
  }

  const borders = [style.t, style.r, style.b, style.l];
  const color = borders.find((border) => border?.cl?.rgb)?.cl?.rgb;
  return color ?? null;
}

function formatNumberForDisplay(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function excelSerialDateToIsoDate(value: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(value) * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatValueForMobileDisplay(
  value: CellValue,
  formula: string | null,
  style: CellStyle | null
): CellValue | undefined {
  if (value === null) {
    return formula || undefined;
  }

  const format = style?.number_format;
  if (typeof value !== 'number' || !format || format.type === 'general') {
    return undefined;
  }

  if (format.type === 'percentage') {
    return `${formatNumberForDisplay(value * 100, format.decimals)}%`;
  }

  if (format.type === 'currency') {
    return `${format.symbol}${formatNumberForDisplay(value, format.decimals)}`;
  }

  if (format.type === 'number') {
    return formatNumberForDisplay(value, format.decimals);
  }

  if (format.type === 'date') {
    return excelSerialDateToIsoDate(value);
  }

  return undefined;
}

function extractPlainTextFromDocument(cell: ICellData): string | null {
  const body = cell.p?.body;
  if (!body || typeof body.dataStream !== 'string') {
    return null;
  }

  return body.dataStream
    .replace(/\r\n$/u, '')
    .replace(/\n$/u, '')
    .trimEnd();
}

function workbookSheetToLegacy(
  sheet: Partial<IWorksheetData>,
  styles: IWorkbookData['styles'] | undefined,
  fallbackIndex: number
): ExcelSheet {
  const rows: ExcelRow[] = [];
  const rawCellData = sheet.cellData ?? {};

  Object.entries(rawCellData).forEach(([rowKey, rawCells]) => {
    const rowIndex = Number(rowKey);
    const cells: ExcelCell[] = [];

    Object.entries(rawCells ?? {}).forEach(([columnKey, rawCell]) => {
      const cell = rawCell as ICellData;
      const value = cell.v ?? extractPlainTextFromDocument(cell) ?? null;
      const formula = cell.f ?? null;
      const style = univerStyleToLegacy(resolveStyle(cell, styles));
      if (value !== null || formula || style) {
        const legacyCell: ExcelCell = {
          column_index: Number(columnKey),
          value,
          formula,
          style,
        };
        const displayValue = formatValueForMobileDisplay(value, formula, style);
        if (displayValue !== undefined) {
          legacyCell.display_value = displayValue;
        }
        cells.push(legacyCell);
      }
    });

    if (cells.length > 0) {
      cells.sort((a, b) => a.column_index - b.column_index);
      rows.push({ row_index: rowIndex, cells });
    }
  });

  rows.sort((a, b) => a.row_index - b.row_index);

  const columnWidths: number[] = [];
  const hiddenColumns: number[] = [];
  Object.entries(sheet.columnData ?? {}).forEach(([columnKey, data]) => {
    if (typeof data?.w === 'number') {
      columnWidths[Number(columnKey)] = data.w;
    }
    if (data?.hd === TRUE) {
      hiddenColumns.push(Number(columnKey));
    }
  });

  const rowHeights: number[] = [];
  const hiddenRows: number[] = [];
  Object.entries(sheet.rowData ?? {}).forEach(([rowKey, data]) => {
    if (typeof data?.h === 'number') {
      rowHeights[Number(rowKey)] = data.h;
    }
    if (data?.hd === TRUE) {
      hiddenRows.push(Number(rowKey));
    }
  });

  return {
    id: sheet.id || createId(`sheet-${fallbackIndex + 1}`),
    name: sheet.name || `Sheet${fallbackIndex + 1}`,
    rows,
    column_widths: columnWidths,
    row_heights: rowHeights,
    frozen_rows: sheet.freeze?.ySplit ?? 0,
    frozen_columns: sheet.freeze?.xSplit ?? 0,
    merged_cells: (sheet.mergeData ?? []).map((range) => ({
      start_row: range.startRow,
      start_col: range.startColumn,
      end_row: range.endRow,
      end_col: range.endColumn,
    })),
    hidden_rows: hiddenRows.sort((a, b) => a - b),
    hidden_columns: hiddenColumns.sort((a, b) => a - b),
  };
}

export function univerSnapshotToLegacySheets(snapshot: WorkbookSnapshot): ExcelSheet[] {
  const sheets = snapshot.sheets ?? {};
  const orderedIds = snapshot.sheetOrder?.length
    ? snapshot.sheetOrder
    : Object.keys(sheets);

  const converted = orderedIds
    .map((id, index) => {
      const sheet = sheets[id];
      return sheet ? workbookSheetToLegacy(sheet, snapshot.styles, index) : null;
    })
    .filter((sheet): sheet is ExcelSheet => sheet !== null);

  return converted.length > 0
    ? converted
    : [{
        id: createId('sheet'),
        name: 'Sheet1',
        rows: [],
        column_widths: [],
        row_heights: [],
        frozen_rows: 0,
        frozen_columns: 0,
        merged_cells: [],
      }];
}

/**
 * Creates the synchronized Excel payload after Univer changes. Univer snapshot
 * is the desktop source of truth; `sheets` is a compatibility mirror for the
 * existing Android client and pre-migration records.
 */
export function applyUniverSnapshot(
  currentPayload: ExcelNotePayload,
  snapshot: WorkbookSnapshot
): ExcelNotePayload {
  const serializableSnapshot = cloneSnapshot(snapshot);
  return {
    ...currentPayload,
    title: serializableSnapshot.name || currentPayload.title,
    engine: 'univer',
    format_version: 2,
    univer_snapshot: serializableSnapshot as Record<string, unknown>,
    sheets: univerSnapshotToLegacySheets(serializableSnapshot),
    active_sheet_index: 0,
  };
}

export function workbookSnapshotFingerprint(snapshot: WorkbookSnapshot): string {
  return JSON.stringify(snapshot);
}
