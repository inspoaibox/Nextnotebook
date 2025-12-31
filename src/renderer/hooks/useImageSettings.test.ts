/**
 * useImageSettings 属性测试
 * 使用 fast-check 进行属性测试
 * @jest-environment jsdom
 */

import * as fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';
import useImageSettings from './useImageSettings';
import { ImageToolType } from './useImageHistory';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

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

// 生成随机处理选项
const processOptionsArb = fc.record({
  format: fc.option(fc.constantFrom('jpeg' as const, 'png' as const, 'webp' as const), { nil: undefined }),
  quality: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  resize: fc.option(
    fc.record({
      width: fc.integer({ min: 1, max: 10000 }),
      height: fc.integer({ min: 1, max: 10000 }),
    }),
    { nil: undefined }
  ),
});

describe('useImageSettings Properties', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  /**
   * Property 13: 设置持久化
   * 对于用户保存的任何工具设置，重新加载应用程序应恢复这些设置
   * **Validates: Requirements 9.5**
   */
  it('Property 13: settings persistence - saved settings are restored on reload', () => {
    fc.assert(
      fc.property(
        toolTypeArb,
        processOptionsArb,
        (toolType, options) => {
          // 第一次渲染，保存设置
          const { result: result1, unmount: unmount1 } = renderHook(() => useImageSettings());

          act(() => {
            result1.current.saveToolSettings(toolType, options);
          });

          // 验证设置已保存
          const savedSettings = result1.current.getToolSettings(toolType);
          if (options.format !== undefined) {
            expect(savedSettings.format).toBe(options.format);
          }
          if (options.quality !== undefined) {
            expect(savedSettings.quality).toBe(options.quality);
          }

          // 卸载第一个 hook
          unmount1();

          // 第二次渲染，验证设置被恢复
          const { result: result2 } = renderHook(() => useImageSettings());

          const restoredSettings = result2.current.getToolSettings(toolType);
          if (options.format !== undefined) {
            expect(restoredSettings.format).toBe(options.format);
          }
          if (options.quality !== undefined) {
            expect(restoredSettings.quality).toBe(options.quality);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性：实时预览设置持久化
   */
  it('realTimePreview setting persists across reloads', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (enabled) => {
          // 第一次渲染，设置实时预览
          const { result: result1, unmount: unmount1 } = renderHook(() => useImageSettings());

          act(() => {
            result1.current.setRealTimePreview(enabled);
          });

          expect(result1.current.realTimePreview).toBe(enabled);

          unmount1();

          // 第二次渲染，验证设置被恢复
          const { result: result2 } = renderHook(() => useImageSettings());

          expect(result2.current.realTimePreview).toBe(enabled);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性：最后使用的工具持久化
   */
  it('lastUsedTool setting persists across reloads', () => {
    fc.assert(
      fc.property(
        toolTypeArb,
        (toolType) => {
          // 第一次渲染，设置最后使用的工具
          const { result: result1, unmount: unmount1 } = renderHook(() => useImageSettings());

          act(() => {
            result1.current.setLastUsedTool(toolType);
          });

          expect(result1.current.lastUsedTool).toBe(toolType);

          unmount1();

          // 第二次渲染，验证设置被恢复
          const { result: result2 } = renderHook(() => useImageSettings());

          expect(result2.current.lastUsedTool).toBe(toolType);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('useImageSettings Unit Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should initialize with default settings', () => {
    const { result } = renderHook(() => useImageSettings());

    expect(result.current.realTimePreview).toBe(true);
    expect(result.current.lastUsedTool).toBe('format-convert');
  });

  it('should update realTimePreview', () => {
    const { result } = renderHook(() => useImageSettings());

    act(() => {
      result.current.setRealTimePreview(false);
    });

    expect(result.current.realTimePreview).toBe(false);
  });

  it('should update lastUsedTool', () => {
    const { result } = renderHook(() => useImageSettings());

    act(() => {
      result.current.setLastUsedTool('crop');
    });

    expect(result.current.lastUsedTool).toBe('crop');
  });

  it('should save and retrieve tool settings', () => {
    const { result } = renderHook(() => useImageSettings());

    act(() => {
      result.current.saveToolSettings('resize', {
        resize: { width: 800, height: 600 },
      });
    });

    const settings = result.current.getToolSettings('resize');
    expect(settings.resize).toEqual({ width: 800, height: 600 });
  });

  it('should clear tool settings', () => {
    const { result } = renderHook(() => useImageSettings());

    act(() => {
      result.current.saveToolSettings('crop', { quality: 80 });
    });

    expect(result.current.getToolSettings('crop').quality).toBe(80);

    act(() => {
      result.current.clearToolSettings('crop');
    });

    expect(result.current.getToolSettings('crop')).toEqual({});
  });

  it('should reset all settings to defaults', () => {
    const { result } = renderHook(() => useImageSettings());

    act(() => {
      result.current.setRealTimePreview(false);
      result.current.setLastUsedTool('filters');
      result.current.saveToolSettings('compress', { quality: 50 });
    });

    expect(result.current.realTimePreview).toBe(false);
    expect(result.current.lastUsedTool).toBe('filters');

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.realTimePreview).toBe(true);
    expect(result.current.lastUsedTool).toBe('format-convert');
    expect(result.current.getToolSettings('compress')).toEqual({});
  });

  it('should merge tool settings when saving', () => {
    const { result } = renderHook(() => useImageSettings());

    act(() => {
      result.current.saveToolSettings('compress', { quality: 80 });
    });

    act(() => {
      result.current.saveToolSettings('compress', { format: 'webp' });
    });

    const settings = result.current.getToolSettings('compress');
    expect(settings.quality).toBe(80);
    expect(settings.format).toBe('webp');
  });

  it('should persist settings to localStorage', () => {
    const { result } = renderHook(() => useImageSettings());

    act(() => {
      result.current.setRealTimePreview(false);
    });

    const stored = localStorageMock.getItem('image-tool-settings');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.realTimePreview).toBe(false);
  });

  it('should load settings from localStorage on init', () => {
    // Pre-populate localStorage
    const settings = {
      realTimePreview: false,
      lastUsedTool: 'watermark',
      toolSettings: {
        watermark: { quality: 90 },
      },
    };
    localStorageMock.setItem('image-tool-settings', JSON.stringify(settings));

    const { result } = renderHook(() => useImageSettings());

    expect(result.current.realTimePreview).toBe(false);
    expect(result.current.lastUsedTool).toBe('watermark');
    expect(result.current.getToolSettings('watermark').quality).toBe(90);
  });
});
