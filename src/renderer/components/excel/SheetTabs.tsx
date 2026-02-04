/**
 * 工作表标签组件
 * 支持切换、添加、删除、重命名工作表
 */

import React, { useState } from 'react';
import { Button, Dropdown, Input, Modal, message } from 'antd';
import { PlusOutlined, MoreOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { ExcelSheet } from '@shared/types';

interface SheetTabsProps {
  sheets: ExcelSheet[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: (name?: string) => void;
  onDelete: (index: number) => void;
  onRename: (index: number, name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export const SheetTabs: React.FC<SheetTabsProps> = ({
  sheets,
  activeIndex,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onReorder,
}) => {
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleRenameStart = (index: number) => {
    setRenameIndex(index);
    setRenameValue(sheets[index].name);
  };

  const handleRenameConfirm = () => {
    if (renameIndex !== null && renameValue.trim()) {
      onRename(renameIndex, renameValue.trim());
    }
    setRenameIndex(null);
    setRenameValue('');
  };

  const handleRenameCancel = () => {
    setRenameIndex(null);
    setRenameValue('');
  };

  const handleDelete = (index: number) => {
    if (sheets.length <= 1) {
      message.warning('至少保留一个工作表');
      return;
    }
    Modal.confirm({
      title: '删除工作表',
      content: `确定要删除工作表 "${sheets[index].name}" 吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => onDelete(index),
    });
  };

  const getMenuItems = (index: number): MenuProps['items'] => [
    {
      key: 'rename',
      label: '重命名',
      onClick: () => handleRenameStart(index),
    },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      onClick: () => handleDelete(index),
      disabled: sheets.length <= 1,
    },
  ];

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== targetIndex) {
      onReorder(dragIndex, targetIndex);
    }
    setDragIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="sheet-tabs" style={{
      display: 'flex',
      alignItems: 'center',
      padding: '4px 8px',
      borderTop: '1px solid #e8e8e8',
      background: '#fafafa',
      gap: 4,
      overflowX: 'auto',
    }}>
      {/* 添加工作表按钮 */}
      <Button
        icon={<PlusOutlined />}
        size="small"
        onClick={() => onAdd()}
        style={{ marginRight: 8 }}
      />

      {/* 工作表标签 */}
      {sheets.map((sheet, index) => (
        <div
          key={sheet.id}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            background: index === activeIndex ? '#fff' : 'transparent',
            border: index === activeIndex ? '1px solid #d9d9d9' : '1px solid transparent',
            borderBottom: index === activeIndex ? '1px solid #fff' : '1px solid transparent',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            marginBottom: -1,
            opacity: dragIndex === index ? 0.5 : 1,
            transition: 'all 0.2s',
          }}
          onClick={() => onSelect(index)}
          onDoubleClick={() => handleRenameStart(index)}
        >
          {renameIndex === index ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameConfirm}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfirm();
                if (e.key === 'Escape') handleRenameCancel();
              }}
              autoFocus
              size="small"
              style={{ width: 80 }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span style={{ 
                fontSize: 13, 
                maxWidth: 120, 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {sheet.name}
              </span>
              <Dropdown menu={{ items: getMenuItems(index) }} trigger={['click']}>
                <Button
                  icon={<MoreOutlined />}
                  type="text"
                  size="small"
                  style={{ marginLeft: 4, padding: '0 4px' }}
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </>
          )}
        </div>
      ))}
    </div>
  );
};
