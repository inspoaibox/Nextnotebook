import React, { useCallback } from 'react';
import { Button, Tooltip, Divider, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  StrikethroughOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  LinkOutlined,
  PictureOutlined,
  TableOutlined,
  LineOutlined,
  FontSizeOutlined,
  BlockOutlined,
  MenuOutlined,
  UndoOutlined,
  RedoOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  content: string;
  onContentChange: (content: string) => void;
  onInsertImage?: () => void;
  onInsertAttachment?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  disabled?: boolean;
}

// 工具栏按钮样式
const toolbarButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  minWidth: 32,
  height: 28,
};

const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  textareaRef,
  content,
  onContentChange,
  onInsertImage,
  onInsertAttachment,
  isFullscreen = false,
  onToggleFullscreen,
  disabled = false,
}) => {
  // 获取选中文本的位置信息
  const getSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { start: 0, end: 0, text: '' };
    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      text: content.substring(textarea.selectionStart, textarea.selectionEnd),
    };
  }, [textareaRef, content]);

  // 插入文本并更新光标位置
  const insertText = useCallback((
    before: string,
    after: string = '',
    placeholder: string = '',
    selectPlaceholder: boolean = true
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { start, end, text } = getSelection();
    const selectedText = text || placeholder;
    const newContent = content.substring(0, start) + before + selectedText + after + content.substring(end);
    
    onContentChange(newContent);

    // 延迟设置光标位置
    setTimeout(() => {
      textarea.focus();
      if (text) {
        // 如果有选中文本，选中插入后的文本
        textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
      } else if (selectPlaceholder && placeholder) {
        // 选中占位符
        textarea.setSelectionRange(start + before.length, start + before.length + placeholder.length);
      } else {
        // 光标放在插入内容之后
        textarea.setSelectionRange(start + before.length + selectedText.length + after.length, start + before.length + selectedText.length + after.length);
      }
    }, 0);
  }, [textareaRef, content, getSelection, onContentChange]);

  // 在行首插入文本
  const insertAtLineStart = useCallback((prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { start } = getSelection();
    // 找到当前行的开始位置
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart);
    
    onContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  }, [textareaRef, content, getSelection, onContentChange]);

  // 切换行首前缀（如列表）
  const toggleLinePrefix = useCallback((prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { start, end } = getSelection();
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = content.indexOf('\n', end);
    const actualLineEnd = lineEnd === -1 ? content.length : lineEnd;
    const lineContent = content.substring(lineStart, actualLineEnd);

    let newContent: string;
    let newCursorPos: number;

    if (lineContent.startsWith(prefix)) {
      // 移除前缀
      newContent = content.substring(0, lineStart) + lineContent.substring(prefix.length) + content.substring(actualLineEnd);
      newCursorPos = Math.max(lineStart, start - prefix.length);
    } else {
      // 添加前缀
      newContent = content.substring(0, lineStart) + prefix + lineContent + content.substring(actualLineEnd);
      newCursorPos = start + prefix.length;
    }

    onContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [textareaRef, content, getSelection, onContentChange]);

  // 插入代码块
  const insertCodeBlock = useCallback((language: string = '') => {
    const { text } = getSelection();
    if (text) {
      insertText('```' + language + '\n', '\n```', text, false);
    } else {
      insertText('```' + language + '\n', '\n```', '代码', true);
    }
  }, [getSelection, insertText]);

  // 插入表格
  const insertTable = useCallback((rows: number = 3, cols: number = 3) => {
    const header = '| ' + Array(cols).fill('表头').join(' | ') + ' |';
    const separator = '| ' + Array(cols).fill('---').join(' | ') + ' |';
    const bodyRows = Array(rows - 1).fill('| ' + Array(cols).fill('内容').join(' | ') + ' |').join('\n');
    const table = '\n' + header + '\n' + separator + '\n' + bodyRows + '\n';
    insertText(table, '', '', false);
  }, [insertText]);

  // 标题菜单
  const headingMenuItems: MenuProps['items'] = [
    { key: 'h1', label: '一级标题', onClick: () => insertAtLineStart('# ') },
    { key: 'h2', label: '二级标题', onClick: () => insertAtLineStart('## ') },
    { key: 'h3', label: '三级标题', onClick: () => insertAtLineStart('### ') },
    { key: 'h4', label: '四级标题', onClick: () => insertAtLineStart('#### ') },
    { key: 'h5', label: '五级标题', onClick: () => insertAtLineStart('##### ') },
    { key: 'h6', label: '六级标题', onClick: () => insertAtLineStart('###### ') },
  ];

  // 代码块语言菜单
  const codeMenuItems: MenuProps['items'] = [
    { key: 'plain', label: '纯文本', onClick: () => insertCodeBlock('') },
    { type: 'divider' },
    { key: 'javascript', label: 'JavaScript', onClick: () => insertCodeBlock('javascript') },
    { key: 'typescript', label: 'TypeScript', onClick: () => insertCodeBlock('typescript') },
    { key: 'python', label: 'Python', onClick: () => insertCodeBlock('python') },
    { key: 'java', label: 'Java', onClick: () => insertCodeBlock('java') },
    { key: 'cpp', label: 'C/C++', onClick: () => insertCodeBlock('cpp') },
    { key: 'csharp', label: 'C#', onClick: () => insertCodeBlock('csharp') },
    { key: 'go', label: 'Go', onClick: () => insertCodeBlock('go') },
    { key: 'rust', label: 'Rust', onClick: () => insertCodeBlock('rust') },
    { key: 'sql', label: 'SQL', onClick: () => insertCodeBlock('sql') },
    { key: 'html', label: 'HTML', onClick: () => insertCodeBlock('html') },
    { key: 'css', label: 'CSS', onClick: () => insertCodeBlock('css') },
    { key: 'json', label: 'JSON', onClick: () => insertCodeBlock('json') },
    { key: 'yaml', label: 'YAML', onClick: () => insertCodeBlock('yaml') },
    { key: 'markdown', label: 'Markdown', onClick: () => insertCodeBlock('markdown') },
    { key: 'bash', label: 'Bash/Shell', onClick: () => insertCodeBlock('bash') },
  ];

  // 表格菜单
  const tableMenuItems: MenuProps['items'] = [
    { key: '2x2', label: '2 × 2 表格', onClick: () => insertTable(2, 2) },
    { key: '3x3', label: '3 × 3 表格', onClick: () => insertTable(3, 3) },
    { key: '4x4', label: '4 × 4 表格', onClick: () => insertTable(4, 4) },
    { key: '5x3', label: '5 × 3 表格', onClick: () => insertTable(5, 3) },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderBottom: '1px solid var(--border-color, #f0f0f0)',
        background: 'var(--bg-secondary, #fafafa)',
        flexWrap: 'wrap',
        gap: 2,
      }}
    >
      {/* 标题 */}
      <Dropdown menu={{ items: headingMenuItems }} trigger={['click']} disabled={disabled}>
        <Tooltip title="标题">
          <Button type="text" size="small" style={toolbarButtonStyle} icon={<FontSizeOutlined />} disabled={disabled} />
        </Tooltip>
      </Dropdown>

      <Divider type="vertical" style={{ margin: '0 4px' }} />

      {/* 文本格式 */}
      <Tooltip title="粗体 (Ctrl+B)">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<BoldOutlined />}
          onClick={() => insertText('**', '**', '粗体文本')}
          disabled={disabled}
        />
      </Tooltip>
      <Tooltip title="斜体 (Ctrl+I)">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<ItalicOutlined />}
          onClick={() => insertText('*', '*', '斜体文本')}
          disabled={disabled}
        />
      </Tooltip>
      <Tooltip title="删除线">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<StrikethroughOutlined />}
          onClick={() => insertText('~~', '~~', '删除线文本')}
          disabled={disabled}
        />
      </Tooltip>
      <Tooltip title="行内代码">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<CodeOutlined />}
          onClick={() => insertText('`', '`', 'code')}
          disabled={disabled}
        />
      </Tooltip>

      <Divider type="vertical" style={{ margin: '0 4px' }} />

      {/* 列表 */}
      <Tooltip title="无序列表">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<UnorderedListOutlined />}
          onClick={() => toggleLinePrefix('- ')}
          disabled={disabled}
        />
      </Tooltip>
      <Tooltip title="有序列表">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<OrderedListOutlined />}
          onClick={() => toggleLinePrefix('1. ')}
          disabled={disabled}
        />
      </Tooltip>
      <Tooltip title="任务列表">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<CheckSquareOutlined />}
          onClick={() => toggleLinePrefix('- [ ] ')}
          disabled={disabled}
        />
      </Tooltip>

      <Divider type="vertical" style={{ margin: '0 4px' }} />

      {/* 引用和代码块 */}
      <Tooltip title="引用">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<MenuOutlined style={{ transform: 'rotate(180deg)' }} />}
          onClick={() => toggleLinePrefix('> ')}
          disabled={disabled}
        />
      </Tooltip>
      <Dropdown menu={{ items: codeMenuItems }} trigger={['click']} disabled={disabled}>
        <Tooltip title="代码块">
          <Button type="text" size="small" style={toolbarButtonStyle} icon={<BlockOutlined />} disabled={disabled} />
        </Tooltip>
      </Dropdown>

      <Divider type="vertical" style={{ margin: '0 4px' }} />

      {/* 链接和媒体 */}
      <Tooltip title="链接">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<LinkOutlined />}
          onClick={() => insertText('[', '](https://)', '链接文本')}
          disabled={disabled}
        />
      </Tooltip>
      <Tooltip title="图片">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<PictureOutlined />}
          onClick={onInsertImage || (() => insertText('![', '](图片地址)', '图片描述'))}
          disabled={disabled}
        />
      </Tooltip>
      {onInsertAttachment && (
        <Tooltip title="附件">
          <Button
            type="text"
            size="small"
            style={toolbarButtonStyle}
            icon={<PaperClipOutlined />}
            onClick={onInsertAttachment}
            disabled={disabled}
          />
        </Tooltip>
      )}

      <Divider type="vertical" style={{ margin: '0 4px' }} />

      {/* 表格和分割线 */}
      <Dropdown menu={{ items: tableMenuItems }} trigger={['click']} disabled={disabled}>
        <Tooltip title="表格">
          <Button type="text" size="small" style={toolbarButtonStyle} icon={<TableOutlined />} disabled={disabled} />
        </Tooltip>
      </Dropdown>
      <Tooltip title="分割线">
        <Button
          type="text"
          size="small"
          style={toolbarButtonStyle}
          icon={<LineOutlined />}
          onClick={() => insertText('\n---\n', '', '', false)}
          disabled={disabled}
        />
      </Tooltip>

      {/* 右侧工具 */}
      <div style={{ flex: 1 }} />
      
      {onToggleFullscreen && (
        <Tooltip title={isFullscreen ? '退出全屏' : '全屏编辑'}>
          <Button
            type="text"
            size="small"
            style={toolbarButtonStyle}
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={onToggleFullscreen}
            disabled={disabled}
          />
        </Tooltip>
      )}
    </div>
  );
};

export default MarkdownToolbar;
