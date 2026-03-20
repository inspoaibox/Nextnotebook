/**
 * 列筛选下拉组件
 * 类似 Excel 的列头筛选功能
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Dropdown, Checkbox, Input, Button, Space, Divider } from 'antd';
import { FilterOutlined, SortAscendingOutlined, SortDescendingOutlined, SearchOutlined } from '@ant-design/icons';
import { CellValue } from '@shared/types';

export interface ColumnFilter {
  column: number;
  selectedValues: Set<string>;
  selectAll: boolean;
}

interface ColumnFilterDropdownProps {
  column: number;
  columnValues: CellValue[];
  currentFilter?: ColumnFilter;
  onSort: (column: number, order: 'asc' | 'desc') => void;
  onFilter: (filter: ColumnFilter | null) => void;
}

export const ColumnFilterDropdown: React.FC<ColumnFilterDropdownProps> = ({
  column,
  columnValues,
  currentFilter,
  onSort,
  onFilter,
}) => {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedValues, setSelectedValues] = useState<Set<string>>(
    currentFilter?.selectedValues || new Set()
  );
  const [selectAll, setSelectAll] = useState(currentFilter?.selectAll ?? true);

  // 获取唯一值列表
  const uniqueValues = useMemo(() => {
    const valueSet = new Set<string>();
    columnValues.forEach(v => {
      const strValue = v === null || v === undefined ? '(空白)' : String(v);
      valueSet.add(strValue);
    });
    return Array.from(valueSet).sort((a, b) => {
      if (a === '(空白)') return 1;
      if (b === '(空白)') return -1;
      return a.localeCompare(b, 'zh-CN');
    });
  }, [columnValues]);

  // 过滤后的值列表
  const filteredValues = useMemo(() => {
    if (!searchText) return uniqueValues;
    const lower = searchText.toLowerCase();
    return uniqueValues.filter(v => v.toLowerCase().includes(lower));
  }, [uniqueValues, searchText]);

  // 当下拉打开时，同步当前筛选状态
  useEffect(() => {
    if (open) {
      if (currentFilter) {
        setSelectedValues(new Set(currentFilter.selectedValues));
        setSelectAll(currentFilter.selectAll);
      } else {
        setSelectedValues(new Set());
        setSelectAll(true);
      }
      setSearchText('');
    }
  }, [open, currentFilter]);

  // 处理全选
  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      // 全选：selectedValues 为空表示选择所有
      setSelectedValues(new Set());
    } else {
      // 取消全选：selectedValues 为空表示不选择任何值
      setSelectedValues(new Set());
    }
  }, []);

  // 处理单个值选择
  const handleValueChange = useCallback((value: string, checked: boolean) => {
    if (selectAll) {
      // 从全选状态切换
      if (!checked) {
        // 取消选择某个值 = 选择除了这个值以外的所有值
        const newSelected = new Set<string>();
        uniqueValues.forEach(v => {
          if (v !== value) newSelected.add(v);
        });
        setSelectAll(false);
        setSelectedValues(newSelected);
      }
      // 如果 checked 为 true，已经是全选状态，不需要做任何事
    } else {
      const newSelected = new Set(selectedValues);
      if (checked) {
        newSelected.add(value);
        // 检查是否变成全选
        if (newSelected.size === uniqueValues.length) {
          setSelectAll(true);
          setSelectedValues(new Set());
          return;
        }
      } else {
        newSelected.delete(value);
      }
      setSelectedValues(newSelected);
    }
  }, [selectedValues, selectAll, uniqueValues]);

  // 应用筛选
  const handleApply = useCallback(() => {
    if (selectAll) {
      // 全选 = 清除筛选
      onFilter(null);
    } else if (selectedValues.size === 0) {
      // 没有选择任何值 = 隐藏所有
      onFilter({ column, selectedValues: new Set(), selectAll: false });
    } else {
      onFilter({ column, selectedValues, selectAll: false });
    }
    setOpen(false);
  }, [column, selectAll, selectedValues, onFilter]);

  // 清除筛选
  const handleClear = useCallback(() => {
    onFilter(null);
    setSelectAll(true);
    setSelectedValues(new Set());
    setOpen(false);
  }, [onFilter]);

  // 判断值是否被选中
  const isValueChecked = useCallback((value: string) => {
    if (selectAll) return true;
    return selectedValues.has(value);
  }, [selectAll, selectedValues]);

  // 是否有活动筛选
  const hasFilter = currentFilter && !currentFilter.selectAll;

  const dropdownContent = (
    <div 
      style={{ 
        width: 220, 
        background: '#fff', 
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        padding: 8,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* 排序按钮 */}
      <Space style={{ width: '100%', marginBottom: 8 }}>
        <Button 
          size="small" 
          icon={<SortAscendingOutlined />}
          onClick={() => { onSort(column, 'asc'); setOpen(false); }}
          style={{ flex: 1 }}
        >
          升序
        </Button>
        <Button 
          size="small" 
          icon={<SortDescendingOutlined />}
          onClick={() => { onSort(column, 'desc'); setOpen(false); }}
          style={{ flex: 1 }}
        >
          降序
        </Button>
      </Space>
      
      <Divider style={{ margin: '8px 0' }} />
      
      {/* 搜索框 */}
      <Input
        size="small"
        placeholder="搜索..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      
      {/* 全选 */}
      <div style={{ marginBottom: 4 }}>
        <Checkbox
          checked={selectAll}
          indeterminate={!selectAll && selectedValues.size > 0 && selectedValues.size < uniqueValues.length}
          onChange={e => handleSelectAll(e.target.checked)}
        >
          (全选)
        </Checkbox>
      </div>
      
      {/* 值列表 */}
      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
        {filteredValues.map(value => (
          <div key={value} style={{ padding: '2px 0' }}>
            <Checkbox
              checked={isValueChecked(value)}
              onChange={e => handleValueChange(value, e.target.checked)}
            >
              <span style={{ 
                fontSize: 12,
                color: value === '(空白)' ? '#999' : undefined,
                fontStyle: value === '(空白)' ? 'italic' : undefined,
              }}>
                {value}
              </span>
            </Checkbox>
          </div>
        ))}
        {filteredValues.length === 0 && (
          <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 8 }}>
            无匹配项
          </div>
        )}
      </div>
      
      <Divider style={{ margin: '8px 0' }} />
      
      {/* 操作按钮 */}
      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button size="small" onClick={handleClear}>
          清除
        </Button>
        <Button size="small" type="primary" onClick={handleApply}>
          确定
        </Button>
      </Space>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      dropdownRender={() => dropdownContent}
      trigger={['click']}
      placement="bottomRight"
    >
      <div
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: 2,
          background: hasFilter ? '#1890ff' : 'transparent',
          color: hasFilter ? '#fff' : '#999',
          fontSize: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={e => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <FilterOutlined />
      </div>
    </Dropdown>
  );
};
