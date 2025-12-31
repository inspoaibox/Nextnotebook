/**
 * useImageHistory 属性测试
 * 使用 fast-check 进行属性测试
 * @jest-environment jsdom
 */

import * as fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';
import useImageHistory, { HistoryState, ImageToolType } from './useImageHistory';

// 生成随机工具类型
const toolTypeArb = fc.constantFrom<ImageToolType>(
  'format-convert',
  'resize',
  'crop',
  'rotate-flip',
  'color-adjust',
  'filters',
  'watermark',
  'metadata',
  'compress'
);

// 生成随机历史状态（不含 id 和 timestamp）
const historyStateArb = fc.record({
  toolType: toolTypeArb,
  options: fc.record({
    format: fc.option(fc.constantFrom('jpeg' as const, 'png' as const, 'webp' as const), { nil: undefined }),
    quality: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  }),
  previewUrl: fc.string(),
  result: fc.option(
    fc.record({
      buffer: fc.string(),
      info: fc.record({
        format: fc.string(),
        width: fc.integer({ min: 1, max: 10000 }),
        height: fc.integer({ min: 1, max: 10000 }),
        size: fc.integer({ min: 1, max: 100000000 }),
      }),
    }),
    { nil: undefined }
  ),
});

describe('useImageHistory Properties', () => {
  /**
   * Property 10: 历史记录
   * 对于任何处理操作，历史管理器应记录该操作，使 history.length 增加 1（直到最大限制）
   * **Validates: Requirements 7.1**
   */
  it('Property 10: history recording - push increases history length by 1 (up to max)', () => {
    fc.assert(
      fc.property(
        fc.array(historyStateArb, { minLength: 1, maxLength: 30 }),
        (states) => {
          const { result } = renderHook(() => useImageHistory());
          
          let expectedLength = 0;
          
          states.forEach((state) => {
            act(() => {
              result.current.push(state);
            });
            
            // 长度应该增加 1，但不超过 20
            expectedLength = Math.min(expectedLength + 1, 20);
            expect(result.current.historyLength).toBe(expectedLength);
          });
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11: 历史撤销/重做往返
   * 对于任何操作序列后的撤销，状态应匹配前一状态
   * 对于任何撤销后的重做，状态应匹配撤销前的状态
   * **Validates: Requirements 7.2, 7.3**
   */
  it('Property 11: undo/redo round-trip consistency', () => {
    fc.assert(
      fc.property(
        fc.array(historyStateArb, { minLength: 2, maxLength: 10 }),
        (states) => {
          const { result } = renderHook(() => useImageHistory());
          
          // 添加所有状态
          states.forEach((state) => {
            act(() => {
              result.current.push(state);
            });
          });
          
          // 获取当前状态
          const currentState = result.current.getCurrentState();
          expect(currentState).not.toBeNull();
          
          // 撤销
          let undoResult: HistoryState | null = null;
          act(() => {
            undoResult = result.current.undo();
          });
          
          // 撤销后应该得到前一个状态
          expect(undoResult).not.toBeNull();
          
          // 重做
          let redoResult: HistoryState | null = null;
          act(() => {
            redoResult = result.current.redo();
          });
          
          // 重做后应该回到撤销前的状态
          expect(redoResult).not.toBeNull();
          if (redoResult && currentState) {
            expect((redoResult as HistoryState).toolType).toBe((currentState as HistoryState).toolType);
            expect((redoResult as HistoryState).previewUrl).toBe((currentState as HistoryState).previewUrl);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: 历史限制执行
   * 对于任何数量的操作 N，历史长度永远不应超过 20 个状态
   * **Validates: Requirements 7.5**
   */
  it('Property 12: history length never exceeds 20', () => {
    fc.assert(
      fc.property(
        fc.array(historyStateArb, { minLength: 0, maxLength: 50 }),
        (states) => {
          const { result } = renderHook(() => useImageHistory());
          
          states.forEach((state) => {
            act(() => {
              result.current.push(state);
            });
            
            // 每次操作后，历史长度都不应超过 20
            expect(result.current.historyLength).toBeLessThanOrEqual(20);
          });
          
          return result.current.historyLength <= 20;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('useImageHistory Unit Tests', () => {
  it('should initialize with empty history', () => {
    const { result } = renderHook(() => useImageHistory());
    
    expect(result.current.history).toEqual([]);
    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.historyLength).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should add state to history', () => {
    const { result } = renderHook(() => useImageHistory());
    
    act(() => {
      result.current.push({
        toolType: 'resize',
        options: { resize: { width: 100, height: 100 } },
        previewUrl: 'data:image/png;base64,test',
      });
    });
    
    expect(result.current.historyLength).toBe(1);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.canUndo).toBe(false); // 只有一个状态，不能撤销
    expect(result.current.canRedo).toBe(false);
  });

  it('should support undo operation', () => {
    const { result } = renderHook(() => useImageHistory());
    
    // 添加两个状态
    act(() => {
      result.current.push({
        toolType: 'resize',
        options: {},
        previewUrl: 'url1',
      });
    });
    
    act(() => {
      result.current.push({
        toolType: 'crop',
        options: {},
        previewUrl: 'url2',
      });
    });
    
    expect(result.current.canUndo).toBe(true);
    
    // 撤销
    let undoState: HistoryState | null = null;
    act(() => {
      undoState = result.current.undo();
    });
    
    expect(undoState).not.toBeNull();
    if (undoState) {
      expect((undoState as HistoryState).toolType).toBe('resize');
    }
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('should support redo operation', () => {
    const { result } = renderHook(() => useImageHistory());
    
    // 添加两个状态
    act(() => {
      result.current.push({
        toolType: 'resize',
        options: {},
        previewUrl: 'url1',
      });
    });
    
    act(() => {
      result.current.push({
        toolType: 'crop',
        options: {},
        previewUrl: 'url2',
      });
    });
    
    // 撤销
    act(() => {
      result.current.undo();
    });
    
    // 重做
    let redoState: HistoryState | null = null;
    act(() => {
      redoState = result.current.redo();
    });
    
    expect(redoState).not.toBeNull();
    if (redoState) {
      expect((redoState as HistoryState).toolType).toBe('crop');
    }
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('should clear history when new image is loaded', () => {
    const { result } = renderHook(() => useImageHistory());
    
    // 添加一些状态
    act(() => {
      result.current.push({
        toolType: 'resize',
        options: {},
        previewUrl: 'url1',
      });
    });
    
    act(() => {
      result.current.push({
        toolType: 'crop',
        options: {},
        previewUrl: 'url2',
      });
    });
    
    expect(result.current.historyLength).toBe(2);
    
    // 清空历史
    act(() => {
      result.current.clear();
    });
    
    expect(result.current.historyLength).toBe(0);
    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should discard redo history when new operation is performed after undo', () => {
    const { result } = renderHook(() => useImageHistory());
    
    // 添加三个状态
    act(() => {
      result.current.push({ toolType: 'resize', options: {}, previewUrl: 'url1' });
    });
    act(() => {
      result.current.push({ toolType: 'crop', options: {}, previewUrl: 'url2' });
    });
    act(() => {
      result.current.push({ toolType: 'rotate-flip', options: {}, previewUrl: 'url3' });
    });
    
    expect(result.current.historyLength).toBe(3);
    
    // 撤销两次
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.undo();
    });
    
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.canRedo).toBe(true);
    
    // 添加新操作
    act(() => {
      result.current.push({ toolType: 'filters', options: {}, previewUrl: 'url4' });
    });
    
    // 重做历史应该被丢弃
    expect(result.current.historyLength).toBe(2);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.getCurrentState()?.toolType).toBe('filters');
  });
});
