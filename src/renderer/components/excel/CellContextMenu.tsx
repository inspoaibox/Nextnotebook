/**
 * 单元格右键菜单组件
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  ClearOutlined,
  MergeCellsOutlined,
  SplitCellsOutlined,
} from '@ant-design/icons';

interface CellContextMenuProps {
  children: React.ReactNode;
  hasSelection: boolean;
  isMerged: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onClearContent: () => void;
  onClearFormat: () => void;
  onMergeCells: () => void;
  onUnmergeCells: () => void;
}

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
  children,
  hasSelection,
  isMerged,
  onCopy,
  onCut,
  onPaste,
  onClearContent,
  onClearFormat,
  onMergeCells,
  onUnmergeCells,
}) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  // 用 ref 存储所有回调，确保菜单点击时调用最新的
  const cbRef = useRef({
    onCopy, onCut, onPaste,
    onClearContent, onClearFormat, onMergeCells, onUnmergeCells,
  });
  cbRef.current = {
    onCopy, onCut, onPaste,
    onClearContent, onClearFormat, onMergeCells, onUnmergeCells,
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setVisible(true);
  }, []);

  // 点击菜单外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };

    // 用 setTimeout 延迟注册，避免当前右键事件立即触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown, true);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [visible]);

  const handleMenuClick: MenuProps['onClick'] = useCallback(({ key }: { key: string }) => {
    console.log('[CellContextMenu] Menu item clicked:', key);
    setVisible(false);
    const cb = cbRef.current;
    switch (key) {
      case 'copy': cb.onCopy(); break;
      case 'cut': cb.onCut(); break;
      case 'paste': cb.onPaste(); break;
      case 'clearContent': cb.onClearContent(); break;
      case 'clearFormat': cb.onClearFormat(); break;
      case 'mergeCells': cb.onMergeCells(); break;
      case 'unmergeCells': cb.onUnmergeCells(); break;
    }
  }, []);

  const menuItems: MenuProps['items'] = [
    { key: 'copy', label: '复制', icon: <CopyOutlined /> },
    { key: 'cut', label: '剪切', icon: <ScissorOutlined /> },
    { key: 'paste', label: '粘贴', icon: <SnippetsOutlined /> },
    { type: 'divider' },
    { key: 'mergeCells', label: '合并单元格', icon: <MergeCellsOutlined />, disabled: !hasSelection || isMerged },
    { key: 'unmergeCells', label: '取消合并', icon: <SplitCellsOutlined />, disabled: !isMerged },
    { type: 'divider' },
    { key: 'clearContent', label: '清除内容', icon: <ClearOutlined /> },
    { key: 'clearFormat', label: '清除格式' },
  ];

  return (
    <div onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
      {children}
      {visible && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            zIndex: 9999,
            boxShadow: '0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05)',
            borderRadius: 8,
            background: '#fff',
          }}
        >
          <Menu
            items={menuItems}
            onClick={handleMenuClick}
            style={{ borderRadius: 8, border: 'none' }}
          />
        </div>
      )}
    </div>
  );
};
