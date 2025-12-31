/**
 * useRealTimePreview 属性测试
 * 使用 fast-check 进行属性测试
 * @jest-environment jsdom
 */

import * as fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';
import useRealTimePreview from './useRealTimePreview';

// Mock imageApi
jest.mock('../services/imageApi', () => ({
  imageApi: {
    process: jest.fn(),
  },
}));

import { imageApi } from '../services/imageApi';

const mockProcess = imageApi.process as jest.Mock;

describe('useRealTimePreview Properties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Property 3: 防抖防止过多请求
   * 对于防抖期间（300ms）内的 N 次快速参数变化，系统最多应在防抖期结束后发出 1 次处理请求
   * **Validates: Requirements 2.3**
   */
  it('Property 3: debounce prevents excessive requests', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }), // 快速变化次数
        (changeCount) => {
          // 每次测试前重置 mock
          mockProcess.mockReset();
          mockProcess.mockResolvedValue({
            buffer: 'test',
            info: { format: 'png', width: 100, height: 100, size: 1000 },
          });

          const { result, unmount } = renderHook(() => 
            useRealTimePreview('base64data', { debounceMs: 300 })
          );

          // 快速连续调用多次（不使用 immediate 参数，默认为 false）
          for (let i = 0; i < changeCount; i++) {
            act(() => {
              result.current.processPreview({ quality: 50 + i }, false);
            });
            // 每次调用间隔 50ms，但仍在防抖期内
            act(() => {
              jest.advanceTimersByTime(50);
            });
          }

          // 在防抖期间（最后一次调用后 300ms 内），不应该有任何请求
          const callsBeforeDebounce = mockProcess.mock.calls.length;
          expect(callsBeforeDebounce).toBe(0);

          // 快进到防抖期结束
          act(() => {
            jest.advanceTimersByTime(300);
          });

          // 应该只有一次请求
          expect(mockProcess).toHaveBeenCalledTimes(1);

          // 清理
          unmount();

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4: 预览使用低分辨率
   * 对于尺寸 (W, H) 大于 800 的图片，实时预览应使用缩小版本
   * **Validates: Requirements 2.4**
   */
  it('Property 4: preview uses lower resolution', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 801, max: 5000 }), // 原始宽度
        fc.integer({ min: 801, max: 5000 }), // 原始高度
        (width, height) => {
          // 每次测试前重置 mock
          mockProcess.mockReset();
          mockProcess.mockResolvedValue({
            buffer: 'test',
            info: { format: 'png', width: 100, height: 100, size: 1000 },
          });

          const previewScale = 0.5;
          const { result, unmount } = renderHook(() => 
            useRealTimePreview('base64data', { previewScale })
          );

          act(() => {
            result.current.processPreview({ 
              resize: { width, height } 
            }, true); // immediate = true 跳过防抖
          });

          // 验证调用时使用了缩小的尺寸
          expect(mockProcess).toHaveBeenCalledWith(
            'base64data',
            expect.objectContaining({
              resize: expect.objectContaining({
                width: Math.round(width * previewScale),
                height: Math.round(height * previewScale),
              }),
            })
          );

          // 清理
          unmount();

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('useRealTimePreview Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with null preview result', () => {
    const { result } = renderHook(() => useRealTimePreview('base64data'));

    expect(result.current.previewResult).toBeNull();
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should not process when imageData is null', () => {
    const { result } = renderHook(() => useRealTimePreview(null));

    act(() => {
      result.current.processPreview({ quality: 80 });
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('should not process when disabled', () => {
    const { result } = renderHook(() => 
      useRealTimePreview('base64data', { enabled: false })
    );

    act(() => {
      result.current.processPreview({ quality: 80 });
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('should debounce multiple rapid calls', () => {
    mockProcess.mockResolvedValue({
      buffer: 'test',
      info: { format: 'png', width: 100, height: 100, size: 1000 },
    });

    const { result } = renderHook(() => 
      useRealTimePreview('base64data', { debounceMs: 300 })
    );

    // 快速连续调用
    act(() => {
      result.current.processPreview({ quality: 50 });
    });
    act(() => {
      result.current.processPreview({ quality: 60 });
    });
    act(() => {
      result.current.processPreview({ quality: 70 });
    });

    // 还没到防抖时间
    expect(mockProcess).not.toHaveBeenCalled();

    // 快进到防抖期结束
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // 只应该调用一次，使用最后的参数
    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(mockProcess).toHaveBeenCalledWith('base64data', { quality: 70 });
  });

  it('should process immediately when immediate flag is true', () => {
    mockProcess.mockResolvedValue({
      buffer: 'test',
      info: { format: 'png', width: 100, height: 100, size: 1000 },
    });

    const { result } = renderHook(() => useRealTimePreview('base64data'));

    act(() => {
      result.current.processPreview({ quality: 80 }, true);
    });

    // 应该立即调用，不需要等待防抖
    expect(mockProcess).toHaveBeenCalledTimes(1);
  });

  it('should cancel preview when cancelPreview is called', () => {
    mockProcess.mockResolvedValue({
      buffer: 'test',
      info: { format: 'png', width: 100, height: 100, size: 1000 },
    });

    const { result } = renderHook(() => useRealTimePreview('base64data'));

    act(() => {
      result.current.processPreview({ quality: 80 });
    });

    act(() => {
      result.current.cancelPreview();
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // 应该被取消，不会调用
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('should clear preview result when clearPreview is called', async () => {
    mockProcess.mockResolvedValue({
      buffer: 'test',
      info: { format: 'png', width: 100, height: 100, size: 1000 },
    });

    const { result } = renderHook(() => useRealTimePreview('base64data'));

    // 先处理一次
    await act(async () => {
      result.current.processPreview({ quality: 80 }, true);
      await Promise.resolve(); // 等待异步完成
    });

    // 清除预览
    act(() => {
      result.current.clearPreview();
    });

    expect(result.current.previewResult).toBeNull();
  });

  it('should handle processing errors', async () => {
    mockProcess.mockRejectedValue(new Error('Processing failed'));

    const { result } = renderHook(() => useRealTimePreview('base64data'));

    await act(async () => {
      result.current.processPreview({ quality: 80 }, true);
      await Promise.resolve(); // 等待异步完成
    });

    expect(result.current.error).toBe('Processing failed');
  });

  it('should scale resize options by previewScale', () => {
    mockProcess.mockResolvedValue({
      buffer: 'test',
      info: { format: 'png', width: 100, height: 100, size: 1000 },
    });

    const { result } = renderHook(() => 
      useRealTimePreview('base64data', { previewScale: 0.5 })
    );

    act(() => {
      result.current.processPreview({ 
        resize: { width: 1000, height: 800 } 
      }, true);
    });

    expect(mockProcess).toHaveBeenCalledWith(
      'base64data',
      expect.objectContaining({
        resize: {
          width: 500,
          height: 400,
        },
      })
    );
  });
});
