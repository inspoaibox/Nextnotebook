/**
 * Excel 编辑器主面板
 * 整合工具栏、公式栏、表格网格、工作表标签
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Input, Modal, message, Upload, Spin, Empty } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { ExcelToolbar } from './excel/ExcelToolbar';
import { FormulaBar } from './excel/FormulaBar';
import { SheetTabs } from './excel/SheetTabs';
import { SpreadsheetGrid } from './excel/SpreadsheetGrid';
import { CellContextMenu } from './excel/CellContextMenu';
import { FindReplaceDialog, FindResult, FindOptions } from './excel/FindReplaceDialog';
import { SortDialog, FilterDialog, SortConfig, FilterCondition } from './excel/SortFilterDialog';
import { useExcelNotes, Selection } from '../hooks/useExcelNotes';
import { FormulaEngine } from '@core/excel/FormulaEngine';
import { ImportExportService } from '@core/excel/ImportExportService';
import { CellStyle, ExcelNotePayload, ItemBase, NumberFormat } from '@shared/types';

interface ExcelEditorPanelProps {
  noteId?: string | null;  // 要编辑的 Excel 笔记 ID
  onBack?: () => void;
}

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

export const ExcelEditorPanel: React.FC<ExcelEditorPanelProps> = ({ noteId, onBack }) => {
  const {
    excelNotes,
    currentNote,
    currentPayload,
    currentSheet,
    loading,
    error,
    selection,
    selectExcelNote,
    createExcelNote,
    updateExcelNote,
    deleteExcelNote,
    addSheet,
    deleteSheet,
    renameSheet,
    selectSheet,
    reorderSheets,
    updateCell,
    updateCellStyle,
    clearCellRange,
    setColumnWidth,
    setRowHeight,
    setSelection,
    copySelection,
    cutSelection,
    pasteAtSelection,
    undo,
    redo,
    canUndo,
    canRedo,
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
  } = useExcelNotes();

  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>({ row: 0, col: 0 });
  const selectedCellRef = useRef(selectedCell);
  selectedCellRef.current = selectedCell;
  const [selectedRange, setSelectedRange] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const selectedRangeRef = useRef(selectedRange);
  selectedRangeRef.current = selectedRange;
  const [formulaBarValue, setFormulaBarValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newNoteName, setNewNoteName] = useState('');
  const [editingTitle, setEditingTitle] = useState(''); // 本地标题编辑状态
  const [isEditingTitle, setIsEditingTitle] = useState(false); // 是否正在编辑标题
  const [showFilterButtons, setShowFilterButtons] = useState(false); // 是否显示筛选按钮
  const [isSaving, setIsSaving] = useState(false); // 是否正在保存
  const [lastSaved, setLastSaved] = useState<Date | null>(null); // 最后保存时间
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null); // 自动保存定时器
  
  // 对话框状态
  const [findDialogOpen, setFindDialogOpen] = useState(false);
  const [findDialogMode, setFindDialogMode] = useState<'find' | 'replace'>('find');
  const [sortDialogOpen, setSortDialogOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  
  // 文件输入 ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formulaEngine = useMemo(() => new FormulaEngine(), []);
  const importExportService = useMemo(() => new ImportExportService(), []);

  // 手动保存函数
  const handleSave = useCallback(async () => {
    if (!currentNote || !currentPayload) return;
    
    setIsSaving(true);
    try {
      await updateExcelNote(currentNote.id, currentPayload);
      setLastSaved(new Date());
      message.success('保存成功');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  }, [currentNote, currentPayload, updateExcelNote]);

  // 自动保存：当 payload 变化时，延迟 2 秒自动保存
  useEffect(() => {
    if (!currentNote || !currentPayload) return;

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 设置新的定时器（2秒后自动保存）
    autoSaveTimerRef.current = setTimeout(async () => {
      console.log('[Excel] Auto-saving...');
      setIsSaving(true);
      try {
        await updateExcelNote(currentNote.id, currentPayload);
        setLastSaved(new Date());
        console.log('[Excel] Auto-save successful');
      } catch (err: any) {
        console.error('[Excel] Auto-save failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    // 清理函数
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [currentPayload, currentNote, updateExcelNote]);

  // 当 noteId 变化时，加载对应的 Excel 笔记
  useEffect(() => {
    if (noteId) {
      selectExcelNote(noteId);
    }
  }, [noteId, selectExcelNote]);

  // 当 currentPayload 变化时，同步标题到本地状态（仅在非编辑状态时）
  useEffect(() => {
    if (currentPayload && !isEditingTitle) {
      setEditingTitle(currentPayload.title);
    }
  }, [currentPayload, isEditingTitle]);

  // 当前工作表 - 使用 hook 提供的 currentSheet

  // 获取当前选中单元格
  const getCurrentCell = useCallback(() => {
    if (!currentSheet || !selectedCell) return null;
    
    // 检查是否是合并单元格，如果是则获取起始单元格
    const mergedInfo = getMergedCellInfo(selectedCell.row, selectedCell.col);
    const targetRow = mergedInfo ? mergedInfo.start_row : selectedCell.row;
    const targetCol = mergedInfo ? mergedInfo.start_col : selectedCell.col;
    
    const row = currentSheet.rows.find(r => r.row_index === targetRow);
    if (!row) return null;
    return row.cells.find(c => c.column_index === targetCol) || null;
  }, [currentSheet, selectedCell, getMergedCellInfo]);

  // 当前单元格地址
  const cellAddress = useMemo(() => {
    if (!selectedCell) return 'A1';
    return `${colToLetter(selectedCell.col)}${selectedCell.row + 1}`;
  }, [selectedCell]);

  // 当前单元格样式
  const currentCellStyle = useMemo(() => {
    const cell = getCurrentCell();
    return cell?.style || null;
  }, [getCurrentCell]);

  // 更新公式栏值
  useEffect(() => {
    const cell = getCurrentCell();
    setFormulaBarValue(cell?.formula || String(cell?.value ?? ''));
  }, [getCurrentCell]);

  // 处理单元格选择
  const handleCellSelect = useCallback((row: number, col: number) => {
    setSelectedCell({ row, col });
    setSelectedRange(null);
    setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
  }, [setSelection]);

  // 处理范围选择
  const handleRangeSelect = useCallback((startRow: number, startCol: number, endRow: number, endCol: number) => {
    setSelectedRange({ startRow, startCol, endRow, endCol });
    setSelection({ startRow, startCol, endRow, endCol });
  }, [setSelection]);

  // 处理单元格值变更
  const handleCellChange = useCallback((row: number, col: number, value: string) => {
    // 检查是否是公式
    if (value.startsWith('=')) {
      // 公式：保存公式字符串，值设为 null（由公式引擎计算）
      updateCell(row, col, null, value);
    } else {
      // 普通值：尝试转换为数字
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && value.trim() !== '') {
        updateCell(row, col, numValue);
      } else {
        updateCell(row, col, value || null);
      }
    }
  }, [updateCell]);

  // 处理公式栏变更
  const handleFormulaBarChange = useCallback((value: string) => {
    setFormulaBarValue(value);
  }, []);

  // 处理公式栏提交
  const handleFormulaBarCommit = useCallback(() => {
    if (selectedCell) {
      updateCell(selectedCell.row, selectedCell.col, formulaBarValue);
    }
  }, [selectedCell, formulaBarValue, updateCell]);

  // 处理样式变更
  const handleStyleChange = useCallback((style: Partial<CellStyle>) => {
    if (selectedRange) {
      // 批量更新范围内的单元格样式
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
          // 检查是否是合并单元格，如果是则更新起始单元格的样式
          const mergedInfo = getMergedCellInfo(r, c);
          if (mergedInfo) {
            updateCellStyle(mergedInfo.start_row, mergedInfo.start_col, style);
          } else {
            updateCellStyle(r, c, style);
          }
        }
      }
    } else if (selectedCell) {
      // 检查是否是合并单元格，如果是则更新起始单元格的样式
      const mergedInfo = getMergedCellInfo(selectedCell.row, selectedCell.col);
      if (mergedInfo) {
        updateCellStyle(mergedInfo.start_row, mergedInfo.start_col, style);
      } else {
        updateCellStyle(selectedCell.row, selectedCell.col, style);
      }
    }
  }, [selectedCell, selectedRange, updateCellStyle, getMergedCellInfo]);

  // 处理复制
  const handleCopy = useCallback(async () => {
    const sel = selectedRange || (selectedCell ? { 
      startRow: selectedCell.row, 
      startCol: selectedCell.col, 
      endRow: selectedCell.row, 
      endCol: selectedCell.col 
    } : null);
    
    if (sel) {
      await copySelection(sel);
      message.success('已复制');
    }
  }, [copySelection, selectedRange, selectedCell]);

  // 处理剪切
  const handleCut = useCallback(async () => {
    const sel = selectedRange || (selectedCell ? { 
      startRow: selectedCell.row, 
      startCol: selectedCell.col, 
      endRow: selectedCell.row, 
      endCol: selectedCell.col 
    } : null);
    
    if (sel) {
      await cutSelection(sel);
      message.success('已剪切');
    }
  }, [cutSelection, selectedRange, selectedCell]);

  // 处理粘贴
  const handlePaste = useCallback(async () => {
    const sel = selectedRange || (selectedCell ? { 
      startRow: selectedCell.row, 
      startCol: selectedCell.col, 
      endRow: selectedCell.row, 
      endCol: selectedCell.col 
    } : null);
    
    if (sel) {
      await pasteAtSelection(sel);
      message.success('已粘贴');
    }
  }, [pasteAtSelection, selectedRange, selectedCell]);

  // 处理清除内容 - 批量删除选中范围内的所有单元格
  const handleClearContent = useCallback(() => {
    if (selectedRange) {
      clearCellRange(
        selectedRange.startRow,
        selectedRange.startCol,
        selectedRange.endRow,
        selectedRange.endCol
      );
    } else if (selectedCell) {
      updateCell(selectedCell.row, selectedCell.col, null);
    }
  }, [selectedCell, selectedRange, updateCell, clearCellRange]);

  // 处理清除格式
  const handleClearFormat = useCallback(() => {
    const emptyStyle: CellStyle = {
      font_bold: false,
      font_italic: false,
      font_color: null,
      background_color: null,
      text_align: 'left',
      vertical_align: 'middle',
      number_format: null,
    };
    if (selectedRange) {
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
          updateCellStyle(r, c, emptyStyle);
        }
      }
    } else if (selectedCell) {
      updateCellStyle(selectedCell.row, selectedCell.col, emptyStyle);
    }
  }, [selectedCell, selectedRange, updateCellStyle]);

  // 处理合并单元格
  const handleMergeCells = useCallback(() => {
    if (selectedRange) {
      const success = mergeCells(
        selectedRange.startRow,
        selectedRange.startCol,
        selectedRange.endRow,
        selectedRange.endCol
      );
      if (success) {
        message.success('单元格已合并');
      } else {
        message.warning('无法合并：选区与现有合并单元格冲突');
      }
    }
  }, [selectedRange, mergeCells]);

  // 处理取消合并
  const handleUnmergeCells = useCallback(() => {
    if (selectedCell) {
      unmergeCells(selectedCell.row, selectedCell.col);
      message.success('已取消合并');
    }
  }, [selectedCell, unmergeCells]);

  // 检查当前选中单元格是否已合并
  const isCurrentCellMerged = useMemo(() => {
    if (!selectedCell) return false;
    return isCellMerged(selectedCell.row, selectedCell.col);
  }, [selectedCell, isCellMerged]);

  // 检查是否有多单元格选区（用于判断是否可以合并）
  const hasMultiCellSelection = useMemo(() => {
    if (!selectedRange) return false;
    return selectedRange.startRow !== selectedRange.endRow || 
           selectedRange.startCol !== selectedRange.endCol;
  }, [selectedRange]);

  // 查找替换处理
  const handleFind = useCallback((searchText: string, options: FindOptions): FindResult[] => {
    return findInSheet(searchText, options);
  }, [findInSheet]);

  const handleReplace = useCallback((searchText: string, replaceText: string, options: FindOptions): number => {
    if (!selectedCell) return 0;
    return replaceInSheet(searchText, replaceText, options, selectedCell.row, selectedCell.col) ? 1 : 0;
  }, [selectedCell, replaceInSheet]);

  const handleReplaceAll = useCallback((searchText: string, replaceText: string, options: FindOptions): number => {
    return replaceAllInSheet(searchText, replaceText, options);
  }, [replaceAllInSheet]);

  const handleNavigateToResult = useCallback((result: FindResult) => {
    setSelectedCell({ row: result.row, col: result.col });
    setSelectedRange(null);
    setSelection({ startRow: result.row, startCol: result.col, endRow: result.row, endCol: result.col });
  }, [setSelection]);

  // 排序处理 - 根据当前选中的列排序
  const handleSort = useCallback((config: SortConfig) => {
    sortByColumn(config);
    message.success(`已按列 ${colToLetter(config.column)} ${config.order === 'asc' ? '升序' : '降序'}排序`);
  }, [sortByColumn]);

  // 快速排序 - 使用当前选中的列
  const handleQuickSort = useCallback((order: 'asc' | 'desc') => {
    if (!selectedCell) {
      message.warning('请先选择一个单元格');
      return;
    }
    sortBySelectedColumn(order);
    message.success(`已按列 ${colToLetter(selectedCell.col)} ${order === 'asc' ? '升序' : '降序'}排序`);
  }, [selectedCell, sortBySelectedColumn]);

  // 切换筛选按钮显示
  const handleToggleFilter = useCallback(() => {
    setShowFilterButtons(prev => !prev);
    if (!showFilterButtons) {
      message.info('已启用筛选，点击列头的筛选图标进行筛选');
    } else {
      // 关闭筛选时清除所有筛选
      clearFilters();
      message.info('已关闭筛选');
    }
  }, [showFilterButtons, clearFilters]);

  // 列筛选处理
  const handleColumnFilter = useCallback((column: number, filter: any) => {
    applyColumnFilter(column, filter);
  }, [applyColumnFilter]);

  // 列排序处理
  const handleColumnSort = useCallback((column: number, order: 'asc' | 'desc') => {
    sortByColumn({ column, order });
    message.success(`已按列 ${colToLetter(column)} ${order === 'asc' ? '升序' : '降序'}排序`);
  }, [sortByColumn]);

  // 筛选处理（旧的弹窗方式，保留兼容）
  const handleApplyFilter = useCallback((conditions: FilterCondition[]) => {
    applyFilters(conditions);
    if (conditions.length > 0) {
      message.success(`已应用 ${conditions.length} 个筛选条件`);
    }
  }, [applyFilters]);

  const handleClearFilters = useCallback(() => {
    clearFilters();
    setShowFilterButtons(false);
    message.success('已清除筛选');
  }, [clearFilters]);

  // 处理导入
  const handleImport = useCallback(async (file: File) => {
    try {
      let importedPayload: ExcelNotePayload;
      if (file.name.endsWith('.csv')) {
        importedPayload = await importExportService.importCsv(file);
      } else {
        importedPayload = await importExportService.importXlsx(file);
      }
      
      // 如果当前有打开的笔记，将导入的数据合并到当前笔记
      if (currentNote && currentPayload) {
        // 将导入的工作表添加到当前笔记，或替换当前工作表
        const updatedPayload: ExcelNotePayload = {
          ...currentPayload,
          sheets: importedPayload.sheets,
          active_sheet_index: 0,
        };
        await updateExcelNote(currentNote.id, updatedPayload);
        message.success('导入成功');
      } else {
        // 没有打开的笔记，创建新笔记
        const api = (window as any).electronAPI;
        if (api?.items?.create) {
          const newNote = await api.items.create('excel_note', importedPayload);
          if (newNote) {
            await selectExcelNote(newNote.id);
            message.success('导入成功');
          }
        }
      }
    } catch (err: any) {
      message.error(err.message || '导入失败');
    }
    return false; // 阻止默认上传行为
  }, [importExportService, selectExcelNote, currentNote, currentPayload, updateExcelNote]);

  // 处理文件输入变化
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImport(file);
      // 清空输入，以便可以再次选择同一文件
      e.target.value = '';
    }
  }, [handleImport]);

  // 触发文件选择
  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 处理导出 XLSX
  const handleExportXlsx = useCallback(async () => {
    if (!currentPayload || !currentNote) return;
    try {
      const blob = await importExportService.exportToXlsx(currentPayload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentPayload.title || 'export'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err: any) {
      message.error(err.message || '导出失败');
    }
  }, [currentPayload, currentNote, importExportService]);

  // 处理导出 CSV
  const handleExportCsv = useCallback(async () => {
    if (!currentSheet || !currentPayload) return;
    try {
      const blob = await importExportService.exportToCsv(currentSheet);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSheet.name || 'export'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err: any) {
      message.error(err.message || '导出失败');
    }
  }, [currentSheet, currentPayload, importExportService]);

  // 处理创建新笔记
  const handleCreateNote = useCallback(async () => {
    if (!newNoteName.trim()) {
      message.warning('请输入笔记名称');
      return;
    }
    await createExcelNote(newNoteName.trim());
    setIsCreating(false);
    setNewNoteName('');
    message.success('创建成功');
  }, [newNoteName, createExcelNote]);

  // 处理键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentNote) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            handleSave();
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 'c':
            e.preventDefault();
            handleCopy();
            break;
          case 'x':
            e.preventDefault();
            handleCut();
            break;
          case 'v':
            e.preventDefault();
            handlePaste();
            break;
          case 'b':
            e.preventDefault();
            handleStyleChange({ font_bold: !currentCellStyle?.font_bold });
            break;
          case 'i':
            e.preventDefault();
            handleStyleChange({ font_italic: !currentCellStyle?.font_italic });
            break;
          case 'f':
            e.preventDefault();
            setFindDialogMode('find');
            setFindDialogOpen(true);
            break;
          case 'h':
            e.preventDefault();
            setFindDialogMode('replace');
            setFindDialogOpen(true);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentNote, undo, redo, handleCopy, handleCut, handlePaste, handleStyleChange, currentCellStyle, handleSave]);

  // 上传配置
  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls,.csv',
    showUploadList: false,
    beforeUpload: handleImport,
  };

  // 渲染笔记列表
  const renderNoteList = () => (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Excel 笔记</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <Upload {...uploadProps}>
            <Button icon={<FileExcelOutlined />}>导入</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreating(true)}>
            新建
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : excelNotes.length === 0 ? (
        <Empty description="暂无 Excel 笔记" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {excelNotes.map(note => (
            <div
              key={note.id}
              className="excel-note-card"
              onClick={() => selectExcelNote(note.id)}
              style={{
                padding: '12px 16px',
                background: '#fafafa',
                borderRadius: 8,
                cursor: 'pointer',
                border: '1px solid #e8e8e8',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f0f0f0';
                e.currentTarget.style.borderColor = '#1890ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fafafa';
                e.currentTarget.style.borderColor = '#e8e8e8';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileExcelOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                <div>
                  <div style={{ fontWeight: 500 }}>{(() => {
                    try {
                      const payload = typeof note.payload === 'string' ? JSON.parse(note.payload) : note.payload;
                      return payload?.title || '未命名';
                    } catch { return '未命名'; }
                  })()}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {(() => {
                      try {
                        const payload = typeof note.payload === 'string' ? JSON.parse(note.payload) : note.payload;
                        return `${payload?.sheets?.length || 0} 个工作表`;
                      } catch { return '0 个工作表'; }
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建对话框 */}
      <Modal
        title="新建 Excel 笔记"
        open={isCreating}
        onOk={handleCreateNote}
        onCancel={() => { setIsCreating(false); setNewNoteName(''); }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="请输入笔记名称"
          value={newNoteName}
          onChange={(e) => setNewNoteName(e.target.value)}
          onPressEnter={handleCreateNote}
          autoFocus
        />
      </Modal>
    </div>
  );

  // 渲染编辑器
  const renderEditor = () => {
    // 如果传入了 noteId，直接显示编辑器（不显示列表）
    if (noteId) {
      if (loading) {
        return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载中..." /></div>;
      }
      
      if (!currentNote || !currentPayload || !currentSheet) {
        return <Empty description="笔记不存在或加载失败" />;
      }
    } else {
      // 没有传入 noteId 时，如果没有选中笔记则显示列表
      if (!currentNote || !currentPayload || !currentSheet) {
        return renderNoteList();
      }
    }

    return (
      <CellContextMenu
        hasSelection={hasMultiCellSelection}
        isMerged={isCurrentCellMerged}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onClearContent={handleClearContent}
        onClearFormat={handleClearFormat}
        onMergeCells={handleMergeCells}
        onUnmergeCells={handleUnmergeCells}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* 标题栏 */}
          <div className="excel-titlebar" style={{
            display: 'flex', 
            alignItems: 'center', 
            padding: '8px 12px',
            borderBottom: '1px solid #e8e8e8',
            background: '#fff',
            gap: 12,
          }}>
            <Input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onFocus={() => setIsEditingTitle(true)}
              onBlur={async () => {
                // 失焦时保存标题
                if (currentNote && editingTitle !== currentPayload?.title) {
                  await updateExcelNote(currentNote.id, { title: editingTitle });
                }
                setIsEditingTitle(false);
              }}
              onPressEnter={(e) => {
                // 回车时保存并失焦
                (e.target as HTMLInputElement).blur();
              }}
              bordered={false}
              style={{ fontSize: 16, fontWeight: 500, flex: 1 }}
            />
          </div>

          {/* 工具栏 */}
          <ExcelToolbar
            selectedStyle={currentCellStyle}
            canUndo={canUndo}
            canRedo={canRedo}
            hasSelection={hasMultiCellSelection}
            isMerged={isCurrentCellMerged}
            hasActiveFilters={activeFilters.length > 0}
            isSaving={isSaving}
            lastSaved={lastSaved}
            onSave={handleSave}
            onStyleChange={handleStyleChange}
            onUndo={undo}
            onRedo={redo}
            onImport={triggerFileSelect}
            onExportXlsx={handleExportXlsx}
            onExportCsv={handleExportCsv}
            onMergeCells={handleMergeCells}
            onUnmergeCells={handleUnmergeCells}
            onFind={() => { setFindDialogMode('find'); setFindDialogOpen(true); }}
            onReplace={() => { setFindDialogMode('replace'); setFindDialogOpen(true); }}
            onSortAsc={() => handleQuickSort('asc')}
            onSortDesc={() => handleQuickSort('desc')}
            onToggleFilter={handleToggleFilter}
            onClearFilters={handleClearFilters}
            showFilterButtons={showFilterButtons}
          />

          {/* 公式栏 */}
          <FormulaBar
            cellAddress={cellAddress}
            value={String(getCurrentCell()?.value ?? '')}
            formula={getCurrentCell()?.formula || null}
            onChange={handleFormulaBarChange}
            onCommit={handleFormulaBarCommit}
            onCancel={() => {
              const cell = getCurrentCell();
              setFormulaBarValue(cell?.formula || String(cell?.value ?? ''));
            }}
          />

          {/* 表格网格 */}
          <SpreadsheetGrid
            sheet={currentSheet}
            formulaEngine={formulaEngine}
            selectedCell={selectedCell}
            selectedRange={selectedRange}
            onCellSelect={handleCellSelect}
            onRangeSelect={handleRangeSelect}
            onCellChange={handleCellChange}
            onCellStyleChange={updateCellStyle}
            onColumnWidthChange={setColumnWidth}
            onRowHeightChange={setRowHeight}
            onClearRange={clearCellRange}
            getMergedCellInfo={getMergedCellInfo}
            hiddenRows={hiddenRows}
            onAutoFill={autoFill}
            columnFilters={columnFilters}
            onColumnSort={handleColumnSort}
            onColumnFilter={handleColumnFilter}
            showFilterButtons={showFilterButtons}
          />

          {/* 工作表标签 */}
          <SheetTabs
            sheets={currentPayload.sheets}
            activeIndex={currentPayload.active_sheet_index}
            onSelect={selectSheet}
            onAdd={addSheet}
            onDelete={(index) => deleteSheet(currentPayload.sheets[index]?.id)}
            onRename={(index, name) => renameSheet(currentPayload.sheets[index]?.id, name)}
            onReorder={reorderSheets}
          />
        </div>
      </CellContextMenu>
    );
  };

  return (
    <div className="excel-editor-panel" style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#fff',
    }}>
      {renderEditor()}
      {/* 隐藏的文件输入用于导入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      
      {/* 查找替换对话框 */}
      <FindReplaceDialog
        open={findDialogOpen}
        mode={findDialogMode}
        onClose={() => setFindDialogOpen(false)}
        onFind={handleFind}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
        onNavigateToResult={handleNavigateToResult}
      />
      
      {/* 排序对话框 */}
      <SortDialog
        open={sortDialogOpen}
        columnCount={26}
        onClose={() => setSortDialogOpen(false)}
        onSort={handleSort}
      />
      
      {/* 筛选对话框 */}
      <FilterDialog
        open={filterDialogOpen}
        columnCount={26}
        activeFilters={activeFilters}
        onClose={() => setFilterDialogOpen(false)}
        onApplyFilter={handleApplyFilter}
        onClearFilters={handleClearFilters}
      />
    </div>
  );
};

export default ExcelEditorPanel;
