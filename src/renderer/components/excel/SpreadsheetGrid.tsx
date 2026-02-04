/**
 * 电子表格网格组件
 * 实现单元格渲染、选择、编辑功能
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ExcelSheet, ExcelCell, CellValue, CellStyle, NumberFormat } from '@shared/types';
import { FormulaEngine } from '@core/excel/FormulaEngine';

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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizingRow, setResizingRow] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [resizeStartHeight, setResizeStartHeight] = useState(0);
  // 本地临时宽度/高度，用于拖拽时的实时显示
  const [tempColWidths, setTempColWidths] = useState<Record<number, number>>({});
  const [tempRowHeights, setTempRowHeights] = useState<Record<number, number>>({});
  
  // 行/列头拖拽选择状态
  const [isSelectingRows, setIsSelectingRows] = useState(false);
  const [isSelectingCols, setIsSelectingCols] = useState(false);
  const [rowSelectionStart, setRowSelectionStart] = useState<number | null>(null);
  const [colSelectionStart, setColSelectionStart] = useState<number | null>(null);
  
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

  // 获取单元格样式
  const getCellStyle = useCallback((cell: ExcelCell | undefined): React.CSSProperties => {
    const style = cell?.style;
    return {
      fontWeight: style?.font_bold ? 'bold' : 'normal',
      fontStyle: style?.font_italic ? 'italic' : 'normal',
      color: style?.font_color || '#000',
      backgroundColor: style?.background_color || 'transparent',
      textAlign: (style?.text_align as any) || 'left',
      verticalAlign: style?.vertical_align || 'middle',
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

  // 处理鼠标移动（选择范围）
  const handleMouseMove = useCallback((row: number, col: number) => {
    if (isSelecting && selectionStart) {
      onRangeSelect(
        Math.min(selectionStart.row, row),
        Math.min(selectionStart.col, col),
        Math.max(selectionStart.row, row),
        Math.max(selectionStart.col, col)
      );
    }
  }, [isSelecting, selectionStart, onRangeSelect]);

  // 处理鼠标释放
  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionStart(null);
    setIsSelectingRows(false);
    setIsSelectingCols(false);
    setRowSelectionStart(null);
    setColSelectionStart(null);
  }, []);

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

  // 开始调整列宽
  const handleColResizeStart = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(col);
    setResizeStartX(e.clientX);
    const currentWidth = sheet.column_widths[col] || DEFAULT_COL_WIDTH;
    setResizeStartWidth(currentWidth);
  }, [sheet.column_widths]);

  // 开始调整行高
  const handleRowResizeStart = useCallback((row: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingRow(row);
    setResizeStartY(e.clientY);
    const currentHeight = sheet.row_heights[row] || DEFAULT_ROW_HEIGHT;
    setResizeStartHeight(currentHeight);
  }, [sheet.row_heights]);

  // 处理调整大小的鼠标移动
  useEffect(() => {
    if (resizingCol === null && resizingRow === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (resizingCol !== null) {
        const delta = e.clientX - resizeStartX;
        const newWidth = Math.max(30, resizeStartWidth + delta);
        // 使用本地状态实时更新显示
        setTempColWidths(prev => ({ ...prev, [resizingCol]: newWidth }));
      }
      if (resizingRow !== null) {
        const delta = e.clientY - resizeStartY;
        const newHeight = Math.max(20, resizeStartHeight + delta);
        // 使用本地状态实时更新显示
        setTempRowHeights(prev => ({ ...prev, [resizingRow]: newHeight }));
      }
    };

    const handleMouseUp = () => {
      // 拖拽结束时，提交最终值到父组件
      if (resizingCol !== null && tempColWidths[resizingCol] !== undefined) {
        onColumnWidthChange(resizingCol, tempColWidths[resizingCol]);
        // 清除临时值
        setTempColWidths(prev => {
          const next = { ...prev };
          delete next[resizingCol];
          return next;
        });
      }
      if (resizingRow !== null && tempRowHeights[resizingRow] !== undefined) {
        onRowHeightChange(resizingRow, tempRowHeights[resizingRow]);
        // 清除临时值
        setTempRowHeights(prev => {
          const next = { ...prev };
          delete next[resizingRow];
          return next;
        });
      }
      setResizingCol(null);
      setResizingRow(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, resizingRow, resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight, tempColWidths, tempRowHeights, onColumnWidthChange, onRowHeightChange]);

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
            <th style={{
              width: HEADER_WIDTH,
              height: HEADER_HEIGHT,
              background: '#f5f5f5',
              border: '1px solid #d9d9d9',
              position: 'sticky',
              top: 0,
              left: 0,
              zIndex: 3,
            }} />
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
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.background = '#1890ff';
                      }}
                      onMouseLeave={(e) => {
                        if (resizingCol !== col) {
                          (e.target as HTMLElement).style.background = 'transparent';
                        }
                      }}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: VISIBLE_ROWS }, (_, row) => (
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
                const cell = getCell(row, col);
                const isEditing = editingCell?.row === row && editingCell?.col === col;
                const isSelected = isCellSelected(row, col);
                const frozen = isFrozen(row, col);

                return (
                  <td
                    key={col}
                    style={{
                      width: getColWidth(col),
                      height: getRowHeight(row),
                      border: '1px solid #e8e8e8',
                      padding: 0,
                      position: frozen ? 'sticky' : 'relative',
                      left: frozen && col < sheet.frozen_columns ? HEADER_WIDTH + col * getColWidth(col) : undefined,
                      top: frozen && row < sheet.frozen_rows ? HEADER_HEIGHT + row * getRowHeight(row) : undefined,
                      zIndex: frozen ? 1 : 0,
                      background: isSelected ? '#e6f7ff' : (frozen ? '#fafafa' : '#fff'),
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
                        lineHeight: `${getRowHeight(row) - 4}px`,
                      }}>
                        {formatCellValue(cell)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
