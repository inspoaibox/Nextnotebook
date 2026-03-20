/**
 * useExcelNotes Hook
 * 管理 Excel 笔记状态，提供 CRUD 操作、工作表管理、单元格编辑等功能
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ItemBase,
  ExcelNotePayload,
  ExcelSheet,
  ExcelRow,
  ExcelCell,
  CellValue,
  CellStyle,
  MergedCell,
  createDefaultExcelNotePayload,
  createDefaultExcelSheet,
  DEFAULT_CELL_STYLE,
} from '@shared/types';
import { itemsApi, parsePayload } from '../services/itemsApi';
import { FormulaEngine, CellReference } from '../../core/excel/FormulaEngine';

// 撤销/重做历史记录
interface HistoryEntry {
  payload: ExcelNotePayload;
  timestamp: number;
}

// 剪贴板数据
interface ClipboardData {
  cells: ExcelCell[][];
  startRow: number;
  startCol: number;
  isCut: boolean;
}

// 选区
export interface Selection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// 查找选项
export interface FindOptions {
  caseSensitive: boolean;
  wholeCell: boolean;
  useRegex: boolean;
}

// 查找结果
export interface FindResult {
  row: number;
  col: number;
  value: string;
}

// 排序配置
export interface SortConfig {
  column: number;
  order: 'asc' | 'desc';
}

// 筛选条件
export interface FilterCondition {
  column: number;
  type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'empty' | 'notEmpty';
  value: string;
  value2?: string;
}

// 列筛选（Excel 风格）
export interface ColumnFilter {
  column: number;
  selectedValues: Set<string>;
  selectAll: boolean;
}

export interface UseExcelNotesReturn {
  // 状态
  excelNotes: ItemBase[];
  currentNote: ItemBase | null;
  currentPayload: ExcelNotePayload | null;
  currentSheet: ExcelSheet | null;
  loading: boolean;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  selection: Selection | null;
  activeFilters: FilterCondition[];
  hiddenRows: Set<number>;
  columnFilters: Map<number, ColumnFilter>;

  // 笔记操作
  loadExcelNotes: () => Promise<void>;
  createExcelNote: (title?: string, folderId?: string) => Promise<ItemBase | null>;
  updateExcelNote: (id: string, payload: Partial<ExcelNotePayload>) => Promise<void>;
  deleteExcelNote: (id: string) => Promise<boolean>;
  selectExcelNote: (id: string) => Promise<void>;

  // 工作表操作
  addSheet: (name?: string) => void;
  deleteSheet: (sheetId: string) => void;
  renameSheet: (sheetId: string, name: string) => void;
  selectSheet: (sheetIndex: number) => void;
  reorderSheets: (fromIndex: number, toIndex: number) => void;

  // 单元格操作
  getCellValue: (row: number, col: number) => CellValue;
  getCellDisplayValue: (row: number, col: number) => string;
  updateCell: (row: number, col: number, value: CellValue, formula?: string) => void;
  updateCellStyle: (row: number, col: number, style: Partial<CellStyle>) => void;
  updateCellRange: (
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    style: Partial<CellStyle>
  ) => void;

  // 行列操作
  insertRow: (rowIndex: number) => void;
  deleteRow: (rowIndex: number) => void;
  insertColumn: (colIndex: number) => void;
  deleteColumn: (colIndex: number) => void;
  setColumnWidth: (colIndex: number, width: number) => void;
  setRowHeight: (rowIndex: number, height: number) => void;
  setFrozenRows: (count: number) => void;
  setFrozenColumns: (count: number) => void;

  // 选区操作
  setSelection: (selection: Selection | null) => void;

  // 清除操作
  clearCellRange: (startRow: number, startCol: number, endRow: number, endCol: number) => void;

  // 合并单元格操作
  mergeCells: (startRow: number, startCol: number, endRow: number, endCol: number) => boolean;
  unmergeCells: (row: number, col: number) => void;
  isCellMerged: (row: number, col: number) => boolean;
  getMergedCellInfo: (row: number, col: number) => MergedCell | null;

  // 查找替换操作
  findInSheet: (searchText: string, options: FindOptions) => FindResult[];
  replaceInSheet: (searchText: string, replaceText: string, options: FindOptions, row: number, col: number) => boolean;
  replaceAllInSheet: (searchText: string, replaceText: string, options: FindOptions) => number;

  // 排序筛选操作
  sortByColumn: (config: SortConfig) => void;
  sortBySelectedColumn: (order: 'asc' | 'desc') => void;
  applyFilters: (conditions: FilterCondition[]) => void;
  applyColumnFilter: (column: number, filter: ColumnFilter | null) => void;
  clearFilters: () => void;

  // 自动填充操作
  autoFill: (sourceRange: Selection, targetRange: Selection) => void;

  // 复制粘贴操作
  copySelection: (overrideSelection?: Selection) => Promise<void>;
  cutSelection: (overrideSelection?: Selection) => Promise<void>;
  pasteAtSelection: (overrideSelection?: Selection) => Promise<void>;

  // 撤销重做操作
  undo: () => void;
  redo: () => void;

  // 保存
  saveCurrentNote: () => Promise<void>;
}

const MAX_HISTORY_SIZE = 50;
const formulaEngine = new FormulaEngine();


export function useExcelNotes(folderId?: string | null): UseExcelNotesReturn {
  // 状态
  const [excelNotes, setExcelNotes] = useState<ItemBase[]>([]);
  const [currentNote, setCurrentNote] = useState<ItemBase | null>(null);
  const [currentPayload, setCurrentPayload] = useState<ExcelNotePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());
  const [columnFilters, setColumnFilters] = useState<Map<number, ColumnFilter>>(new Map());

  // 撤销/重做历史
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // 剪贴板
  const clipboardRef = useRef<ClipboardData | null>(null);

  // 是否有未保存的更改
  const isDirtyRef = useRef(false);

  // 当前工作表
  const currentSheet = currentPayload?.sheets[currentPayload.active_sheet_index] ?? null;

  // ==================== 历史管理 ====================

  const pushHistory = useCallback((payload: ExcelNotePayload) => {
    // 截断当前位置之后的历史
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);

    // 添加新记录
    historyRef.current.push({
      payload: JSON.parse(JSON.stringify(payload)),
      timestamp: Date.now(),
    });

    // 限制历史大小
    if (historyRef.current.length > MAX_HISTORY_SIZE) {
      historyRef.current.shift();
    } else {
      historyIndexRef.current++;
    }

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const updatePayload = useCallback((newPayload: ExcelNotePayload, addToHistory = true) => {
    if (addToHistory) {
      pushHistory(newPayload);
    }
    setCurrentPayload(newPayload);
    isDirtyRef.current = true;
  }, [pushHistory]);

  // ==================== 笔记操作 ====================

  const loadExcelNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await itemsApi.getByType('excel_note');
      const filtered = folderId !== undefined
        ? items.filter(item => {
            const payload = parsePayload<ExcelNotePayload>(item);
            return payload.folder_id === folderId;
          })
        : items;
      setExcelNotes(filtered);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  const createExcelNote = useCallback(async (title?: string, targetFolderId?: string): Promise<ItemBase | null> => {
    try {
      setLoading(true);
      const payload = createDefaultExcelNotePayload(title || '未命名表格');
      payload.folder_id = targetFolderId ?? folderId ?? null;

      console.log('[useExcelNotes] Creating excel_note with payload:', payload);
      const item = await itemsApi.create('excel_note', payload);
      console.log('[useExcelNotes] Created excel_note:', item);
      if (item) {
        await loadExcelNotes();
        return item;
      }
      return null;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [folderId, loadExcelNotes]);

  const updateExcelNote = useCallback(async (id: string, updates: Partial<ExcelNotePayload>) => {
    try {
      const item = await itemsApi.getById(id);
      if (!item) return;

      const existingPayload = parsePayload<ExcelNotePayload>(item);
      const newPayload = { ...existingPayload, ...updates };

      await itemsApi.update(id, newPayload);
      
      // 只更新本地状态，不重新加载整个列表
      if (currentNote?.id === id) {
        setCurrentPayload(newPayload);
      }
      
      // 更新列表中的对应项（如果标题变化了）
      if (updates.title) {
        setExcelNotes(prev => prev.map(note => {
          if (note.id === id) {
            return { ...note, payload: JSON.stringify(newPayload) };
          }
          return note;
        }));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentNote]);

  const deleteExcelNote = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await itemsApi.delete(id);
      if (success) {
        await loadExcelNotes();
        if (currentNote?.id === id) {
          setCurrentNote(null);
          setCurrentPayload(null);
        }
      }
      return success;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [currentNote, loadExcelNotes]);

  const selectExcelNote = useCallback(async (id: string) => {
    try {
      // 保存当前笔记
      if (currentNote && isDirtyRef.current) {
        await itemsApi.update(currentNote.id, currentPayload!);
        isDirtyRef.current = false;
      }

      const item = await itemsApi.getById(id);
      if (item) {
        const payload = parsePayload<ExcelNotePayload>(item);
        setCurrentNote(item);
        setCurrentPayload(payload);

        // 重置历史
        historyRef.current = [{ payload: JSON.parse(JSON.stringify(payload)), timestamp: Date.now() }];
        historyIndexRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
        isDirtyRef.current = false;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentNote, currentPayload]);

  const saveCurrentNote = useCallback(async () => {
    if (currentNote && currentPayload && isDirtyRef.current) {
      await itemsApi.update(currentNote.id, currentPayload);
      isDirtyRef.current = false;
    }
  }, [currentNote, currentPayload]);


  // ==================== 工作表操作 ====================

  const addSheet = useCallback((name?: string) => {
    if (!currentPayload) return;

    const sheetName = name || `Sheet${currentPayload.sheets.length + 1}`;
    const newSheet = createDefaultExcelSheet(sheetName);

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: [...currentPayload.sheets, newSheet],
      active_sheet_index: currentPayload.sheets.length,
    };

    updatePayload(newPayload);
  }, [currentPayload, updatePayload]);

  const deleteSheet = useCallback((sheetId: string) => {
    if (!currentPayload || currentPayload.sheets.length <= 1) return;

    const sheetIndex = currentPayload.sheets.findIndex(s => s.id === sheetId);
    if (sheetIndex === -1) return;

    const newSheets = currentPayload.sheets.filter(s => s.id !== sheetId);
    const newActiveIndex = Math.min(currentPayload.active_sheet_index, newSheets.length - 1);

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
      active_sheet_index: newActiveIndex,
    };

    updatePayload(newPayload);
  }, [currentPayload, updatePayload]);

  const renameSheet = useCallback((sheetId: string, name: string) => {
    if (!currentPayload) return;

    const newSheets = currentPayload.sheets.map(sheet =>
      sheet.id === sheetId ? { ...sheet, name } : sheet
    );

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, updatePayload]);

  const selectSheet = useCallback((sheetIndex: number) => {
    if (!currentPayload || sheetIndex < 0 || sheetIndex >= currentPayload.sheets.length) return;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      active_sheet_index: sheetIndex,
    };

    updatePayload(newPayload, false); // 切换工作表不加入历史
  }, [currentPayload, updatePayload]);

  const reorderSheets = useCallback((fromIndex: number, toIndex: number) => {
    if (!currentPayload) return;
    if (fromIndex < 0 || fromIndex >= currentPayload.sheets.length) return;
    if (toIndex < 0 || toIndex >= currentPayload.sheets.length) return;

    const newSheets = [...currentPayload.sheets];
    const [removed] = newSheets.splice(fromIndex, 1);
    newSheets.splice(toIndex, 0, removed);

    // 更新 active_sheet_index
    let newActiveIndex = currentPayload.active_sheet_index;
    if (currentPayload.active_sheet_index === fromIndex) {
      newActiveIndex = toIndex;
    } else if (fromIndex < currentPayload.active_sheet_index && toIndex >= currentPayload.active_sheet_index) {
      newActiveIndex--;
    } else if (fromIndex > currentPayload.active_sheet_index && toIndex <= currentPayload.active_sheet_index) {
      newActiveIndex++;
    }

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
      active_sheet_index: newActiveIndex,
    };

    updatePayload(newPayload);
  }, [currentPayload, updatePayload]);

  // ==================== 单元格操作 ====================

  const getCell = useCallback((row: number, col: number): ExcelCell | null => {
    if (!currentSheet) return null;

    const rowData = currentSheet.rows.find(r => r.row_index === row);
    if (!rowData) return null;

    return rowData.cells.find(c => c.column_index === col) ?? null;
  }, [currentSheet]);

  const getCellValue = useCallback((row: number, col: number): CellValue => {
    const cell = getCell(row, col);
    return cell?.value ?? null;
  }, [getCell]);

  const getCellDisplayValue = useCallback((row: number, col: number): string => {
    const cell = getCell(row, col);
    if (!cell) return '';

    // 如果有公式，计算结果
    if (cell.formula) {
      const getCellValueForFormula = (ref: CellReference): CellValue => {
        return getCellValue(ref.row, ref.column);
      };

      const result = formulaEngine.evaluate(cell.formula, getCellValueForFormula);
      if (result.error) return result.error;
      return result.value?.toString() ?? '';
    }

    return cell.value?.toString() ?? '';
  }, [getCell, getCellValue]);

  const updateCell = useCallback((row: number, col: number, value: CellValue, formula?: string) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    const rows = [...sheet.rows];

    // 查找或创建行
    let rowIndex = rows.findIndex(r => r.row_index === row);
    let rowData: ExcelRow;

    if (rowIndex === -1) {
      rowData = { row_index: row, cells: [] };
      rows.push(rowData);
      rowIndex = rows.length - 1;
    } else {
      rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
      rows[rowIndex] = rowData;
    }

    // 查找或创建单元格
    const cellIndex = rowData.cells.findIndex(c => c.column_index === col);
    const existingCell = cellIndex !== -1 ? rowData.cells[cellIndex] : null;

    const newCell: ExcelCell = {
      column_index: col,
      value,
      formula: formula ?? null,
      style: existingCell?.style ?? null,
    };

    if (cellIndex === -1) {
      rowData.cells.push(newCell);
    } else {
      rowData.cells[cellIndex] = newCell;
    }

    sheet.rows = rows;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);

    // 清除公式缓存
    formulaEngine.clearCache();
  }, [currentPayload, currentSheet, updatePayload]);

  const updateCellStyle = useCallback((row: number, col: number, style: Partial<CellStyle>) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    const rows = [...sheet.rows];

    let rowIndex = rows.findIndex(r => r.row_index === row);
    let rowData: ExcelRow;

    if (rowIndex === -1) {
      rowData = { row_index: row, cells: [] };
      rows.push(rowData);
      rowIndex = rows.length - 1;
    } else {
      rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
      rows[rowIndex] = rowData;
    }

    const cellIndex = rowData.cells.findIndex(c => c.column_index === col);
    const existingCell = cellIndex !== -1 ? rowData.cells[cellIndex] : null;

    const newCell: ExcelCell = {
      column_index: col,
      value: existingCell?.value ?? null,
      formula: existingCell?.formula ?? null,
      style: {
        ...(existingCell?.style ?? DEFAULT_CELL_STYLE),
        ...style,
      },
    };

    if (cellIndex === -1) {
      rowData.cells.push(newCell);
    } else {
      rowData.cells[cellIndex] = newCell;
    }

    sheet.rows = rows;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  const updateCellRange = useCallback((
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    style: Partial<CellStyle>
  ) => {
    if (!currentPayload || !currentSheet) return;

    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    const rows = [...sheet.rows];

    for (let row = minRow; row <= maxRow; row++) {
      let rowIndex = rows.findIndex(r => r.row_index === row);
      let rowData: ExcelRow;

      if (rowIndex === -1) {
        rowData = { row_index: row, cells: [] };
        rows.push(rowData);
        rowIndex = rows.length - 1;
      } else {
        rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
        rows[rowIndex] = rowData;
      }

      for (let col = minCol; col <= maxCol; col++) {
        const cellIndex = rowData.cells.findIndex(c => c.column_index === col);
        const existingCell = cellIndex !== -1 ? rowData.cells[cellIndex] : null;

        const newCell: ExcelCell = {
          column_index: col,
          value: existingCell?.value ?? null,
          formula: existingCell?.formula ?? null,
          style: {
            ...(existingCell?.style ?? DEFAULT_CELL_STYLE),
            ...style,
          },
        };

        if (cellIndex === -1) {
          rowData.cells.push(newCell);
        } else {
          rowData.cells[cellIndex] = newCell;
        }
      }
    }

    sheet.rows = rows;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  // 清除单元格范围内容（保留样式）
  const clearCellRange = useCallback((
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ) => {
    if (!currentPayload || !currentSheet) return;

    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    const rows = [...sheet.rows];

    for (let row = minRow; row <= maxRow; row++) {
      const rowIndex = rows.findIndex(r => r.row_index === row);
      if (rowIndex !== -1) {
        const rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
        rows[rowIndex] = rowData;

        for (let col = minCol; col <= maxCol; col++) {
          const cellIndex = rowData.cells.findIndex(c => c.column_index === col);
          if (cellIndex !== -1) {
            // 清除值和公式，保留样式
            rowData.cells[cellIndex] = {
              ...rowData.cells[cellIndex],
              value: null,
              formula: null,
            };
          }
        }
      }
    }

    sheet.rows = rows;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
    
    // 清除公式缓存
    formulaEngine.clearCache();
  }, [currentPayload, currentSheet, updatePayload]);


  // ==================== 行列操作 ====================

  const insertRow = useCallback((rowIndex: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };

    // 将所有 >= rowIndex 的行索引 +1
    const rows = sheet.rows.map(row => ({
      ...row,
      row_index: row.row_index >= rowIndex ? row.row_index + 1 : row.row_index,
    }));

    // 更新行高数组
    const rowHeights = [...sheet.row_heights];
    rowHeights.splice(rowIndex, 0, 25); // 默认行高

    // 更新合并单元格坐标
    const mergedCells = (sheet.merged_cells || []).map(m => {
      if (rowIndex <= m.start_row) {
        // 插入的行在合并区域之前或起始位置，整体下移
        return { ...m, start_row: m.start_row + 1, end_row: m.end_row + 1 };
      } else if (rowIndex > m.start_row && rowIndex <= m.end_row) {
        // 插入的行在合并区域内，扩大合并区域
        return { ...m, end_row: m.end_row + 1 };
      }
      return m;
    });

    sheet.rows = rows;
    sheet.row_heights = rowHeights;
    sheet.merged_cells = mergedCells;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  const deleteRow = useCallback((rowIndex: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };

    // 删除该行，并将所有 > rowIndex 的行索引 -1
    const rows = sheet.rows
      .filter(row => row.row_index !== rowIndex)
      .map(row => ({
        ...row,
        row_index: row.row_index > rowIndex ? row.row_index - 1 : row.row_index,
      }));

    // 更新行高数组
    const rowHeights = [...sheet.row_heights];
    if (rowIndex < rowHeights.length) {
      rowHeights.splice(rowIndex, 1);
    }

    // 更新合并单元格坐标
    const mergedCells = (sheet.merged_cells || [])
      .filter(m => !(m.start_row === rowIndex && m.end_row === rowIndex)) // 删除只包含该行的合并
      .map(m => {
        if (rowIndex < m.start_row) {
          // 删除的行在合并区域之前，整体上移
          return { ...m, start_row: m.start_row - 1, end_row: m.end_row - 1 };
        } else if (rowIndex >= m.start_row && rowIndex <= m.end_row) {
          // 删除的行在合并区域内，缩小合并区域
          return { ...m, end_row: m.end_row - 1 };
        }
        return m;
      })
      .filter(m => m.start_row <= m.end_row); // 过滤掉无效的合并区域

    sheet.rows = rows;
    sheet.row_heights = rowHeights;
    sheet.merged_cells = mergedCells;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  const insertColumn = useCallback((colIndex: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };

    // 将所有 >= colIndex 的列索引 +1
    const rows = sheet.rows.map(row => ({
      ...row,
      cells: row.cells.map(cell => ({
        ...cell,
        column_index: cell.column_index >= colIndex ? cell.column_index + 1 : cell.column_index,
      })),
    }));

    // 更新列宽数组
    const columnWidths = [...sheet.column_widths];
    columnWidths.splice(colIndex, 0, 100); // 默认列宽

    // 更新合并单元格坐标
    const mergedCells = (sheet.merged_cells || []).map(m => {
      if (colIndex <= m.start_col) {
        // 插入的列在合并区域之前或起始位置，整体右移
        return { ...m, start_col: m.start_col + 1, end_col: m.end_col + 1 };
      } else if (colIndex > m.start_col && colIndex <= m.end_col) {
        // 插入的列在合并区域内，扩大合并区域
        return { ...m, end_col: m.end_col + 1 };
      }
      return m;
    });

    sheet.rows = rows;
    sheet.column_widths = columnWidths;
    sheet.merged_cells = mergedCells;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  const deleteColumn = useCallback((colIndex: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };

    // 删除该列，并将所有 > colIndex 的列索引 -1
    const rows = sheet.rows.map(row => ({
      ...row,
      cells: row.cells
        .filter(cell => cell.column_index !== colIndex)
        .map(cell => ({
          ...cell,
          column_index: cell.column_index > colIndex ? cell.column_index - 1 : cell.column_index,
        })),
    }));

    // 更新列宽数组
    const columnWidths = [...sheet.column_widths];
    if (colIndex < columnWidths.length) {
      columnWidths.splice(colIndex, 1);
    }

    // 更新合并单元格坐标
    const mergedCells = (sheet.merged_cells || [])
      .filter(m => !(m.start_col === colIndex && m.end_col === colIndex)) // 删除只包含该列的合并
      .map(m => {
        if (colIndex < m.start_col) {
          // 删除的列在合并区域之前，整体左移
          return { ...m, start_col: m.start_col - 1, end_col: m.end_col - 1 };
        } else if (colIndex >= m.start_col && colIndex <= m.end_col) {
          // 删除的列在合并区域内，缩小合并区域
          return { ...m, end_col: m.end_col - 1 };
        }
        return m;
      })
      .filter(m => m.start_col <= m.end_col); // 过滤掉无效的合并区域

    sheet.rows = rows;
    sheet.column_widths = columnWidths;
    sheet.merged_cells = mergedCells;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  const setColumnWidth = useCallback((colIndex: number, width: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };

    const columnWidths = [...sheet.column_widths];
    while (columnWidths.length <= colIndex) {
      columnWidths.push(100); // 默认列宽
    }
    columnWidths[colIndex] = width;

    sheet.column_widths = columnWidths;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload, false); // 调整尺寸不加入历史
  }, [currentPayload, currentSheet, updatePayload]);

  const setRowHeight = useCallback((rowIndex: number, height: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };

    const rowHeights = [...sheet.row_heights];
    while (rowHeights.length <= rowIndex) {
      rowHeights.push(25); // 默认行高
    }
    rowHeights[rowIndex] = height;

    sheet.row_heights = rowHeights;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload, false);
  }, [currentPayload, currentSheet, updatePayload]);

  const setFrozenRows = useCallback((count: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex], frozen_rows: count };
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  const setFrozenColumns = useCallback((count: number) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex], frozen_columns: count };
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);


  // ==================== 合并单元格操作 ====================

  // 检查单元格是否在某个合并区域内
  const getMergedCellInfo = useCallback((row: number, col: number): MergedCell | null => {
    if (!currentSheet?.merged_cells) return null;

    for (const merged of currentSheet.merged_cells) {
      if (
        row >= merged.start_row &&
        row <= merged.end_row &&
        col >= merged.start_col &&
        col <= merged.end_col
      ) {
        return merged;
      }
    }
    return null;
  }, [currentSheet]);

  // 检查单元格是否被合并
  const isCellMerged = useCallback((row: number, col: number): boolean => {
    return getMergedCellInfo(row, col) !== null;
  }, [getMergedCellInfo]);

  // 合并单元格
  const mergeCells = useCallback((startRow: number, startCol: number, endRow: number, endCol: number): boolean => {
    if (!currentPayload || !currentSheet) return false;

    // 规范化范围
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    // 检查是否只有一个单元格
    if (minRow === maxRow && minCol === maxCol) return false;

    // 检查是否与现有合并区域冲突
    const existingMerged = currentSheet.merged_cells || [];
    for (const merged of existingMerged) {
      // 检查是否有重叠
      const overlaps = !(
        maxRow < merged.start_row ||
        minRow > merged.end_row ||
        maxCol < merged.start_col ||
        minCol > merged.end_col
      );
      if (overlaps) {
        console.warn('合并区域与现有合并单元格冲突');
        return false;
      }
    }

    // 创建新的合并区域
    const newMerged: MergedCell = {
      start_row: minRow,
      start_col: minCol,
      end_row: maxRow,
      end_col: maxCol,
    };

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    sheet.merged_cells = [...existingMerged, newMerged];
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
    return true;
  }, [currentPayload, currentSheet, updatePayload]);

  // 取消合并单元格
  const unmergeCells = useCallback((row: number, col: number) => {
    if (!currentPayload || !currentSheet) return;

    const mergedInfo = getMergedCellInfo(row, col);
    if (!mergedInfo) return;

    const existingMerged = currentSheet.merged_cells || [];
    const newMerged = existingMerged.filter(
      m => !(
        m.start_row === mergedInfo.start_row &&
        m.start_col === mergedInfo.start_col &&
        m.end_row === mergedInfo.end_row &&
        m.end_col === mergedInfo.end_col
      )
    );

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    sheet.merged_cells = newMerged;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, getMergedCellInfo, updatePayload]);


  // ==================== 查找替换操作 ====================

  // 在工作表中查找
  const findInSheet = useCallback((searchText: string, options: FindOptions): FindResult[] => {
    if (!currentSheet || !searchText) return [];

    const results: FindResult[] = [];
    let searchPattern: RegExp;

    try {
      if (options.useRegex) {
        searchPattern = new RegExp(searchText, options.caseSensitive ? 'g' : 'gi');
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (options.wholeCell) {
          searchPattern = new RegExp(`^${escaped}$`, options.caseSensitive ? '' : 'i');
        } else {
          searchPattern = new RegExp(escaped, options.caseSensitive ? 'g' : 'gi');
        }
      }
    } catch (e) {
      console.error('Invalid regex:', e);
      return [];
    }

    for (const row of currentSheet.rows) {
      for (const cell of row.cells) {
        const cellValue = String(cell.value ?? '');
        if (searchPattern.test(cellValue)) {
          results.push({
            row: row.row_index,
            col: cell.column_index,
            value: cellValue,
          });
        }
      }
    }

    return results;
  }, [currentSheet]);

  // 替换单个单元格
  const replaceInSheet = useCallback((
    searchText: string,
    replaceText: string,
    options: FindOptions,
    row: number,
    col: number
  ): boolean => {
    if (!currentPayload || !currentSheet) return false;

    const cell = currentSheet.rows.find(r => r.row_index === row)?.cells.find(c => c.column_index === col);
    if (!cell) return false;

    const cellValue = String(cell.value ?? '');
    let newValue: string;

    try {
      if (options.useRegex) {
        const pattern = new RegExp(searchText, options.caseSensitive ? 'g' : 'gi');
        newValue = cellValue.replace(pattern, replaceText);
      } else if (options.wholeCell) {
        newValue = replaceText;
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, options.caseSensitive ? 'g' : 'gi');
        newValue = cellValue.replace(pattern, replaceText);
      }
    } catch (e) {
      console.error('Replace error:', e);
      return false;
    }

    if (newValue !== cellValue) {
      updateCell(row, col, newValue);
      return true;
    }
    return false;
  }, [currentPayload, currentSheet, updateCell]);

  // 全部替换
  const replaceAllInSheet = useCallback((
    searchText: string,
    replaceText: string,
    options: FindOptions
  ): number => {
    if (!currentPayload || !currentSheet) return 0;

    const results = findInSheet(searchText, options);
    let count = 0;

    for (const result of results) {
      if (replaceInSheet(searchText, replaceText, options, result.row, result.col)) {
        count++;
      }
    }

    return count;
  }, [currentPayload, currentSheet, findInSheet, replaceInSheet]);


  // ==================== 排序筛选操作 ====================

  // 按列排序
  const sortByColumn = useCallback((config: SortConfig) => {
    if (!currentPayload || !currentSheet) return;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };

    // 获取所有行并排序
    const sortedRows = [...sheet.rows].sort((a, b) => {
      const cellA = a.cells.find(c => c.column_index === config.column);
      const cellB = b.cells.find(c => c.column_index === config.column);
      
      const valueA = cellA?.value ?? '';
      const valueB = cellB?.value ?? '';

      // 数字比较
      const numA = typeof valueA === 'number' ? valueA : parseFloat(String(valueA));
      const numB = typeof valueB === 'number' ? valueB : parseFloat(String(valueB));

      if (!isNaN(numA) && !isNaN(numB)) {
        return config.order === 'asc' ? numA - numB : numB - numA;
      }

      // 字符串比较
      const strA = String(valueA).toLowerCase();
      const strB = String(valueB).toLowerCase();
      
      if (config.order === 'asc') {
        return strA.localeCompare(strB, 'zh-CN');
      } else {
        return strB.localeCompare(strA, 'zh-CN');
      }
    });

    // 重新分配行索引（创建新对象避免修改原始数据）
    const reindexedRows = sortedRows.map((row, index) => ({
      ...row,
      row_index: index,
      cells: [...row.cells],
    }));

    sheet.rows = reindexedRows;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, updatePayload]);

  // 根据当前选中的列排序
  const sortBySelectedColumn = useCallback((order: 'asc' | 'desc') => {
    if (!selection) return;
    const column = selection.startCol;
    sortByColumn({ column, order });
  }, [selection, sortByColumn]);

  // 应用列筛选（Excel 风格）
  const applyColumnFilter = useCallback((column: number, filter: ColumnFilter | null) => {
    if (!currentSheet) return;

    const newFilters = new Map(columnFilters);
    
    if (filter === null || filter.selectAll) {
      // 清除该列的筛选
      newFilters.delete(column);
    } else {
      newFilters.set(column, filter);
    }
    
    setColumnFilters(newFilters);

    // 根据所有列筛选计算隐藏行
    if (newFilters.size === 0) {
      setHiddenRows(new Set());
      return;
    }

    const hidden = new Set<number>();
    const VISIBLE_ROWS = 50; // 与 SpreadsheetGrid 保持一致

    // 遍历所有可见行（包括空行）
    for (let rowIndex = 0; rowIndex < VISIBLE_ROWS; rowIndex++) {
      const row = currentSheet.rows.find(r => r.row_index === rowIndex);
      let shouldHide = false;

      for (const [col, colFilter] of newFilters) {
        if (colFilter.selectAll) continue;

        const cell = row?.cells.find(c => c.column_index === col);
        const cellValue = cell?.value;
        const strValue = cellValue === null || cellValue === undefined ? '(空白)' : String(cellValue);

        // 如果该值不在选中的值集合中，隐藏该行
        if (!colFilter.selectedValues.has(strValue)) {
          shouldHide = true;
          break;
        }
      }

      if (shouldHide) {
        hidden.add(rowIndex);
      }
    }

    setHiddenRows(hidden);
  }, [currentSheet, columnFilters]);

  // 应用筛选条件
  const applyFilters = useCallback((conditions: FilterCondition[]) => {
    if (!currentSheet) return;

    setActiveFilters(conditions);

    if (conditions.length === 0) {
      setHiddenRows(new Set());
      return;
    }

    const hidden = new Set<number>();

    // 检查每一行是否满足所有条件
    for (const row of currentSheet.rows) {
      let shouldHide = false;

      for (const condition of conditions) {
        const cell = row.cells.find(c => c.column_index === condition.column);
        const cellValue = cell?.value ?? '';
        const strValue = String(cellValue).toLowerCase();
        const condValue = condition.value.toLowerCase();

        let matches = false;

        switch (condition.type) {
          case 'equals':
            matches = strValue === condValue;
            break;
          case 'contains':
            matches = strValue.includes(condValue);
            break;
          case 'startsWith':
            matches = strValue.startsWith(condValue);
            break;
          case 'endsWith':
            matches = strValue.endsWith(condValue);
            break;
          case 'greaterThan':
            const numVal = parseFloat(String(cellValue));
            const numCond = parseFloat(condition.value);
            matches = !isNaN(numVal) && !isNaN(numCond) && numVal > numCond;
            break;
          case 'lessThan':
            const numVal2 = parseFloat(String(cellValue));
            const numCond2 = parseFloat(condition.value);
            matches = !isNaN(numVal2) && !isNaN(numCond2) && numVal2 < numCond2;
            break;
          case 'between':
            const numVal3 = parseFloat(String(cellValue));
            const numMin = parseFloat(condition.value);
            const numMax = parseFloat(condition.value2 || '');
            matches = !isNaN(numVal3) && !isNaN(numMin) && !isNaN(numMax) && numVal3 >= numMin && numVal3 <= numMax;
            break;
          case 'empty':
            matches = cellValue === null || cellValue === '' || cellValue === undefined;
            break;
          case 'notEmpty':
            matches = cellValue !== null && cellValue !== '' && cellValue !== undefined;
            break;
        }

        if (!matches) {
          shouldHide = true;
          break;
        }
      }

      if (shouldHide) {
        hidden.add(row.row_index);
      }
    }

    setHiddenRows(hidden);
  }, [currentSheet]);

  // 清除筛选
  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setColumnFilters(new Map());
    setHiddenRows(new Set());
  }, []);


  // ==================== 自动填充操作 ====================

  // 检测序列模式并生成填充值
  const detectAndFillPattern = useCallback((values: CellValue[], count: number): CellValue[] => {
    if (values.length === 0) return [];

    const result: CellValue[] = [];

    // 检测数字序列
    const numbers = values.map(v => typeof v === 'number' ? v : parseFloat(String(v)));
    if (numbers.every(n => !isNaN(n))) {
      // 计算差值
      if (numbers.length >= 2) {
        const diff = numbers[1] - numbers[0];
        let lastValue = numbers[numbers.length - 1];
        for (let i = 0; i < count; i++) {
          lastValue += diff;
          result.push(lastValue);
        }
        return result;
      } else {
        // 单个数字，递增 1
        let lastValue = numbers[0];
        for (let i = 0; i < count; i++) {
          lastValue += 1;
          result.push(lastValue);
        }
        return result;
      }
    }

    // 检测日期序列（简单实现）
    // TODO: 更复杂的日期检测

    // 默认：重复模式
    for (let i = 0; i < count; i++) {
      result.push(values[i % values.length]);
    }
    return result;
  }, []);

  // 自动填充
  const autoFill = useCallback((sourceRange: Selection, targetRange: Selection) => {
    if (!currentPayload || !currentSheet) return;

    const srcMinRow = Math.min(sourceRange.startRow, sourceRange.endRow);
    const srcMaxRow = Math.max(sourceRange.startRow, sourceRange.endRow);
    const srcMinCol = Math.min(sourceRange.startCol, sourceRange.endCol);
    const srcMaxCol = Math.max(sourceRange.startCol, sourceRange.endCol);

    const tgtMinRow = Math.min(targetRange.startRow, targetRange.endRow);
    const tgtMaxRow = Math.max(targetRange.startRow, targetRange.endRow);
    const tgtMinCol = Math.min(targetRange.startCol, targetRange.endCol);
    const tgtMaxCol = Math.max(targetRange.startCol, targetRange.endCol);

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    const rows = [...sheet.rows];

    // 判断填充方向
    const fillDown = tgtMaxRow > srcMaxRow;
    const fillRight = tgtMaxCol > srcMaxCol;
    const fillUp = tgtMinRow < srcMinRow;
    const fillLeft = tgtMinCol < srcMinCol;

    if (fillDown || fillUp) {
      // 垂直填充
      for (let col = srcMinCol; col <= srcMaxCol; col++) {
        // 获取源列的值
        const sourceValues: CellValue[] = [];
        for (let row = srcMinRow; row <= srcMaxRow; row++) {
          const rowData = rows.find(r => r.row_index === row);
          const cell = rowData?.cells.find(c => c.column_index === col);
          sourceValues.push(cell?.value ?? null);
        }

        // 计算需要填充的行数
        const fillCount = fillDown 
          ? tgtMaxRow - srcMaxRow 
          : srcMinRow - tgtMinRow;

        // 生成填充值
        const fillValues = detectAndFillPattern(sourceValues, fillCount);

        // 填充目标单元格
        const startRow = fillDown ? srcMaxRow + 1 : tgtMinRow;
        fillValues.forEach((value, i) => {
          const targetRow = startRow + i;
          let rowIndex = rows.findIndex(r => r.row_index === targetRow);
          let rowData: ExcelRow;

          if (rowIndex === -1) {
            rowData = { row_index: targetRow, cells: [] };
            rows.push(rowData);
            rowIndex = rows.length - 1;
          } else {
            rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
            rows[rowIndex] = rowData;
          }

          const cellIndex = rowData.cells.findIndex(c => c.column_index === col);
          const newCell: ExcelCell = {
            column_index: col,
            value,
            formula: null,
            style: null,
          };

          if (cellIndex === -1) {
            rowData.cells.push(newCell);
          } else {
            rowData.cells[cellIndex] = newCell;
          }
        });
      }
    }

    if (fillRight || fillLeft) {
      // 水平填充
      for (let row = srcMinRow; row <= srcMaxRow; row++) {
        // 获取源行的值
        const sourceValues: CellValue[] = [];
        for (let col = srcMinCol; col <= srcMaxCol; col++) {
          const rowData = rows.find(r => r.row_index === row);
          const cell = rowData?.cells.find(c => c.column_index === col);
          sourceValues.push(cell?.value ?? null);
        }

        // 计算需要填充的列数
        const fillCount = fillRight 
          ? tgtMaxCol - srcMaxCol 
          : srcMinCol - tgtMinCol;

        // 生成填充值
        const fillValues = detectAndFillPattern(sourceValues, fillCount);

        // 填充目标单元格
        const startCol = fillRight ? srcMaxCol + 1 : tgtMinCol;
        let rowIndex = rows.findIndex(r => r.row_index === row);
        let rowData: ExcelRow;

        if (rowIndex === -1) {
          rowData = { row_index: row, cells: [] };
          rows.push(rowData);
          rowIndex = rows.length - 1;
        } else {
          rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
          rows[rowIndex] = rowData;
        }

        fillValues.forEach((value, i) => {
          const targetCol = startCol + i;
          const cellIndex = rowData.cells.findIndex(c => c.column_index === targetCol);
          const newCell: ExcelCell = {
            column_index: targetCol,
            value,
            formula: null,
            style: null,
          };

          if (cellIndex === -1) {
            rowData.cells.push(newCell);
          } else {
            rowData.cells[cellIndex] = newCell;
          }
        });
      }
    }

    sheet.rows = rows;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, detectAndFillPattern, updatePayload]);


  // ==================== 复制粘贴操作 ====================

  // 将单元格数据转换为 TSV 格式（Tab 分隔，可以粘贴到 Excel）
  const cellsToTsv = useCallback((cells: ExcelCell[][]): string => {
    return cells.map(row => 
      row.map(cell => {
        const value = cell.value ?? '';
        // 如果值包含制表符或换行符，需要用引号包裹
        const strValue = String(value);
        if (strValue.includes('\t') || strValue.includes('\n') || strValue.includes('"')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      }).join('\t')
    ).join('\n');
  }, []);

  // 从 TSV 格式解析单元格数据
  const tsvToCells = useCallback((tsv: string): ExcelCell[][] => {
    const rows = tsv.split(/\r?\n/);
    return rows.map((row, rowIdx) => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (inQuotes) {
          if (char === '"' && row[i + 1] === '"') {
            current += '"';
            i++;
          } else if (char === '"') {
            inQuotes = false;
          } else {
            current += char;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
          } else if (char === '\t') {
            values.push(current);
            current = '';
          } else {
            current += char;
          }
        }
      }
      values.push(current);
      
      return values.map((value, colIdx) => {
        // 尝试转换为数字
        const numValue = parseFloat(value);
        const cellValue = !isNaN(numValue) && value.trim() !== '' ? numValue : (value || null);
        return {
          column_index: colIdx,
          value: cellValue,
          formula: null,
          style: null,
        };
      });
    });
  }, []);

  const copySelection = useCallback(async (overrideSelection?: Selection) => {
    const sel = overrideSelection || selection;
    if (!currentSheet || !sel) return;

    const minRow = Math.min(sel.startRow, sel.endRow);
    const maxRow = Math.max(sel.startRow, sel.endRow);
    const minCol = Math.min(sel.startCol, sel.endCol);
    const maxCol = Math.max(sel.startCol, sel.endCol);

    const cells: ExcelCell[][] = [];

    for (let row = minRow; row <= maxRow; row++) {
      const rowCells: ExcelCell[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        const cell = getCell(row, col);
        rowCells.push(cell ? { ...cell } : {
          column_index: col,
          value: null,
          formula: null,
          style: null,
        });
      }
      cells.push(rowCells);
    }

    // 保存到内部剪贴板（用于保留样式等信息）
    clipboardRef.current = {
      cells,
      startRow: minRow,
      startCol: minCol,
      isCut: false,
    };

    // 同时写入系统剪贴板（TSV 格式，兼容 Excel）
    const tsv = cellsToTsv(cells);
    try {
      await navigator.clipboard.writeText(tsv);
    } catch (err) {
      console.error('Failed to write to clipboard:', err);
    }
  }, [currentSheet, selection, getCell, cellsToTsv]);

  const cutSelection = useCallback(async (overrideSelection?: Selection) => {
    const sel = overrideSelection || selection;
    if (!currentSheet || !sel) return;

    await copySelection(sel);
    if (clipboardRef.current) {
      clipboardRef.current.isCut = true;
    }
  }, [currentSheet, selection, copySelection]);

  const pasteAtSelection = useCallback(async (overrideSelection?: Selection) => {
    const sel = overrideSelection || selection;
    if (!currentPayload || !currentSheet || !sel) return;

    const destStartRow = Math.min(sel.startRow, sel.endRow);
    const destStartCol = Math.min(sel.startCol, sel.endCol);

    let cells: ExcelCell[][];
    let srcStartRow: number;
    let srcStartCol: number;
    let isCut = false;

    // 先读取系统剪贴板
    let systemClipboardText = '';
    try {
      systemClipboardText = await navigator.clipboard.readText();
    } catch (err) {
      console.error('Failed to read from clipboard:', err);
    }

    // 检查内部剪贴板是否与系统剪贴板一致
    // 如果不一致，说明用户在其他地方复制了新内容，应该使用系统剪贴板
    if (clipboardRef.current) {
      const internalTsv = cellsToTsv(clipboardRef.current.cells);
      if (internalTsv === systemClipboardText) {
        // 内容一致，使用内部剪贴板（保留样式）
        cells = clipboardRef.current.cells;
        srcStartRow = clipboardRef.current.startRow;
        srcStartCol = clipboardRef.current.startCol;
        isCut = clipboardRef.current.isCut;
      } else {
        // 内容不一致，清除内部剪贴板，使用系统剪贴板
        clipboardRef.current = null;
        if (!systemClipboardText) return;
        cells = tsvToCells(systemClipboardText);
        srcStartRow = 0;
        srcStartCol = 0;
      }
    } else {
      // 没有内部剪贴板，使用系统剪贴板
      if (!systemClipboardText) return;
      cells = tsvToCells(systemClipboardText);
      srcStartRow = 0;
      srcStartCol = 0;
    }

    const rowOffset = destStartRow - srcStartRow;
    const colOffset = destStartCol - srcStartCol;

    const sheetIndex = currentPayload.active_sheet_index;
    const newSheets = [...currentPayload.sheets];
    const sheet = { ...newSheets[sheetIndex] };
    const rows = [...sheet.rows];

    // 粘贴单元格
    cells.forEach((rowCells, rowIdx) => {
      const destRow = destStartRow + rowIdx;

      rowCells.forEach((cell, colIdx) => {
        const destCol = destStartCol + colIdx;

        let rowIndex = rows.findIndex(r => r.row_index === destRow);
        let rowData: ExcelRow;

        if (rowIndex === -1) {
          rowData = { row_index: destRow, cells: [] };
          rows.push(rowData);
          rowIndex = rows.length - 1;
        } else {
          rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
          rows[rowIndex] = rowData;
        }

        // 调整公式中的相对引用
        let newFormula = cell.formula;
        if (newFormula && formulaEngine.isFormula(newFormula)) {
          newFormula = adjustFormulaReferences(newFormula, rowOffset, colOffset);
        }

        const newCell: ExcelCell = {
          column_index: destCol,
          value: cell.value,
          formula: newFormula,
          style: cell.style ? { ...cell.style } : null,
        };

        const cellIndex = rowData.cells.findIndex(c => c.column_index === destCol);
        if (cellIndex === -1) {
          rowData.cells.push(newCell);
        } else {
          rowData.cells[cellIndex] = newCell;
        }
      });
    });

    // 如果是剪切，清除源单元格
    if (isCut && clipboardRef.current) {
      cells.forEach((rowCells, rowIdx) => {
        const srcRow = srcStartRow + rowIdx;
        const rowIndex = rows.findIndex(r => r.row_index === srcRow);
        if (rowIndex !== -1) {
          const rowData = { ...rows[rowIndex], cells: [...rows[rowIndex].cells] };
          rows[rowIndex] = rowData;

          rowCells.forEach((_, colIdx) => {
            const srcCol = srcStartCol + colIdx;
            const cellIndex = rowData.cells.findIndex(c => c.column_index === srcCol);
            if (cellIndex !== -1) {
              rowData.cells.splice(cellIndex, 1);
            }
          });
        }
      });

      clipboardRef.current = null;
    }

    sheet.rows = rows;
    newSheets[sheetIndex] = sheet;

    const newPayload: ExcelNotePayload = {
      ...currentPayload,
      sheets: newSheets,
    };

    updatePayload(newPayload);
  }, [currentPayload, currentSheet, selection, updatePayload, tsvToCells]);

  // ==================== 撤销重做操作 ====================

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;

    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    setCurrentPayload(JSON.parse(JSON.stringify(entry.payload)));
    isDirtyRef.current = true;

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;

    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    setCurrentPayload(JSON.parse(JSON.stringify(entry.payload)));
    isDirtyRef.current = true;

    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // ==================== 初始化 ====================

  useEffect(() => {
    loadExcelNotes();
  }, [loadExcelNotes]);

  // 自动保存
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentNote && isDirtyRef.current) {
        saveCurrentNote();
      }
    }, 5000); // 每 5 秒自动保存

    return () => clearInterval(interval);
  }, [currentNote, saveCurrentNote]);

  return {
    excelNotes,
    currentNote,
    currentPayload,
    currentSheet,
    loading,
    error,
    canUndo,
    canRedo,
    selection,

    loadExcelNotes,
    createExcelNote,
    updateExcelNote,
    deleteExcelNote,
    selectExcelNote,

    addSheet,
    deleteSheet,
    renameSheet,
    selectSheet,
    reorderSheets,

    getCellValue,
    getCellDisplayValue,
    updateCell,
    updateCellStyle,
    updateCellRange,
    clearCellRange,

    insertRow,
    deleteRow,
    insertColumn,
    deleteColumn,
    setColumnWidth,
    setRowHeight,
    setFrozenRows,
    setFrozenColumns,

    setSelection,

    mergeCells,
    unmergeCells,
    isCellMerged,
    getMergedCellInfo,

    findInSheet,
    replaceInSheet,
    replaceAllInSheet,

    sortByColumn,
    sortBySelectedColumn,
    applyFilters,
    applyColumnFilter,
    clearFilters,
    activeFilters,
    hiddenRows,
    columnFilters,

    autoFill,

    copySelection,
    cutSelection,
    pasteAtSelection,

    undo,
    redo,

    saveCurrentNote,
  };
}

// 辅助函数：调整公式中的相对引用
function adjustFormulaReferences(formula: string, rowOffset: number, colOffset: number): string {
  // 简单实现：匹配单元格引用并调整
  return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (match, absCol, col, absRow, row) => {
    const colIndex = columnLetterToIndex(col.toUpperCase());
    const rowIndex = parseInt(row, 10) - 1;

    const newColIndex = absCol === '$' ? colIndex : colIndex + colOffset;
    const newRowIndex = absRow === '$' ? rowIndex : rowIndex + rowOffset;

    if (newColIndex < 0 || newRowIndex < 0) {
      return '#REF!';
    }

    return `${absCol}${indexToColumnLetter(newColIndex)}${absRow}${newRowIndex + 1}`;
  });
}

// 导入辅助函数
import { columnLetterToIndex, indexToColumnLetter } from '../../core/excel/FormulaEngine';
