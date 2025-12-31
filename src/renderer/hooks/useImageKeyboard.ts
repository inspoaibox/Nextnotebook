/**
 * useImageKeyboard - 图片处理快捷键 Hook
 * 支持常用操作的键盘快捷键
 */

import { useEffect, useCallback, useMemo } from 'react';

// 快捷键动作类型
export type KeyboardAction = 'undo' | 'redo' | 'save' | 'reset';

// 快捷键定义
export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: KeyboardAction;
  description: string;
}

// 快捷键回调
export interface KeyboardCallbacks {
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onReset?: () => void;
}

// 默认快捷键配置
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: 'z',
    ctrl: true,
    action: 'undo',
    description: '撤销 (Ctrl+Z)',
  },
  {
    key: 'y',
    ctrl: true,
    action: 'redo',
    description: '重做 (Ctrl+Y)',
  },
  {
    key: 'z',
    ctrl: true,
    shift: true,
    action: 'redo',
    description: '重做 (Ctrl+Shift+Z)',
  },
  {
    key: 's',
    ctrl: true,
    action: 'save',
    description: '保存 (Ctrl+S)',
  },
  {
    key: 'Escape',
    action: 'reset',
    description: '重置 (Esc)',
  },
];

// 快捷键帮助信息
export const SHORTCUT_HELP = [
  { keys: 'Ctrl + Z', action: '撤销上一步操作' },
  { keys: 'Ctrl + Y', action: '重做操作' },
  { keys: 'Ctrl + Shift + Z', action: '重做操作（备选）' },
  { keys: 'Ctrl + S', action: '保存当前图片' },
  { keys: 'Esc', action: '重置当前操作' },
];

/**
 * 检查键盘事件是否匹配快捷键
 */
function matchShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
  const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
  const shiftMatch = !!shortcut.shift === event.shiftKey;
  const altMatch = !!shortcut.alt === event.altKey;

  return keyMatch && ctrlMatch && shiftMatch && altMatch;
}

/**
 * 图片处理快捷键 Hook
 */
export function useImageKeyboard(
  callbacks: KeyboardCallbacks,
  enabled: boolean = true
) {
  // 处理键盘事件
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // 如果焦点在输入框中，不处理快捷键（除了 Escape）
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of DEFAULT_SHORTCUTS) {
        if (matchShortcut(event, shortcut)) {
          // Escape 键在输入框中也应该生效
          if (isInputFocused && shortcut.action !== 'reset') {
            continue;
          }

          event.preventDefault();
          event.stopPropagation();

          switch (shortcut.action) {
            case 'undo':
              callbacks.onUndo?.();
              break;
            case 'redo':
              callbacks.onRedo?.();
              break;
            case 'save':
              callbacks.onSave?.();
              break;
            case 'reset':
              callbacks.onReset?.();
              break;
          }

          return;
        }
      }
    },
    [callbacks, enabled]
  );

  // 注册键盘事件监听
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);

  // 返回快捷键帮助信息
  const shortcuts = useMemo(() => DEFAULT_SHORTCUTS, []);
  const help = useMemo(() => SHORTCUT_HELP, []);

  return {
    shortcuts,
    help,
  };
}

export default useImageKeyboard;
