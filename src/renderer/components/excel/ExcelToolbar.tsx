/**
 * Excel 工具栏组件
 * 提供格式化、撤销重做等操作按钮
 */

import React from 'react';
import { Button, Tooltip, Divider, Select, ColorPicker } from 'antd';
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
  PlusOutlined,
  MinusOutlined,
  ImportOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { CellStyle, NumberFormat } from '@shared/types';

interface ExcelToolbarProps {
  selectedStyle: CellStyle | null;
  canUndo: boolean;
  canRedo: boolean;
  onStyleChange: (style: Partial<CellStyle>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onInsertRow: () => void;
  onDeleteRow: () => void;
  onInsertColumn: () => void;
  onDeleteColumn: () => void;
  onImport: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
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
  onStyleChange,
  onUndo,
  onRedo,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
  onImport,
  onExportXlsx,
  onExportCsv,
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

      {/* 行列操作 */}
      <Tooltip title="插入行">
        <Button 
          icon={<PlusOutlined />}
          onClick={onInsertRow}
          size="small"
        >
          行
        </Button>
      </Tooltip>
      <Tooltip title="删除行">
        <Button 
          icon={<MinusOutlined />}
          onClick={onDeleteRow}
          size="small"
        >
          行
        </Button>
      </Tooltip>
      <Tooltip title="插入列">
        <Button 
          icon={<PlusOutlined />}
          onClick={onInsertColumn}
          size="small"
        >
          列
        </Button>
      </Tooltip>
      <Tooltip title="删除列">
        <Button 
          icon={<MinusOutlined />}
          onClick={onDeleteColumn}
          size="small"
        >
          列
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
    </div>
  );
};
