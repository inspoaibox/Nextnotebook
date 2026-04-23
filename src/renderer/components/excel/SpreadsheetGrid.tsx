/**
 * 电子表格网格组件
 * 实现单元格渲染、选择、编辑功能
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ExcelSheet, ExcelCell, CellValue, CellStyle, NumberFormat, MergedCell } from '@shared/types';
import { FormulaEngine } from '@core/excel/FormulaEngine';
import { ColumnFilterDropdown, ColumnFilter } from './ColumnFilterDropdown';

interface SpreadsheetGridProps {
  sheet: ExcelSheet;
  formulaEngine: FormulaEngine;
  selectedCell: { row: number; col: number } | null;
  selectedRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  onCellSelect: (row: number, col: number) => void;
  onRangeSelect: (startRow: number, startCol: number, endRow: number, endCol: number) => void;
  onCellChange: (row: number, col: number, value: string) => void;
  onCellStyleChange: (row: number, col: number, style: Partial<CellStyle>) => void;
  onColumnWidthChange: (col: number, width: number) => void;
  onRowHeightChange: (row: number, height: number) => void;
  onClearRange?: (startRow: number, startCol: number, endRow: number, endCol: number) => void;
  getMergedCellInfo?: (row: number, col: number) => MergedCell | null;
  hiddenRows?: Set<number>;
  onAutoFill?: (sourceRange: { startRow: number; startCol: number; endRow: number; endCol: number }, targetRange: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  // 筛选相关
  columnFilters?: Map<number, ColumnFilter>;
  onColumnSort?: (column: number, order: 'asc' | 'desc') => void;
  onColumnFilter?: (column: number, filter: ColumnFilter | null) => void;
  showFilterButtons?: boolean;
}

const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 25;
const HEADER_WIDTH = 50;
const HEADER_HEIGHT = 25;
const VISIBLE_ROWS = 50;
const VISIBLE_COLS = 26;

// 列索引转字母
const colToLetter = (col: number): string => {
  let result = '';
  let n = col;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
};

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  sheet,
  formulaEngine,
  selectedCell,
  selectedRange,
  onCellSelect,
  onRangeSelect,
  onCellChange,
  onCellStyleChange,
  onColumnWidthChange,
  onRowHeightChange,
  onClearRange,
  getMergedCellInfo,
  hiddenRows = new Set(),
  onAutoFill,
  columnFilters,
  onColumnSort,
  onColumnFilter,
  showFilterButtons = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizingRow, setResizingRow] = useState<number | null>(null);
  // 用 ref 存储拖拽中间状态
  const resizingColRef = useRef<number | null>(null);
  const resizingRowRef = useRef<number | null>(null);
  // 本地临时宽度/高度，用于拖拽时的实时显示
  const [tempColWidths, setTempColWidths] = useState<Record<number, number>>({});
  const [tempRowHeights, setTempRowHeights] = useState<Record<number, number>>({});
  const tempColWidthsRef = useRef<Record<number, number>>({});
  const tempRowHeightsRef = useRef<Record<number, number>>({});

  // 用 ref 包装回调，避免闭包捕获旧引用
  const onColumnWidthChangeRef = useRef(onColumnWidthChange);
  const onRowHeightChangeRef = useRef(onRowHeightChange);
  useEffect(() => { onColumnWidthChangeRef.current = onColumnWidthChange; }, [onColumnWidthChange]);
  useEffect(() => { onRowHeightChangeRef.current = onRowHeightChange; }, [onRowHeightChange]);
  
  // 行/列头拖拽选择状态
  const [isSelectingRows, setIsSelectingRows] = useState(false);
  const [isSelectingCols, setIsSelectingCols] = useState(false);
  const [rowSelectionStart, setRowSelectionStart] = useState<number | null>(null);
  const [colSelectionStart, setColSelectionStart] = useState<number | null>(null);
  
  // 自动填充拖拽状态
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillTarget, setAutoFillTarget] = useState<{ row: number; col: number } | null>(null);
  
  // 是否正在编辑公式（以 = 开头）
  const isEditingFormula = editValue.startsWith('=');

  // 构建单元格数据映射
  const cellMap = useMemo(() => {
    const map = new Map<string, ExcelCell>();
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        map.set(`${row.row_index},${cell.column_index}`, cell);
      }
    }
    return map;
  }, [sheet.rows]);

  // 获取单元格
  const getCell = useCallback((row: number, col: number): ExcelCell | undefined => {
    return cellMap.get(`${row},${col}`);
  }, [cellMap]);

  // 获取某列的所有值（用于筛选下拉）
  const getColumnValues = useCallback((col: number): CellValue[] => {
    const values: CellValue[] = [];
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const cell = cellMap.get(`${row},${col}`);
      values.push(cell?.value ?? null);
    }
    return values;
  }, [cellMap]);

  // 获取列宽（优先使用临时值）
  const getColWidth = useCallback((col: number): number => {
    if (tempColWidths[col] !== undefined) {
      return tempColWidths[col];
    }
    return sheet.column_widths[col] || DEFAULT_COL_WIDTH;
  }, [sheet.column_widths, tempColWidths]);

  // 获取行高（优先使用临时值）
  const getRowHeight = useCallback((row: number): number => {
    if (tempRowHeights[row] !== undefined) {
      return tempRowHeights[row];
    }
    return sheet.row_heights[row] || DEFAULT_ROW_HEIGHT;
  }, [sheet.row_heights, tempRowHeights]);

  // 格式化单元格显示值
  const formatCellValue = useCallback((cell: ExcelCell | undefined): string => {
    if (!cell) return '';
    
    // 如果有公式，计算结果
    if (cell.formula) {
      const getCellValueForFormula = (ref: { row: number; column: number }) => {
        const refCell = getCell(ref.row, ref.column);
        return refCell?.value ?? null;
      };
      const result = formulaEngine.evaluate(cell.formula, getCellValueForFormula);
      if (result.error) return result.error;
      return formatValue(result.value, cell.style?.number_format);
    }
    
    return formatValue(cell.value, cell.style?.number_format);
  }, [formulaEngine, getCell]);

  // 格式化值
  const formatValue = (value: CellValue, format?: NumberFormat | null): string => {
    if (value === null || value === undefined) return '';
    
    if (typeof value === 'number') {
      if (!format) return String(value);
      switch (format.type) {
        case 'percentage':
          return `${(value * 100).toFixed(format.decimals)}%`;
        case 'currency':
          return `${format.symbol}${value.toFixed(format.decimals)}`;
        case 'number':
          return value.toLocaleString(undefined, { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals });
        default:
          return String(value);
      }
    }
    
    return String(value);
  };

  // 获取单元格样式（只返回字体和颜色相关样式，对齐由内容 div 的 flexbox 控制）
  const getCellStyle = useCallback((cell: ExcelCell | undefined): React.CSSProperties => {
    const style = cell?.style;
    return {
      fontWeight: style?.font_bold ? 'bold' : 'normal',
      fontStyle: style?.font_italic ? 'italic' : 'normal',
      color: style?.font_color || '#000',
      backgroundColor: style?.background_color || 'transparent',
    };
  }, []);

  // 判断单元格是否在当前选择范围内
  const isCellInSelection = useCallback((row: number, col: number): boolean => {
    if (selectedRange) {
      return (
        row >= selectedRange.startRow &&
        row <= selectedRange.endRow &&
        col >= selectedRange.startCol &&
        col <= selectedRange.endCol
      );
    }
    if (selectedCell) {
      return selectedCell.row === row && selectedCell.col === col;
    }
    return false;
  }, [selectedCell, selectedRange]);

  // 判断单元格是否在自动填充目标范围内
  const isCellInAutoFillTarget = useCallback((row: number, col: number): boolean => {
    if (!isAutoFilling || !autoFillTarget) return false;
    
    const sourceRange = selectedRange || (selectedCell ? {
      startRow: selectedCell.row,
      startCol: selectedCell.col,
      endRow: selectedCell.row,
      endCol: selectedCell.col,
    } : null);
    
    if (!sourceRange) return false;
    
    const targetRow = autoFillTarget.row;
    const targetCol = autoFillTarget.col;
    
    // 向下填充
    if (targetRow > sourceRange.endRow && 
        col >= sourceRange.startCol && col <= sourceRange.endCol &&
        row > sourceRange.endRow && row <= targetRow) {
      return true;
    }
    // 向上填充
    if (targetRow < sourceRange.startRow && 
        col >= sourceRange.startCol && col <= sourceRange.endCol &&
        row < sourceRange.startRow && row >= targetRow) {
      return true;
    }
    // 向右填充
    if (targetCol > sourceRange.endCol && 
        row >= sourceRange.startRow && row <= sourceRange.endRow &&
        col > sourceRange.endCol && col <= targetCol) {
      return true;
    }
    // 向左填充
    if (targetCol < sourceRange.startCol && 
        row >= sourceRange.startRow && row <= sourceRange.endRow &&
        col < sourceRange.startCol && col >= targetCol) {
      return true;
    }
    
    return false;
  }, [isAutoFilling, autoFillTarget, selectedRange, selectedCell]);

  // 处理单元格点击 - 单击选中，双击编辑，公式模式下插入引用
  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    // 如果正在编辑公式，点击其他单元格插入引用
    if (editingCell && isEditingFormula && (row !== editingCell.row || col !== editingCell.col)) {
      const cellRef = `${colToLetter(col)}${row + 1}`;
      setEditValue(prev => prev + cellRef);
      // 保持焦点在输入框
      inputRef.current?.focus();
      return;
    }
    
    if (e.shiftKey && selectedCell) {
      // Shift+点击选择范围
      onRangeSelect(
        Math.min(selectedCell.row, row),
        Math.min(selectedCell.col, col),
        Math.max(selectedCell.row, row),
        Math.max(selectedCell.col, col)
      );
    } else {
      onCellSelect(row, col);
      // 单击只选中，不进入编辑模式
    }
  }, [selectedCell, onCellSelect, onRangeSelect, editingCell, isEditingFormula]);

  // 处理右键菜单 - 如果点击的单元格在选择范围内，保持选择
  const handleContextMenu = useCallback((row: number, col: number, e: React.MouseEvent) => {
    // 如果右键点击的单元格在当前选择范围内，不改变选择
    if (isCellInSelection(row, col)) {
      // 保持当前选择，不做任何改变
      return;
    }
    // 如果点击的单元格不在选择范围内，选中该单元格
    onCellSelect(row, col);
  }, [isCellInSelection, onCellSelect]);

  // 处理双击编辑
  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    const cell = getCell(row, col);
    setEditingCell({ row, col });
    setEditValue(cell?.formula || String(cell?.value ?? ''));
  }, [getCell]);

  // 处理编辑完成 - 回车后跳转到下一行
  const handleEditComplete = useCallback((moveToNextRow: boolean = false) => {
    if (editingCell) {
      onCellChange(editingCell.row, editingCell.col, editValue);
      const currentRow = editingCell.row;
      const currentCol = editingCell.col;
      setEditingCell(null);
      setEditValue('');
      
      // 如果需要跳转到下一行
      if (moveToNextRow) {
        const nextRow = currentRow + 1;
        onCellSelect(nextRow, currentCol);
        // 自动进入下一个单元格的编辑模式
        const nextCell = getCell(nextRow, currentCol);
        setEditingCell({ row: nextRow, col: currentCol });
        setEditValue(nextCell?.formula || String(nextCell?.value ?? ''));
      }
    }
  }, [editingCell, editValue, onCellChange, onCellSelect, getCell]);

  // 处理编辑取消
  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+A 全选 - 即使没有选中单元格也可以触发
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      onRangeSelect(0, 0, VISIBLE_ROWS - 1, VISIBLE_COLS - 1);
      return;
    }

    if (!selectedCell) return;

    if (editingCell) {
      // 编辑模式下的键盘处理由 input 的 onKeyDown 处理
      return;
    }

    const { row, col } = selectedCell;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (row > 0) {
          onCellSelect(row - 1, col);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        onCellSelect(row + 1, col);
        break;
      case 'Enter':
        e.preventDefault();
        // 非编辑模式下回车进入编辑
        {
          const cell = getCell(row, col);
          setEditingCell({ row, col });
          setEditValue(cell?.formula || String(cell?.value ?? ''));
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (col > 0) {
          onCellSelect(row, col - 1);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        onCellSelect(row, col + 1);
        break;
      case 'Tab':
        e.preventDefault();
        onCellSelect(row, col + 1);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        // 如果有选择范围，清除范围内所有单元格
        if (selectedRange && onClearRange) {
          onClearRange(
            selectedRange.startRow,
            selectedRange.startCol,
            selectedRange.endRow,
            selectedRange.endCol
          );
        } else {
          onCellChange(row, col, '');
        }
        break;
      case 'F2':
        e.preventDefault();
        handleCellDoubleClick(row, col);
        break;
      default:
        // 直接输入开始编辑
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setEditingCell({ row, col });
          setEditValue(e.key);
        }
    }
  }, [selectedCell, editingCell, onCellSelect, onCellChange, onRangeSelect, handleCellDoubleClick, getCell]);

  // 处理鼠标按下（开始选择）
  const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsSelecting(true);
    setSelectionStart({ row, col });
    handleCellClick(row, col, e);
  }, [handleCellClick]);

  // 处理鼠标移动（选择范围或自动填充）
  const handleMouseMove = useCallback((row: number, col: number) => {
    // 如果正在 resize，不处理单元格选择
    if (resizingColRef.current !== null || resizingRowRef.current !== null) return;

    if (isAutoFilling) {
      // 自动填充拖拽时更新目标位置
      setAutoFillTarget({ row, col });
    } else if (isSelecting && selectionStart) {
      onRangeSelect(
        Math.min(selectionStart.row, row),
        Math.min(selectionStart.col, col),
        Math.max(selectionStart.row, row),
        Math.max(selectionStart.col, col)
      );
    }
  }, [isSelecting, selectionStart, onRangeSelect, isAutoFilling]);

  // 处理鼠标释放
  const handleMouseUp = useCallback(() => {
    // 如果正在 resize，交给 document mouseup 处理，这里不干预
    if (resizingColRef.current !== null || resizingRowRef.current !== null) return;

    // 处理自动填充完成
    if (isAutoFilling && autoFillTarget && onAutoFill) {
      const sourceRange = selectedRange || (selectedCell ? {
        startRow: selectedCell.row,
        startCol: selectedCell.col,
        endRow: selectedCell.row,
        endCol: selectedCell.col,
      } : null);
      
      if (sourceRange) {
        // 确定填充方向和目标范围
        const targetRow = autoFillTarget.row;
        const targetCol = autoFillTarget.col;
        
        let targetRange: { startRow: number; startCol: number; endRow: number; endCol: number };
        
        if (targetRow > sourceRange.endRow) {
          // 向下填充
          targetRange = {
            startRow: sourceRange.endRow + 1,
            startCol: sourceRange.startCol,
            endRow: targetRow,
            endCol: sourceRange.endCol,
          };
        } else if (targetRow < sourceRange.startRow) {
          // 向上填充
          targetRange = {
            startRow: targetRow,
            startCol: sourceRange.startCol,
            endRow: sourceRange.startRow - 1,
            endCol: sourceRange.endCol,
          };
        } else if (targetCol > sourceRange.endCol) {
          // 向右填充
          targetRange = {
            startRow: sourceRange.startRow,
            startCol: sourceRange.endCol + 1,
            endRow: sourceRange.endRow,
            endCol: targetCol,
          };
        } else if (targetCol < sourceRange.startCol) {
          // 向左填充
          targetRange = {
            startRow: sourceRange.startRow,
            startCol: targetCol,
            endRow: sourceRange.endRow,
            endCol: sourceRange.startCol - 1,
          };
        } else {
          targetRange = sourceRange;
        }
        
        if (targetRange.startRow !== sourceRange.startRow || 
            targetRange.startCol !== sourceRange.startCol ||
            targetRange.endRow !== sourceRange.endRow ||
            targetRange.endCol !== sourceRange.endCol) {
          onAutoFill(sourceRange, targetRange);
        }
      }
    }
    
    setIsAutoFilling(false);
    setAutoFillTarget(null);
    setIsSelecting(false);
    setSelectionStart(null);
    setIsSelectingRows(false);
    setIsSelectingCols(false);
    setRowSelectionStart(null);
    setColSelectionStart(null);
  }, [isAutoFilling, autoFillTarget, onAutoFill, selectedRange, selectedCell]);

  // 判断单元格是否被选中
  const isCellSelected = useCallback((row: number, col: number): boolean => {
    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
      return true;
    }
    if (selectedRange) {
      return (
        row >= selectedRange.startRow &&
        row <= selectedRange.endRow &&
        col >= selectedRange.startCol &&
        col <= selectedRange.endCol
      );
    }
    return false;
  }, [selectedCell, selectedRange]);

  // 判断是否是冻结区域
  const isFrozen = useCallback((row: number, col: number): boolean => {
    return row < sheet.frozen_rows || col < sheet.frozen_columns;
  }, [sheet.frozen_rows, sheet.frozen_columns]);

  // 检查单元格是否是合并区域的起始单元格
  const isMergedCellStart = useCallback((row: number, col: number): MergedCell | null => {
    if (!getMergedCellInfo) return null;
    const merged = getMergedCellInfo(row, col);
    if (merged && merged.start_row === row && merged.start_col === col) {
      return merged;
    }
    return null;
  }, [getMergedCellInfo]);

  // 检查单元格是否应该被隐藏（是合并区域的非起始单元格）
  const isMergedCellHidden = useCallback((row: number, col: number): boolean => {
    if (!getMergedCellInfo) return false;
    const merged = getMergedCellInfo(row, col);
    if (merged && (merged.start_row !== row || merged.start_col !== col)) {
      return true;
    }
    return false;
  }, [getMergedCellInfo]);

  // 计算合并单元格的宽度
  const getMergedCellWidth = useCallback((merged: MergedCell): number => {
    let width = 0;
    for (let col = merged.start_col; col <= merged.end_col; col++) {
      width += getColWidth(col);
    }
    return width;
  }, [getColWidth]);

  // 计算合并单元格的高度
  const getMergedCellHeight = useCallback((merged: MergedCell): number => {
    let height = 0;
    for (let row = merged.start_row; row <= merged.end_row; row++) {
      height += getRowHeight(row);
    }
    return height;
  }, [getRowHeight]);

  // 点击列头选择整列（支持拖拽选择多列）
  const handleColumnHeaderMouseDown = useCallback((col: number, e: React.MouseEvent) => {
    // 只处理左键点击，右键由 onContextMenu 处理
    if (e.button !== 0) return;
    
    // 如果点击的是调整手柄区域，不触发选择
    const target = e.target as HTMLElement;
    if (target.style.cursor === 'col-resize') return;
    
    e.preventDefault();
    setIsSelectingCols(true);
    setColSelectionStart(col);
    onCellSelect(0, col);
    onRangeSelect(0, col, VISIBLE_ROWS - 1, col);
  }, [onCellSelect, onRangeSelect]);

  // 列头鼠标移动（拖拽选择多列）
  const handleColumnHeaderMouseEnter = useCallback((col: number) => {
    if (isSelectingCols && colSelectionStart !== null) {
      const startCol = Math.min(colSelectionStart, col);
      const endCol = Math.max(colSelectionStart, col);
      onRangeSelect(0, startCol, VISIBLE_ROWS - 1, endCol);
    }
  }, [isSelectingCols, colSelectionStart, onRangeSelect]);

  // 点击行头选择整行（支持拖拽选择多行）
  const handleRowHeaderMouseDown = useCallback((row: number, e: React.MouseEvent) => {
    // 只处理左键点击，右键由 onContextMenu 处理
    if (e.button !== 0) return;
    
    // 如果点击的是调整手柄区域，不触发选择
    const target = e.target as HTMLElement;
    if (target.style.cursor === 'row-resize') return;
    
    e.preventDefault();
    setIsSelectingRows(true);
    setRowSelectionStart(row);
    onCellSelect(row, 0);
    onRangeSelect(row, 0, row, VISIBLE_COLS - 1);
  }, [onCellSelect, onRangeSelect]);

  // 行头鼠标移动（拖拽选择多行）
  const handleRowHeaderMouseEnter = useCallback((row: number) => {
    if (isSelectingRows && rowSelectionStart !== null) {
      const startRow = Math.min(rowSelectionStart, row);
      const endRow = Math.max(rowSelectionStart, row);
      onRangeSelect(startRow, 0, endRow, VISIBLE_COLS - 1);
    }
  }, [isSelectingRows, rowSelectionStart, onRangeSelect]);

  // 计算列的最佳宽度（根据内容自适应）
  const calculateOptimalColWidth = useCallback((col: number): number => {
    let maxWidth = 50; // 最小宽度
    
    // 遍历所有行，找到该列最宽的内容
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const cell = getCell(row, col);
      if (cell) {
        const displayValue = formatCellValue(cell);
        if (displayValue) {
          // 估算文本宽度（每个字符约 8px，中文约 14px）
          const charWidth = displayValue.split('').reduce((width, char) => {
            return width + (char.charCodeAt(0) > 127 ? 14 : 8);
          }, 0);
          maxWidth = Math.max(maxWidth, charWidth + 16); // 加上 padding
        }
      }
    }
    
    // 也考虑列头的宽度
    const headerText = colToLetter(col);
    const headerWidth = headerText.length * 10 + 20;
    maxWidth = Math.max(maxWidth, headerWidth);
    
    return Math.min(maxWidth, 400); // 最大宽度限制
  }, [getCell, formatCellValue]);

  // 计算行的最佳高度（根据内容自适应）
  const calculateOptimalRowHeight = useCallback((row: number): number => {
    let maxHeight = DEFAULT_ROW_HEIGHT;
    
    // 遍历该行所有列，检查是否有多行内容
    for (let col = 0; col < VISIBLE_COLS; col++) {
      const cell = getCell(row, col);
      if (cell) {
        const displayValue = formatCellValue(cell);
        if (displayValue) {
          // 检查是否有换行符
          const lines = displayValue.split('\n').length;
          const lineHeight = 20;
          const neededHeight = lines * lineHeight + 5;
          maxHeight = Math.max(maxHeight, neededHeight);
        }
      }
    }
    
    return Math.min(maxHeight, 200); // 最大高度限制
  }, [getCell, formatCellValue]);

  // 双击列边框自适应宽度
  const handleColResizeDoubleClick = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const optimalWidth = calculateOptimalColWidth(col);
    onColumnWidthChange(col, optimalWidth);
  }, [calculateOptimalColWidth, onColumnWidthChange]);

  // 双击行边框自适应高度
  const handleRowResizeDoubleClick = useCallback((row: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const optimalHeight = calculateOptimalRowHeight(row);
    onRowHeightChange(row, optimalHeight);
  }, [calculateOptimalRowHeight, onRowHeightChange]);

  // 点击左上角全选
  const handleSelectAll = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onRangeSelect(0, 0, VISIBLE_ROWS - 1, VISIBLE_COLS - 1);
  }, [onRangeSelect]);

  // 开始调整列宽
  const handleColResizeStart = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startWidth = sheet.column_widths[col] || DEFAULT_COL_WIDTH;

    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      const delta = ev.clientX - startX;
      const newWidth = Math.max(30, startWidth + delta);
      tempColWidthsRef.current = { [col]: newWidth };
      setTempColWidths({ [col]: newWidth });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      const w = tempColWidthsRef.current[col];
      if (w !== undefined) {
        onColumnWidthChangeRef.current(col, w);
      }
      tempColWidthsRef.current = {};
      setTempColWidths({});
      setResizingCol(null);
    };

    setResizingCol(col);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  }, [sheet.column_widths]);

  // 开始调整行高
  const handleRowResizeStart = useCallback((row: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = sheet.row_heights[row] || DEFAULT_ROW_HEIGHT;

    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      const delta = ev.clientY - startY;
      const newHeight = Math.max(20, startHeight + delta);
      tempRowHeightsRef.current = { [row]: newHeight };
      setTempRowHeights({ [row]: newHeight });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      const h = tempRowHeightsRef.current[row];
      if (h !== undefined) {
        onRowHeightChangeRef.current(row, h);
      }
      tempRowHeightsRef.current = {};
      setTempRowHeights({});
      setResizingRow(null);
    };

    setResizingRow(row);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  }, [sheet.row_heights]);

  return (
    <div
      ref={containerRef}
      className="spreadsheet-grid"
      style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        outline: 'none',
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <table style={{
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        userSelect: 'none',
      }}>
        {/* 列头 */}
        <thead>
          <tr>
            <th 
              style={{
                width: HEADER_WIDTH,
                height: HEADER_HEIGHT,
                background: selectedRange && 
                  selectedRange.startRow === 0 && 
                  selectedRange.endRow === VISIBLE_ROWS - 1 &&
                  selectedRange.startCol === 0 &&
                  selectedRange.endCol === VISIBLE_COLS - 1 
                    ? '#bae7ff' : '#f5f5f5',
                border: '1px solid #d9d9d9',
                position: 'sticky',
                top: 0,
                left: 0,
                zIndex: 3,
                cursor: 'pointer',
              }}
              onClick={handleSelectAll}
              title="全选 (Ctrl+A)"
            />
            {Array.from({ length: VISIBLE_COLS }, (_, col) => {
              // 判断整列是否被选中
              const isColSelected = selectedRange && 
                selectedRange.startCol <= col && 
                selectedRange.endCol >= col &&
                selectedRange.startRow === 0 &&
                selectedRange.endRow === VISIBLE_ROWS - 1;
              
              return (
                <th
                  key={col}
                  style={{
                    width: getColWidth(col),
                    height: HEADER_HEIGHT,
                    background: isColSelected ? '#bae7ff' : '#f5f5f5',
                    border: '1px solid #d9d9d9',
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    fontSize: 12,
                    fontWeight: 'normal',
                    color: '#666',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                  onMouseDown={(e) => handleColumnHeaderMouseDown(col, e)}
                  onMouseEnter={() => handleColumnHeaderMouseEnter(col)}
                  onContextMenu={(e) => {
                    // 如果右键点击的列在当前选择范围内，保持选择，不做任何操作
                    if (selectedRange && col >= selectedRange.startCol && col <= selectedRange.endCol) {
                      // 不调用任何选择函数，保持当前选择
                      return;
                    }
                    // 否则选中该列（不调用 onCellSelect，直接调用 onRangeSelect）
                    onRangeSelect(0, col, VISIBLE_ROWS - 1, col);
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {colToLetter(col)}
                    {/* 列宽调整手柄 */}
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        width: 5,
                        height: '100%',
                        cursor: 'col-resize',
                        background: resizingCol === col ? '#1890ff' : 'transparent',
                      }}
                      onMouseDown={(e) => handleColResizeStart(col, e)}
                      onDoubleClick={(e) => handleColResizeDoubleClick(col, e)}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.background = '#1890ff';
                      }}
                      onMouseLeave={(e) => {
                        if (resizingCol !== col) {
                          (e.target as HTMLElement).style.background = 'transparent';
                        }
                      }}
                    />
                    {/* 筛选下拉按钮 */}
                    {showFilterButtons && onColumnSort && onColumnFilter && (
                      <ColumnFilterDropdown
                        column={col}
                        columnValues={getColumnValues(col)}
                        currentFilter={columnFilters?.get(col)}
                        onSort={onColumnSort}
                        onFilter={(filter) => onColumnFilter(col, filter)}
                      />
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: VISIBLE_ROWS }, (_, row) => {
            // 如果行被隐藏（筛选），跳过渲染
            if (hiddenRows.has(row)) {
              return null;
            }
            
            return (
            <tr key={row}>
              {/* 行头 */}
              {(() => {
                // 判断整行是否被选中
                const isRowSelected = selectedRange && 
                  selectedRange.startRow <= row && 
                  selectedRange.endRow >= row &&
                  selectedRange.startCol === 0 &&
                  selectedRange.endCol === VISIBLE_COLS - 1;
                
                return (
                  <td 
                    style={{
                      width: HEADER_WIDTH,
                      height: getRowHeight(row),
                      background: isRowSelected ? '#bae7ff' : '#f5f5f5',
                      border: '1px solid #d9d9d9',
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#666',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                    onMouseDown={(e) => handleRowHeaderMouseDown(row, e)}
                    onMouseEnter={() => handleRowHeaderMouseEnter(row)}
                    onContextMenu={(e) => {
                      // 如果右键点击的行在当前选择范围内，保持选择，不做任何操作
                      if (selectedRange && row >= selectedRange.startRow && row <= selectedRange.endRow) {
                        // 不调用任何选择函数，保持当前选择
                        return;
                      }
                      // 否则选中该行（不调用 onCellSelect，直接调用 onRangeSelect）
                      onRangeSelect(row, 0, row, VISIBLE_COLS - 1);
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {row + 1}
                      {/* 行高调整手柄 */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          width: '100%',
                          height: 5,
                          cursor: 'row-resize',
                          background: resizingRow === row ? '#1890ff' : 'transparent',
                        }}
                        onMouseDown={(e) => handleRowResizeStart(row, e)}
                        onDoubleClick={(e) => handleRowResizeDoubleClick(row, e)}
                        onMouseEnter={(e) => {
                          (e.target as HTMLElement).style.background = '#1890ff';
                        }}
                        onMouseLeave={(e) => {
                          if (resizingRow !== row) {
                            (e.target as HTMLElement).style.background = 'transparent';
                          }
                        }}
                      />
                    </div>
                  </td>
                );
              })()}
              {/* 数据单元格 */}
              {Array.from({ length: VISIBLE_COLS }, (_, col) => {
                // 检查是否是合并单元格的隐藏部分
                if (isMergedCellHidden(row, col)) {
                  return null; // 不渲染被合并的单元格
                }

                const cell = getCell(row, col);
                const isEditing = editingCell?.row === row && editingCell?.col === col;
                const isSelected = isCellSelected(row, col);
                const isAutoFillTarget = isCellInAutoFillTarget(row, col);
                const frozen = isFrozen(row, col);
                
                // 检查是否是合并单元格的起始位置
                const mergedInfo = isMergedCellStart(row, col);
                const colSpan = mergedInfo ? mergedInfo.end_col - mergedInfo.start_col + 1 : 1;
                const rowSpan = mergedInfo ? mergedInfo.end_row - mergedInfo.start_row + 1 : 1;
                
                // 计算合并单元格的尺寸
                const cellWidth = mergedInfo ? getMergedCellWidth(mergedInfo) : getColWidth(col);
                const cellHeight = mergedInfo ? getMergedCellHeight(mergedInfo) : getRowHeight(row);

                return (
                  <td
                    key={col}
                    colSpan={colSpan}
                    rowSpan={rowSpan}
                    style={{
                      width: cellWidth,
                      height: cellHeight,
                      border: isAutoFillTarget ? '1px dashed #1890ff' : '1px solid #e8e8e8',
                      padding: 0,
                      position: frozen ? 'sticky' : 'relative',
                      left: frozen && col < sheet.frozen_columns ? HEADER_WIDTH + col * getColWidth(col) : undefined,
                      top: frozen && row < sheet.frozen_rows ? HEADER_HEIGHT + row * getRowHeight(row) : undefined,
                      zIndex: frozen ? 1 : 0,
                      background: isAutoFillTarget ? '#f0f9ff' : (isSelected ? '#e6f7ff' : (frozen ? '#fafafa' : '#fff')),
                      boxShadow: isSelected && selectedCell?.row === row && selectedCell?.col === col
                        ? 'inset 0 0 0 2px #1890ff'
                        : undefined,
                      ...getCellStyle(cell),
                    }}
                    onMouseDown={(e) => {
                      // 如果正在编辑公式且点击其他单元格，阻止默认行为以防止 blur
                      if (editingCell && isEditingFormula && (row !== editingCell.row || col !== editingCell.col)) {
                        e.preventDefault();
                      }
                      handleMouseDown(row, col, e);
                    }}
                    onMouseMove={() => handleMouseMove(row, col)}
                    onDoubleClick={() => handleCellDoubleClick(row, col)}
                    onContextMenu={(e) => handleContextMenu(row, col, e)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={(e) => {
                          // 检查是否点击了表格内的其他单元格
                          const relatedTarget = e.relatedTarget as HTMLElement;
                          const isClickingCell = relatedTarget?.closest?.('.spreadsheet-grid td');
                          
                          // 如果正在编辑公式且点击的是表格内单元格，不触发完成（由 handleCellClick 处理）
                          if (isEditingFormula && isClickingCell) {
                            return;
                          }
                          
                          // 其他情况（点击表格外部或非公式模式）完成编辑
                          handleEditComplete(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditComplete(true); // 回车跳转下一行
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditCancel();
                          } else if (e.key === 'Tab') {
                            e.preventDefault();
                            e.stopPropagation();
                            // Tab 跳转到下一列
                            onCellChange(row, col, editValue);
                            const nextCol = col + 1;
                            onCellSelect(row, nextCol);
                            const nextCell = getCell(row, nextCol);
                            setEditingCell({ row, col: nextCol });
                            setEditValue(nextCell?.formula || String(nextCell?.value ?? ''));
                          }
                          // 不要阻止其他按键的传播，让输入正常工作
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          outline: 'none',
                          padding: '2px 4px',
                          fontSize: 13,
                          boxSizing: 'border-box',
                          background: 'transparent',
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        padding: '2px 4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: cell?.style?.vertical_align === 'top' ? 'flex-start' : 
                                   cell?.style?.vertical_align === 'bottom' ? 'flex-end' : 'center',
                        justifyContent: cell?.style?.text_align === 'center' ? 'center' : 
                                       cell?.style?.text_align === 'right' ? 'flex-end' : 'flex-start',
                        boxSizing: 'border-box',
                      }}>
                        <span style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {formatCellValue(cell)}
                        </span>
                      </div>
                    )}
                    {/* 自动填充手柄 - 显示在选择范围的右下角单元格 */}
                    {!isEditing && onAutoFill && (
                      (selectedRange 
                        ? (row === selectedRange.endRow && col === selectedRange.endCol)
                        : (selectedCell?.row === row && selectedCell?.col === col)
                      ) && (
                        <div
                          className="auto-fill-handle"
                          style={{
                            position: 'absolute',
                            right: -3,
                            bottom: -3,
                            width: 6,
                            height: 6,
                            background: '#1890ff',
                            cursor: 'crosshair',
                            zIndex: 10,
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsAutoFilling(true);
                            setAutoFillTarget({ row, col });
                          }}
                        />
                      )
                    )}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
