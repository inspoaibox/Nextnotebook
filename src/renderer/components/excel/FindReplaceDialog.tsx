/**
 * 查找替换对话框组件
 * 支持 Ctrl+F 查找，Ctrl+H 替换
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal, Input, Button, Checkbox, Space, Tag, message } from 'antd';
import { SearchOutlined, SwapOutlined } from '@ant-design/icons';

export interface FindResult {
  row: number;
  col: number;
  value: string;
}

interface FindReplaceDialogProps {
  open: boolean;
  mode: 'find' | 'replace';
  onClose: () => void;
  onFind: (searchText: string, options: FindOptions) => FindResult[];
  onReplace: (searchText: string, replaceText: string, options: FindOptions) => number;
  onReplaceAll: (searchText: string, replaceText: string, options: FindOptions) => number;
  onNavigateToResult: (result: FindResult) => void;
}

export interface FindOptions {
  caseSensitive: boolean;
  wholeCell: boolean;
  useRegex: boolean;
}

export const FindReplaceDialog: React.FC<FindReplaceDialogProps> = ({
  open,
  mode,
  onClose,
  onFind,
  onReplace,
  onReplaceAll,
  onNavigateToResult,
}) => {
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [options, setOptions] = useState<FindOptions>({
    caseSensitive: false,
    wholeCell: false,
    useRegex: false,
  });
  const [results, setResults] = useState<FindResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isReplaceMode, setIsReplaceMode] = useState(mode === 'replace');
  
  const searchInputRef = useRef<any>(null);

  // 当对话框打开时聚焦搜索框
  useEffect(() => {
    if (open) {
      setIsReplaceMode(mode === 'replace');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open, mode]);

  // 执行查找
  const handleFind = useCallback(() => {
    if (!searchText.trim()) {
      setResults([]);
      setCurrentIndex(-1);
      return;
    }
    
    const foundResults = onFind(searchText, options);
    setResults(foundResults);
    
    if (foundResults.length > 0) {
      setCurrentIndex(0);
      onNavigateToResult(foundResults[0]);
      message.info(`找到 ${foundResults.length} 个匹配项`);
    } else {
      setCurrentIndex(-1);
      message.info('未找到匹配项');
    }
  }, [searchText, options, onFind, onNavigateToResult]);

  // 查找下一个
  const handleFindNext = useCallback(() => {
    if (results.length === 0) {
      handleFind();
      return;
    }
    
    const nextIndex = (currentIndex + 1) % results.length;
    setCurrentIndex(nextIndex);
    onNavigateToResult(results[nextIndex]);
  }, [results, currentIndex, handleFind, onNavigateToResult]);

  // 查找上一个
  const handleFindPrev = useCallback(() => {
    if (results.length === 0) {
      handleFind();
      return;
    }
    
    const prevIndex = currentIndex <= 0 ? results.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    onNavigateToResult(results[prevIndex]);
  }, [results, currentIndex, handleFind, onNavigateToResult]);

  // 替换当前
  const handleReplace = useCallback(() => {
    if (!searchText.trim() || currentIndex < 0) return;
    
    const count = onReplace(searchText, replaceText, options);
    if (count > 0) {
      // 重新查找
      const foundResults = onFind(searchText, options);
      setResults(foundResults);
      if (foundResults.length > 0) {
        const newIndex = Math.min(currentIndex, foundResults.length - 1);
        setCurrentIndex(newIndex);
        onNavigateToResult(foundResults[newIndex]);
      } else {
        setCurrentIndex(-1);
      }
      message.success('已替换');
    }
  }, [searchText, replaceText, options, currentIndex, onReplace, onFind, onNavigateToResult]);

  // 全部替换
  const handleReplaceAll = useCallback(() => {
    if (!searchText.trim()) return;
    
    const count = onReplaceAll(searchText, replaceText, options);
    if (count > 0) {
      message.success(`已替换 ${count} 处`);
      setResults([]);
      setCurrentIndex(-1);
    } else {
      message.info('未找到匹配项');
    }
  }, [searchText, replaceText, options, onReplaceAll]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handleFindPrev();
      } else {
        handleFindNext();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [handleFindNext, handleFindPrev, onClose]);

  return (
    <Modal
      title={
        <Space>
          {isReplaceMode ? <SwapOutlined /> : <SearchOutlined />}
          {isReplaceMode ? '查找和替换' : '查找'}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={450}
      destroyOnClose={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onKeyDown={handleKeyDown}>
        {/* 查找输入 */}
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>查找内容</div>
          <Input
            ref={searchInputRef}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="输入要查找的内容"
            suffix={
              results.length > 0 ? (
                <Tag color="blue">{currentIndex + 1}/{results.length}</Tag>
              ) : null
            }
          />
        </div>

        {/* 替换输入 */}
        {isReplaceMode && (
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>替换为</div>
            <Input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="输入替换内容"
            />
          </div>
        )}

        {/* 选项 */}
        <Space wrap>
          <Checkbox
            checked={options.caseSensitive}
            onChange={(e) => setOptions({ ...options, caseSensitive: e.target.checked })}
          >
            区分大小写
          </Checkbox>
          <Checkbox
            checked={options.wholeCell}
            onChange={(e) => setOptions({ ...options, wholeCell: e.target.checked })}
          >
            整个单元格匹配
          </Checkbox>
          <Checkbox
            checked={options.useRegex}
            onChange={(e) => setOptions({ ...options, useRegex: e.target.checked })}
          >
            使用正则表达式
          </Checkbox>
        </Space>

        {/* 模式切换 */}
        <div>
          <Button
            type="link"
            size="small"
            onClick={() => setIsReplaceMode(!isReplaceMode)}
            style={{ padding: 0 }}
          >
            {isReplaceMode ? '切换到查找模式' : '切换到替换模式'}
          </Button>
        </div>

        {/* 操作按钮 */}
        <Space style={{ justifyContent: 'flex-end', display: 'flex' }}>
          <Button onClick={handleFindPrev} disabled={results.length === 0}>
            上一个
          </Button>
          <Button onClick={handleFindNext} type={results.length === 0 ? 'primary' : 'default'}>
            {results.length === 0 ? '查找' : '下一个'}
          </Button>
          {isReplaceMode && (
            <>
              <Button onClick={handleReplace} disabled={currentIndex < 0}>
                替换
              </Button>
              <Button onClick={handleReplaceAll} type="primary">
                全部替换
              </Button>
            </>
          )}
        </Space>
      </div>
    </Modal>
  );
};
