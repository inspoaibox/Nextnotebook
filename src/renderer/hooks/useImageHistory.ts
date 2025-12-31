/**
 * useImageHistory - 图片处理历史管理 Hook
 * 支持撤销/重做操作，最多保存 20 条历史记录
 */

import { useState, useCallback, useMemo } from 'react';
import { ProcessOptions, ProcessResult } from '../services/imageApi';

// 图片工具类型
export type ImageToolType =
  | 'format-convert'
  | 'resize'
  | 'crop'
  | 'rotate-flip'
  | 'color-adjust'
  | 'filters'
  | 'watermark'
  | 'metadata'
  | 'compress';

// 历史状态接口
export interface HistoryState {
  id: string;
  timestamp: number;
  toolType: ImageToolType;
  options: ProcessOptions;
  previewUrl: string;
  result?: ProcessResult;
}

// 历史管理器配置
const MAX_HISTORY = 20;

// 生成唯一 ID
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 图片处理历史管理 Hook
 */
export function useImageHistory() {
  // 历史记录数组
  const [history, setHistory] = useState<HistoryState[]>([]);
  // 当前索引（指向当前状态在历史中的位置）
  const [currentIndex, setCurrentIndex] = useState(-1);

  /**
   * 添加新的历史状态
   */
  const push = useCallback((state: Omit<HistoryState, 'id' | 'timestamp'>) => {
    const newState: HistoryState = {
      ...state,
      id: generateId(),
      timestamp: Date.now(),
    };

    setHistory(prev => {
      // 如果当前不在历史末尾，删除当前位置之后的所有记录
      const newHistory = prev.slice(0, currentIndex + 1);
      
      // 添加新状态
      newHistory.push(newState);
      
      // 如果超过最大限制，删除最旧的记录
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
        return newHistory;
      }
      
      return newHistory;
    });

    setCurrentIndex(prev => {
      // 计算新索引
      const newIndex = Math.min(prev + 1, MAX_HISTORY - 1);
      return newIndex;
    });
  }, [currentIndex]);

  /**
   * 撤销操作
   */
  const undo = useCallback((): HistoryState | null => {
    if (currentIndex <= 0) {
      return null;
    }

    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    return history[newIndex] || null;
  }, [currentIndex, history]);

  /**
   * 重做操作
   */
  const redo = useCallback((): HistoryState | null => {
    if (currentIndex >= history.length - 1) {
      return null;
    }

    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    return history[newIndex] || null;
  }, [currentIndex, history]);

  /**
   * 清空历史
   */
  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  /**
   * 获取当前状态
   */
  const getCurrentState = useCallback((): HistoryState | null => {
    if (currentIndex < 0 || currentIndex >= history.length) {
      return null;
    }
    return history[currentIndex];
  }, [currentIndex, history]);

  /**
   * 是否可以撤销
   */
  const canUndo = useMemo(() => currentIndex > 0, [currentIndex]);

  /**
   * 是否可以重做
   */
  const canRedo = useMemo(() => currentIndex < history.length - 1, [currentIndex, history.length]);

  /**
   * 历史记录长度
   */
  const historyLength = useMemo(() => history.length, [history]);

  return {
    // 状态
    history,
    currentIndex,
    historyLength,
    canUndo,
    canRedo,
    
    // 方法
    push,
    undo,
    redo,
    clear,
    getCurrentState,
  };
}

export default useImageHistory;
