import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, Spin, Tooltip, message } from 'antd';
import {
  DownloadOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { IWorkbookData } from '@univerjs/core';
import type { ExcelNotePayload, ItemBase } from '@shared/types';
import {
  applyUniverSnapshot,
  getUniverSnapshot,
  isUniverWorkbookSnapshot,
  univerSnapshotToLegacySheets,
} from '@core/excel/UniverWorkbookAdapter';
import { ImportExportService } from '@core/excel/ImportExportService';
import { itemsApi, parsePayload } from '../services/itemsApi';
import {
  UniverSpreadsheetEditor,
  UniverSpreadsheetEditorHandle,
} from './excel/UniverSpreadsheetEditor';

interface ExcelEditorPanelProps {
  noteId: string | null;
  isDarkMode?: boolean;
}

type WorkbookSnapshot = Partial<IWorkbookData>;

export const ExcelEditorPanel: React.FC<ExcelEditorPanelProps> = ({
  noteId,
  isDarkMode = false,
}) => {
  const [note, setNote] = useState<ItemBase | null>(null);
  const [payload, setPayload] = useState<ExcelNotePayload | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<WorkbookSnapshot | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const editorRef = useRef<UniverSpreadsheetEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const payloadRef = useRef<ExcelNotePayload | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const pendingWriteCountRef = useRef(0);
  const importExportService = useMemo(() => new ImportExportService(), []);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const persistPayload = useCallback(async (
    nextPayload: ExcelNotePayload,
    options: { showSuccess?: boolean } = {}
  ): Promise<void> => {
    if (!noteId) {
      return;
    }

    payloadRef.current = nextPayload;
    setPayload(nextPayload);
    pendingWriteCountRef.current += 1;
    setSaving(true);

    const write = saveQueueRef.current.then(async () => {
      const updated = await itemsApi.update(noteId, nextPayload);
      if (!updated) {
        throw new Error('保存 Excel 笔记失败');
      }
      if (options.showSuccess) {
        message.success('已保存');
      }
    });

    saveQueueRef.current = write.catch(() => undefined);

    try {
      await write;
    } finally {
      pendingWriteCountRef.current -= 1;
      if (pendingWriteCountRef.current === 0) {
        setSaving(false);
      }
    }
  }, [noteId]);

  const persistSnapshot = useCallback(async (
    snapshot: IWorkbookData,
    options: { showSuccess?: boolean } = {}
  ): Promise<void> => {
    const currentPayload = payloadRef.current;
    if (!currentPayload) {
      return;
    }

    const nextPayload = applyUniverSnapshot(currentPayload, snapshot);
    await persistPayload(nextPayload, options);
  }, [persistPayload]);

  useEffect(() => {
    let disposed = false;

    const loadNote = async () => {
      if (!noteId) {
        setNote(null);
        setPayload(null);
        setInitialSnapshot(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const item = await itemsApi.getById(noteId);
        if (!item || item.type !== 'excel_note') {
          throw new Error('Excel 笔记不存在或已被删除');
        }

        const nextPayload = parsePayload<ExcelNotePayload>(item);
        if (disposed) {
          return;
        }

        setNote(item);
        setPayload(nextPayload);
        setEditingTitle(nextPayload.title);
        setInitialSnapshot(getUniverSnapshot(nextPayload, item.id));
        setEditorRevision((value) => value + 1);
      } catch (error) {
        if (!disposed) {
          setNote(null);
          setPayload(null);
          setInitialSnapshot(null);
          message.error(error instanceof Error ? error.message : '加载 Excel 笔记失败');
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void loadNote();
    return () => {
      disposed = true;
    };
  }, [noteId]);

  useEffect(() => {
    if (payload && !isEditingTitle) {
      setEditingTitle(payload.title);
    }
  }, [isEditingTitle, payload]);

  const handleEditorReady = useCallback((snapshot: IWorkbookData) => {
    const currentPayload = payloadRef.current;
    if (!currentPayload || isUniverWorkbookSnapshot(currentPayload.univer_snapshot)) {
      return;
    }

    void persistSnapshot(snapshot).catch((error) => {
      message.error(error instanceof Error ? error.message : '迁移旧 Excel 笔记失败');
    });
  }, [persistSnapshot]);

  const handleWorkbookChange = useCallback((snapshot: IWorkbookData) => {
    void persistSnapshot(snapshot).catch((error) => {
      message.error(error instanceof Error ? error.message : '自动保存失败');
    });
  }, [persistSnapshot]);

  const handleSave = useCallback(() => {
    const snapshot = editorRef.current?.saveSnapshot();
    if (!snapshot) {
      return;
    }

    void persistSnapshot(snapshot, { showSuccess: true }).catch((error) => {
      message.error(error instanceof Error ? error.message : '保存失败');
    });
  }, [persistSnapshot]);

  const handleTitleCommit = useCallback(() => {
    const nextTitle = editingTitle.trim();
    const currentPayload = payloadRef.current;
    if (!nextTitle || !currentPayload || nextTitle === currentPayload.title) {
      setEditingTitle(currentPayload?.title ?? '');
      setIsEditingTitle(false);
      return;
    }

    const snapshot = editorRef.current?.renameWorkbook(nextTitle);
    if (snapshot) {
      void persistSnapshot(snapshot).catch((error) => {
        message.error(error instanceof Error ? error.message : '更新标题失败');
      });
    } else {
      void persistPayload({ ...currentPayload, title: nextTitle }).catch((error) => {
        message.error(error instanceof Error ? error.message : '更新标题失败');
      });
    }
    setIsEditingTitle(false);
  }, [editingTitle, persistPayload, persistSnapshot]);

  const handleImport = useCallback(async (file: File) => {
    const currentPayload = payloadRef.current;
    if (!currentPayload) {
      return;
    }

    try {
      const importedPayload = file.name.toLowerCase().endsWith('.csv')
        ? await importExportService.importCsv(file)
        : await importExportService.importXlsx(file);
      const importedSnapshot = getUniverSnapshot(importedPayload, noteId ?? undefined);
      const nextPayload = applyUniverSnapshot(
        {
          ...importedPayload,
          folder_id: currentPayload.folder_id,
          is_pinned: currentPayload.is_pinned,
          is_locked: currentPayload.is_locked,
          lock_password_hash: currentPayload.lock_password_hash,
          tags: currentPayload.tags,
        },
        importedSnapshot
      );

      await persistPayload(nextPayload, { showSuccess: true });
      setEditingTitle(nextPayload.title);
      setInitialSnapshot(importedSnapshot);
      setEditorRevision((value) => value + 1);
      message.success('导入成功');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入失败');
    }
  }, [importExportService, noteId, persistPayload]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleImport(file);
    }
    event.target.value = '';
  }, [handleImport]);

  const handleExportXlsx = useCallback(async () => {
    const currentPayload = payloadRef.current;
    const snapshot = editorRef.current?.saveSnapshot();
    if (!currentPayload || !snapshot) {
      return;
    }

    try {
      const exportPayload = {
        ...currentPayload,
        sheets: univerSnapshotToLegacySheets(snapshot),
      };
      const blob = await importExportService.exportToXlsx(exportPayload);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${currentPayload.title || 'Excel 笔记'}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success('已导出 XLSX');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    }
  }, [importExportService]);

  const handleExportCsv = useCallback(async () => {
    const currentPayload = payloadRef.current;
    const snapshot = editorRef.current?.saveSnapshot();
    if (!currentPayload || !snapshot) {
      return;
    }

    try {
      const sheets = univerSnapshotToLegacySheets(snapshot);
      const activeSheet = sheets[currentPayload.active_sheet_index] ?? sheets[0];
      if (!activeSheet) {
        throw new Error('当前表格没有可导出的工作表');
      }

      const blob = await importExportService.exportToCsv(activeSheet);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activeSheet.name || currentPayload.title || 'Excel 笔记'}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success('已导出 CSV');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    }
  }, [importExportService]);

  if (loading) {
    return <div style={{ display: 'grid', height: '100%', placeItems: 'center' }}><Spin tip="加载 Excel 笔记..." /></div>;
  }

  if (!note || !payload || !initialSnapshot || !noteId) {
    return <Empty description="Excel 笔记不存在或加载失败" style={{ marginTop: 96 }} />;
  }

  const background = isDarkMode ? '#141414' : '#ffffff';
  const borderColor = isDarkMode ? '#303030' : '#e8e8e8';

  return (
    <section
      className="excel-editor-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 48,
          padding: '0 12px',
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <FileExcelOutlined style={{ color: '#26a269', fontSize: 18 }} />
        <Input
          aria-label="Excel 笔记标题"
          value={editingTitle}
          bordered={false}
          onFocus={() => setIsEditingTitle(true)}
          onChange={(event) => setEditingTitle(event.target.value)}
          onBlur={handleTitleCommit}
          onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
          style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600 }}
        />
        <Tooltip title="导入 Excel 或 CSV">
          <Button
            aria-label="导入 Excel 或 CSV"
            icon={<UploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
          />
        </Tooltip>
        <Tooltip title="导出为 XLSX">
          <Button
            aria-label="导出为 XLSX"
            icon={<DownloadOutlined />}
            onClick={() => void handleExportXlsx()}
          />
        </Tooltip>
        <Tooltip title="导出当前工作表为 CSV">
          <Button
            aria-label="导出当前工作表为 CSV"
            icon={<FileTextOutlined />}
            onClick={() => void handleExportCsv()}
          />
        </Tooltip>
        <Tooltip title={saving ? '保存中' : '保存'}>
          <Button
            aria-label="保存 Excel 笔记"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          />
        </Tooltip>
      </header>

      <UniverSpreadsheetEditor
        key={`${noteId}-${editorRevision}`}
        noteId={noteId}
        initialSnapshot={initialSnapshot}
        isDarkMode={isDarkMode}
        editorRef={editorRef}
        onReady={handleEditorReady}
        onSnapshotChange={handleWorkbookChange}
        onError={(error) => message.error(`Excel 编辑器加载失败: ${error.message}`)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </section>
  );
};

export default ExcelEditorPanel;
