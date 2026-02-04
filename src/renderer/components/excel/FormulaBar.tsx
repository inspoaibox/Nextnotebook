/**
 * 公式栏组件
 * 显示当前单元格地址和内容/公式
 */

import React, { useState, useEffect, useRef } from 'react';
import { Input } from 'antd';
import { FunctionOutlined } from '@ant-design/icons';

interface FormulaBarProps {
  cellAddress: string;
  value: string;
  formula: string | null;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export const FormulaBar: React.FC<FormulaBarProps> = ({
  cellAddress,
  value,
  formula,
  onChange,
  onCommit,
  onCancel,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<any>(null);

  // 当选中单元格变化时，更新显示值
  useEffect(() => {
    setEditValue(formula || String(value ?? ''));
    setIsEditing(false);
  }, [cellAddress, value, formula]);

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit();
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(formula || String(value ?? ''));
      onCancel();
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    if (isEditing) {
      onCommit();
      setIsEditing(false);
    }
  };

  return (
    <div className="formula-bar" style={{
      display: 'flex',
      alignItems: 'center',
      padding: '4px 12px',
      borderBottom: '1px solid #e8e8e8',
      background: '#fff',
      gap: 8,
    }}>
      {/* 单元格地址 */}
      <div style={{
        minWidth: 60,
        padding: '4px 8px',
        background: '#f5f5f5',
        border: '1px solid #d9d9d9',
        borderRadius: 4,
        fontFamily: 'monospace',
        fontSize: 13,
        textAlign: 'center',
      }}>
        {cellAddress || 'A1'}
      </div>

      {/* 公式图标 */}
      <FunctionOutlined style={{ color: '#666', fontSize: 16 }} />

      {/* 公式/值输入框 */}
      <Input
        ref={inputRef}
        value={editValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="输入值或公式（以 = 开头）"
        style={{ flex: 1 }}
        size="small"
      />
    </div>
  );
};
