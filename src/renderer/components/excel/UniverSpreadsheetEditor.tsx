import React, { useEffect, useRef } from 'react';
import type { IDisposable, IWorkbookData } from '@univerjs/core';

interface UniverSpreadsheetEditorProps {
  noteId: string;
  initialSnapshot: Partial<IWorkbookData>;
  isDarkMode: boolean;
  onReady: (snapshot: IWorkbookData) => void;
  onSnapshotChange: (snapshot: IWorkbookData) => void;
  onError: (error: Error) => void;
  editorRef: React.MutableRefObject<UniverSpreadsheetEditorHandle | null>;
}

export interface UniverSpreadsheetEditorHandle {
  saveSnapshot: () => IWorkbookData | null;
  renameWorkbook: (title: string) => IWorkbookData | null;
}

interface UniverWorkbookHandle {
  save: () => IWorkbookData;
  setName: (title: string) => void;
  onCommandExecuted: (callback: () => void) => IDisposable;
}

export const UniverSpreadsheetEditor: React.FC<UniverSpreadsheetEditorProps> = ({
  noteId,
  initialSnapshot,
  isDarkMode,
  onReady,
  onSnapshotChange,
  onError,
  editorRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<{ dispose: () => void } | null>(null);
  const apiRef = useRef<{ toggleDarkMode: (enabled: boolean) => void } | null>(null);
  const workbookRef = useRef<UniverWorkbookHandle | null>(null);
  const commandSubscriptionRef = useRef<IDisposable | null>(null);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef('');
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
  }, [onSnapshotChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const api = apiRef.current;
    if (api) {
      api.toggleDarkMode(isDarkMode);
    }
  }, [isDarkMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let disposed = false;

    const initialize = async () => {
      try {
        const [core, facade, sheetsPreset, localeModule] = await Promise.all([
          import('@univerjs/core'),
          import('@univerjs/core/facade'),
          import('@univerjs/preset-sheets-core'),
          import('@univerjs/preset-sheets-core/locales/zh-CN'),
          import('@univerjs/preset-sheets-core/lib/index.css'),
        ]);
        if (disposed) {
          return;
        }

        const univer = new core.Univer({
          logLevel: core.LogLevel.WARN,
          locale: core.LocaleType.ZH_CN,
          locales: {
            [core.LocaleType.ZH_CN]: core.mergeLocales(localeModule.default),
          },
        });
        const preset = sheetsPreset.UniverSheetsCorePreset({
          container,
          header: true,
          toolbar: true,
          formulaBar: true,
          footer: true,
          statusBarStatistic: true,
        });
        for (const pluginConfig of preset.plugins) {
          if (!pluginConfig) {
            continue;
          }
          const [plugin, options] = Array.isArray(pluginConfig)
            ? pluginConfig
            : [pluginConfig, undefined];
          univer.registerPlugin(plugin, options);
        }

        const univerAPI = facade.FUniver.newAPI(univer);

        univerRef.current = univer;
        apiRef.current = univerAPI;
        univerAPI.toggleDarkMode(isDarkMode);

        const workbook = univerAPI.createWorkbook(initialSnapshot) as UniverWorkbookHandle;
        workbookRef.current = workbook;
        const initialSavedSnapshot = workbook.save();
        lastSnapshotRef.current = JSON.stringify(initialSavedSnapshot);
        onReadyRef.current(initialSavedSnapshot);

        commandSubscriptionRef.current = workbook.onCommandExecuted(() => {
          if (changeTimerRef.current) {
            clearTimeout(changeTimerRef.current);
          }

          changeTimerRef.current = setTimeout(() => {
            const latestSnapshot = workbook.save();
            const fingerprint = JSON.stringify(latestSnapshot);
            if (fingerprint === lastSnapshotRef.current) {
              return;
            }

            lastSnapshotRef.current = fingerprint;
            onSnapshotChangeRef.current(latestSnapshot);
          }, 600);
        });
      } catch (error) {
        if (!disposed) {
          onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };

    void initialize();

    return () => {
      disposed = true;
      if (changeTimerRef.current) {
        clearTimeout(changeTimerRef.current);
        changeTimerRef.current = null;
      }
      commandSubscriptionRef.current?.dispose();
      commandSubscriptionRef.current = null;
      workbookRef.current = null;
      apiRef.current = null;
      univerRef.current?.dispose();
      univerRef.current = null;
    };
  // `initialSnapshot` is intentionally consumed only when the editor mounts.
  // The parent remounts this component after an import; normal auto-saves must
  // never recreate the active spreadsheet instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    editorRef.current = {
      saveSnapshot: () => workbookRef.current?.save() ?? null,
      renameWorkbook: (title: string) => {
        const workbook = workbookRef.current;
        if (!workbook) {
          return null;
        }
        workbook.setName(title);
        const snapshot = workbook.save();
        lastSnapshotRef.current = JSON.stringify(snapshot);
        return snapshot;
      },
    };

    return () => {
      editorRef.current = null;
    };
  }, [editorRef]);

  return (
    <div
      ref={containerRef}
      className="univer-spreadsheet-editor"
      style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}
    />
  );
};
