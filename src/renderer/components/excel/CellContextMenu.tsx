/**
 * 单元格右键菜单组件
 */

import React from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  InsertRowAboveOutlined,
  InsertRowBelowOutlined,
  DeleteRowOutlined,
  InsertRowLeftOutlined,
  InsertRowRightOutlined,
  DeleteColumnOutlined,
  ClearOutlined,
} from '@ant-design/icons';

interface CellContextMenuProps {
  children: React.ReactNode;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onDeleteRow: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onDeleteColumn: () => void;
  onClearContent: () => void;
  onClearFormat: () => void;
}

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
  children,
  onCopy,
  onCut,
  onPaste,
  onInsertRowAbove,
  onInsertRowBelow,
  onDeleteRow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onDeleteColumn,
  onClearContent,
  onClearFormat,
}) => {
  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    switch (key) {
      case 'copy':
        onCopy();
        break;
      case 'cut':
        onCut();
        break;
      case 'paste':
        onPaste();
        break;
      case 'insertRowAbove':
        onInsertRowAbove();
        break;
      case 'insertRowBelow':
        onInsertRowBelow();
        break;
      case 'deleteRow':
        onDeleteRow();
        break;
      case 'insertColumnLeft':
        onInsertColumnLeft();
        break;
      case 'insertColumnRight':
        onInsertColumnRight();
        break;
      case 'deleteColumn':
        onDeleteColumn();
        break;
      case 'clearContent':
        onClearContent();
        break;
      case 'clearFormat':
        onClearFormat();
        break;
    }
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'copy',
      label: '复制',
      icon: <CopyOutlined />,
    },
    {
      key: 'cut',
      label: '剪切',
      icon: <ScissorOutlined />,
    },
    {
      key: 'paste',
      label: '粘贴',
      icon: <SnippetsOutlined />,
    },
    { type: 'divider' },
    {
      key: 'insertRowAbove',
      label: '在上方插入行',
      icon: <InsertRowAboveOutlined />,
    },
    {
      key: 'insertRowBelow',
      label: '在下方插入行',
      icon: <InsertRowBelowOutlined />,
    },
    {
      key: 'deleteRow',
      label: '删除行',
      icon: <DeleteRowOutlined />,
      danger: true,
    },
    { type: 'divider' },
    {
      key: 'insertColumnLeft',
      label: '在左侧插入列',
      icon: <InsertRowLeftOutlined />,
    },
    {
      key: 'insertColumnRight',
      label: '在右侧插入列',
      icon: <InsertRowRightOutlined />,
    },
    {
      key: 'deleteColumn',
      label: '删除列',
      icon: <DeleteColumnOutlined />,
      danger: true,
    },
    { type: 'divider' },
    {
      key: 'clearContent',
      label: '清除内容',
      icon: <ClearOutlined />,
    },
    {
      key: 'clearFormat',
      label: '清除格式',
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['contextMenu']}>
      {children}
    </Dropdown>
  );
};
