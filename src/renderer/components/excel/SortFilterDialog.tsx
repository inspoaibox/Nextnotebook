/**
 * 排序和筛选对话框组件
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Modal, Select, Radio, Button, Space, Tag, Checkbox, Input, Divider } from 'antd';
import { SortAscendingOutlined, SortDescendingOutlined, FilterOutlined } from '@ant-design/icons';

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

// 排序配置
export interface SortConfig {
  column: number;
  order: 'asc' | 'desc';
}

// 筛选条件
export interface FilterCondition {
  column: number;
  type: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'empty' | 'notEmpty';
  value: string;
  value2?: string; // 用于 between
}

interface SortDialogProps {
  open: boolean;
  columnCount: number;
  onClose: () => void;
  onSort: (config: SortConfig) => void;
}

export const SortDialog: React.FC<SortDialogProps> = ({
  open,
  columnCount,
  onClose,
  onSort,
}) => {
  const [column, setColumn] = useState(0);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  const columnOptions = useMemo(() => {
    return Array.from({ length: Math.min(columnCount, 26) }, (_, i) => ({
      value: i,
      label: `列 ${colToLetter(i)}`,
    }));
  }, [columnCount]);

  const handleSort = useCallback(() => {
    onSort({ column, order });
    onClose();
  }, [column, order, onSort, onClose]);

  return (
    <Modal
      title={
        <Space>
          <SortAscendingOutlined />
          排序
        </Space>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSort}
      okText="排序"
      cancelText="取消"
      width={350}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>排序列</div>
          <Select
            value={column}
            onChange={setColumn}
            options={columnOptions}
            style={{ width: '100%' }}
          />
        </div>
        
        <div>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>排序方式</div>
          <Radio.Group value={order} onChange={(e) => setOrder(e.target.value)}>
            <Radio.Button value="asc">
              <SortAscendingOutlined /> 升序 (A→Z, 1→9)
            </Radio.Button>
            <Radio.Button value="desc">
              <SortDescendingOutlined /> 降序 (Z→A, 9→1)
            </Radio.Button>
          </Radio.Group>
        </div>
      </div>
    </Modal>
  );
};

interface FilterDialogProps {
  open: boolean;
  columnCount: number;
  activeFilters: FilterCondition[];
  onClose: () => void;
  onApplyFilter: (conditions: FilterCondition[]) => void;
  onClearFilters: () => void;
}

export const FilterDialog: React.FC<FilterDialogProps> = ({
  open,
  columnCount,
  activeFilters,
  onClose,
  onApplyFilter,
  onClearFilters,
}) => {
  const [conditions, setConditions] = useState<FilterCondition[]>(
    activeFilters.length > 0 ? activeFilters : [{ column: 0, type: 'contains', value: '' }]
  );

  // 当对话框打开时，同步 activeFilters 到 conditions
  React.useEffect(() => {
    if (open) {
      setConditions(activeFilters.length > 0 ? activeFilters : [{ column: 0, type: 'contains', value: '' }]);
    }
  }, [open, activeFilters]);

  const columnOptions = useMemo(() => {
    return Array.from({ length: Math.min(columnCount, 26) }, (_, i) => ({
      value: i,
      label: `列 ${colToLetter(i)}`,
    }));
  }, [columnCount]);

  const filterTypeOptions = [
    { value: 'equals', label: '等于' },
    { value: 'contains', label: '包含' },
    { value: 'startsWith', label: '开头是' },
    { value: 'endsWith', label: '结尾是' },
    { value: 'greaterThan', label: '大于' },
    { value: 'lessThan', label: '小于' },
    { value: 'between', label: '介于' },
    { value: 'empty', label: '为空' },
    { value: 'notEmpty', label: '不为空' },
  ];

  const updateCondition = useCallback((index: number, updates: Partial<FilterCondition>) => {
    setConditions(prev => prev.map((c, i) => i === index ? { ...c, ...updates } : c));
  }, []);

  const addCondition = useCallback(() => {
    setConditions(prev => [...prev, { column: 0, type: 'contains', value: '' }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleApply = useCallback(() => {
    // 过滤掉空条件
    const validConditions = conditions.filter(c => 
      c.type === 'empty' || c.type === 'notEmpty' || c.value.trim() !== ''
    );
    onApplyFilter(validConditions);
    onClose();
  }, [conditions, onApplyFilter, onClose]);

  const handleClear = useCallback(() => {
    onClearFilters();
    setConditions([{ column: 0, type: 'contains', value: '' }]);
    onClose();
  }, [onClearFilters, onClose]);

  return (
    <Modal
      title={
        <Space>
          <FilterOutlined />
          筛选
          {activeFilters.length > 0 && <Tag color="blue">{activeFilters.length} 个条件</Tag>}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={handleClear} danger>清除筛选</Button>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleApply}>应用</Button>
        </Space>
      }
      width={500}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {conditions.map((condition, index) => (
          <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              value={condition.column}
              onChange={(v) => updateCondition(index, { column: v })}
              options={columnOptions}
              style={{ width: 100 }}
              size="small"
            />
            <Select
              value={condition.type}
              onChange={(v) => updateCondition(index, { type: v as FilterCondition['type'] })}
              options={filterTypeOptions}
              style={{ width: 100 }}
              size="small"
            />
            {condition.type !== 'empty' && condition.type !== 'notEmpty' && (
              <>
                <Input
                  value={condition.value}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  placeholder="值"
                  style={{ flex: 1 }}
                  size="small"
                />
                {condition.type === 'between' && (
                  <>
                    <span>到</span>
                    <Input
                      value={condition.value2 || ''}
                      onChange={(e) => updateCondition(index, { value2: e.target.value })}
                      placeholder="值"
                      style={{ flex: 1 }}
                      size="small"
                    />
                  </>
                )}
              </>
            )}
            {conditions.length > 1 && (
              <Button size="small" danger onClick={() => removeCondition(index)}>
                删除
              </Button>
            )}
          </div>
        ))}
        
        <Button type="dashed" onClick={addCondition} style={{ width: '100%' }}>
          + 添加条件
        </Button>
      </div>
    </Modal>
  );
};
