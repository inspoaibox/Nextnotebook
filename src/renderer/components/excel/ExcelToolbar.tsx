/**
 * Excel 工具栏组件
 * 提供格式化、撤销重做等操作按钮
 */

import React from 'react';
import { Button, Tooltip, Divider, Select, ColorPicker, Badge } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UndoOutlined,
  RedoOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignMiddleOutlined,
  VerticalAlignBottomOutlined,
  BgColorsOutlined,
  FontColorsOutlined,
  ImportOutlined,
  ExportOutlined,
  MergeCellsOutlined,
  SplitCellsOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { CellStyle, NumberFormat } from '@shared/types';

interface ExcelToolbarProps {
  selectedStyle: CellStyle | null;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  isMerged: boolean;
  hasActiveFilters: boolean;
  showFilterButtons: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
  onSave?: () => void;
  onStyleChange: (style: Partial<CellStyle>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
  onMergeCells: () => void;
  onUnmergeCells: () => void;
  onFind: () => void;
  onReplace: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onToggleFilter: () => void;
  onClearFilters: () => void;
}

const numberFormatOptions = [
  { value: 'general', label: '常规' },
  { value: 'number', label: '数字' },
  { value: 'percentage', label: '百分比' },
  { value: 'currency', label: '货币' },
  { value: 'date', label: '日期' },
];

// 将选择值转换为 NumberFormat 对象
const valueToNumberFormat = (value: string): NumberFormat | null => {
  switch (value) {
    case 'general':
      return { type: 'general' };
    case 'number':
      return { type: 'number', decimals: 2 };
    case 'percentage':
      return { type: 'percentage', decimals: 2 };
    case 'currency':
      return { type: 'currency', symbol: '¥', decimals: 2 };
    case 'date':
      return { type: 'date', pattern: 'YYYY-MM-DD' };
    default:
      return null;
  }
};

// 将 NumberFormat 对象转换为选择值
const numberFormatToValue = (format: NumberFormat | null | undefined): string => {
  if (!format) return 'general';
  return format.type;
};

export const ExcelToolbar: React.FC<ExcelToolbarProps> = ({
  selectedStyle,
  canUndo,
  canRedo,
  hasSelection,
  isMerged,
  hasActiveFilters,
  showFilterButtons,
  isSaving = false,
  lastSaved = null,
  onSave,
  onStyleChange,
  onUndo,
  onRedo,
  onImport,
  onExportXlsx,
  onExportCsv,
  onMergeCells,
  onUnmergeCells,
  onFind,
  onReplace,
  onSortAsc,
  onSortDesc,
  onToggleFilter,
  onClearFilters,
}) => {
  return (
    <div className="excel-toolbar" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 4, 
      padding: '8px 12px',
      borderBottom: '1px solid #e8e8e8',
      background: '#fafafa',
      flexWrap: 'wrap',
    }}>
      {/* 保存按钮和状态 */}
      {onSave && (
        <>
          <Tooltip title={isSaving ? '保存中...' : '保存 (Ctrl+S)'}>
            <Button 
              type="primary"
              loading={isSaving}
              onClick={onSave}
              size="small"
            >
              {isSaving ? '保存中' : '保存'}
            </Button>
          </Tooltip>
          {lastSaved && !isSaving && (
            <span style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>
              {(() => {
                const now = new Date();
                const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);
                if (diff < 60) return '刚刚保存';
                if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前保存`;
                return lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              })()}
            </span>
          )}
          <Divider type="vertical" />
        </>
      )}

      {/* 撤销重做 */}
      <Tooltip title="撤销 (Ctrl+Z)">
        <Button 
          icon={<UndoOutlined />} 
          disabled={!canUndo}
          onClick={onUndo}
          size="small"
        />
      </Tooltip>
      <Tooltip title="重做 (Ctrl+Y)">
        <Button 
          icon={<RedoOutlined />} 
          disabled={!canRedo}
          onClick={onRedo}
          size="small"
        />
      </Tooltip>

      <Divider type="vertical" />

      {/* 字体样式 */}
      <Tooltip title="粗体 (Ctrl+B)">
        <Button 
          icon={<BoldOutlined />}
          type={selectedStyle?.font_bold ? 'primary' : 'default'}
          onClick={() => onStyleChange({ font_bold: !selectedStyle?.font_bold })}
          size="small"
        />
      </Tooltip>
      <Tooltip title="斜体 (Ctrl+I)">
        <Button 
          icon={<ItalicOutlined />}
          type={selectedStyle?.font_italic ? 'primary' : 'default'}
          onClick={() => onStyleChange({ font_italic: !selectedStyle?.font_italic })}
          size="small"
        />
      </Tooltip>

      <Divider type="vertical" />

      {/* 颜色 */}
      <Tooltip title="字体颜色">
        <ColorPicker
          value={selectedStyle?.font_color || '#000000'}
          onChange={(color) => onStyleChange({ font_color: color.toHexString() })}
          size="small"
        >
          <Button icon={<FontColorsOutlined />} size="small" />
        </ColorPicker>
      </Tooltip>
      <Tooltip title="背景颜色">
        <ColorPicker
          value={selectedStyle?.background_color || '#ffffff'}
          onChange={(color) => onStyleChange({ background_color: color.toHexString() })}
          size="small"
        >
          <Button icon={<BgColorsOutlined />} size="small" />
        </ColorPicker>
      </Tooltip>

      <Divider type="vertical" />

      {/* 水平对齐 */}
      <Tooltip title="左对齐">
        <Button 
          icon={<AlignLeftOutlined />}
          type={selectedStyle?.text_align === 'left' ? 'primary' : 'default'}
          onClick={() => onStyleChange({ text_align: 'left' })}
          size="small"
        />
      </Tooltip>
      <Tooltip title="居中对齐">
        <Button 
          icon={<AlignCenterOutlined />}
          type={selectedStyle?.text_align === 'center' ? 'primary' : 'default'}
          onClick={() => onStyleChange({ text_align: 'center' })}
          size="small"
        />
      </Tooltip>
      <Tooltip title="右对齐">
        <Button 
          icon={<AlignRightOutlined />}
          type={selectedStyle?.text_align === 'right' ? 'primary' : 'default'}
          onClick={() => onStyleChange({ text_align: 'right' })}
          size="small"
        />
      </Tooltip>

      <Divider type="vertical" />

      {/* 垂直对齐 */}
      <Tooltip title="顶部对齐">
        <Button 
          icon={<VerticalAlignTopOutlined />}
          type={selectedStyle?.vertical_align === 'top' ? 'primary' : 'default'}
          onClick={() => onStyleChange({ vertical_align: 'top' })}
          size="small"
        />
      </Tooltip>
      <Tooltip title="垂直居中">
        <Button 
          icon={<VerticalAlignMiddleOutlined />}
          type={selectedStyle?.vertical_align === 'middle' ? 'primary' : 'default'}
          onClick={() => onStyleChange({ vertical_align: 'middle' })}
          size="small"
        />
      </Tooltip>
      <Tooltip title="底部对齐">
        <Button 
          icon={<VerticalAlignBottomOutlined />}
          type={selectedStyle?.vertical_align === 'bottom' ? 'primary' : 'default'}
          onClick={() => onStyleChange({ vertical_align: 'bottom' })}
          size="small"
        />
      </Tooltip>

      <Divider type="vertical" />

      {/* 数字格式 */}
      <Select
        value={numberFormatToValue(selectedStyle?.number_format)}
        onChange={(value) => onStyleChange({ number_format: valueToNumberFormat(value) })}
        options={numberFormatOptions}
        size="small"
        style={{ width: 100 }}
      />

      <Divider type="vertical" />

      {/* 合并单元格 */}
      <Tooltip title="合并单元格">
        <Button 
          icon={<MergeCellsOutlined />}
          onClick={onMergeCells}
          disabled={!hasSelection || isMerged}
          size="small"
        >
          合并
        </Button>
      </Tooltip>
      <Tooltip title="取消合并">
        <Button 
          icon={<SplitCellsOutlined />}
          onClick={onUnmergeCells}
          disabled={!isMerged}
          size="small"
        >
          拆分
        </Button>
      </Tooltip>

      <Divider type="vertical" />

      {/* 导入导出 */}
      <Tooltip title="导入 Excel/CSV">
        <Button 
          icon={<ImportOutlined />}
          onClick={onImport}
          size="small"
        >
          导入
        </Button>
      </Tooltip>
      <Tooltip title="导出为 Excel">
        <Button 
          icon={<ExportOutlined />}
          onClick={onExportXlsx}
          size="small"
        >
          导出
        </Button>
      </Tooltip>

      <Divider type="vertical" />

      {/* 查找替换 */}
      <Tooltip title="查找 (Ctrl+F)">
        <Button 
          icon={<SearchOutlined />}
          onClick={onFind}
          size="small"
        >
          查找
        </Button>
      </Tooltip>

      <Divider type="vertical" />

      {/* 排序筛选 */}
      <Tooltip title="升序排序 (按当前选中列)">
        <Button 
          icon={<SortAscendingOutlined />}
          onClick={onSortAsc}
          size="small"
        >
          升序
        </Button>
      </Tooltip>
      <Tooltip title="降序排序 (按当前选中列)">
        <Button 
          icon={<SortDescendingOutlined />}
          onClick={onSortDesc}
          size="small"
        >
          降序
        </Button>
      </Tooltip>
      <Tooltip title={showFilterButtons ? '关闭筛选' : '启用筛选 (在列头显示筛选按钮)'}>
        <Badge dot={hasActiveFilters} offset={[-5, 5]}>
          <Button 
            icon={<FilterOutlined />}
            onClick={onToggleFilter}
            size="small"
            type={showFilterButtons ? 'primary' : 'default'}
          >
            筛选
          </Button>
        </Badge>
      </Tooltip>
      {hasActiveFilters && (
        <Tooltip title="清除所有筛选">
          <Button 
            size="small"
            onClick={onClearFilters}
            danger
          >
            清除
          </Button>
        </Tooltip>
      )}
    </div>
  );
};
