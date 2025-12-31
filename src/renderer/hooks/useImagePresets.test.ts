/**
 * useImagePresets 属性测试
 * 使用 fast-check 进行属性测试
 * @jest-environment jsdom
 */

import * as fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';
import useImagePresets, { BUILTIN_PRESETS, Preset } from './useImagePresets';
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

// 生成随机预设名称
const presetNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

// 生成随机处理选项
const processOptionsArb = fc.record({
  format: fc.option(fc.constantFrom('jpeg' as const, 'png' as const, 'webp' as const), { nil: undefined }),
  quality: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  resize: fc.option(
    fc.record({
      width: fc.integer({ min: 1, max: 10000 }),
      height: fc.integer({ min: 1, max: 10000 }),
      fit: fc.constantFrom('cover' as const, 'contain' as const, 'fill' as const),
    }),
    { nil: undefined }
  ),
});

describe('useImagePresets Properties', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  /**
   * Property 9: 预设应用完整性
   * 对于任何预设 P 及其选项 O，应用预设应导致所有 O 中的选项被应用到当前工具配置
   * **Validates: Requirements 6.2**
   */
  it('Property 9: preset application completeness - all options are applied', () => {
    fc.assert(
      fc.property(
        toolTypeArb,
        presetNameArb,
        fc.string(),
        processOptionsArb,
        (toolType, name, description, options) => {
          const { result } = renderHook(() => useImagePresets());

          // 保存自定义预设
          let savedPreset: Preset | null = null;
          act(() => {
            savedPreset = result.current.saveCustomPreset(name, description, toolType, options);
          });

          expect(savedPreset).not.toBeNull();

          // 应用预设
          const appliedOptions = result.current.applyPreset(savedPreset!);

          // 验证所有选项都被正确应用
          if (options.format !== undefined) {
            expect(appliedOptions.format).toBe(options.format);
          }
          if (options.quality !== undefined) {
            expect(appliedOptions.quality).toBe(options.quality);
          }
          if (options.resize !== undefined) {
            expect(appliedOptions.resize).toEqual(options.resize);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性：保存的预设可以被检索
   */
  it('saved presets can be retrieved by tool type', () => {
    fc.assert(
      fc.property(
        toolTypeArb,
        presetNameArb,
        processOptionsArb,
        (toolType, name, options) => {
          const { result } = renderHook(() => useImagePresets());

          // 保存自定义预设
          act(() => {
            result.current.saveCustomPreset(name, 'test description', toolType, options);
          });

          // 获取该工具类型的预设
          const presets = result.current.getPresets(toolType);

          // 应该包含刚保存的预设
          const found = presets.find(p => p.name === name && p.category === 'custom');
          expect(found).toBeDefined();
          expect(found?.toolType).toBe(toolType);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性：删除预设后不再可检索
   */
  it('deleted presets are no longer retrievable', () => {
    fc.assert(
      fc.property(
        toolTypeArb,
        presetNameArb,
        processOptionsArb,
        (toolType, name, options) => {
          const { result } = renderHook(() => useImagePresets());

          // 保存自定义预设
          let savedPreset: Preset | null = null;
          act(() => {
            savedPreset = result.current.saveCustomPreset(name, 'test', toolType, options);
          });

          // 删除预设
          act(() => {
            result.current.deleteCustomPreset(savedPreset!.id);
          });

          // 不应该再找到该预设
          const found = result.current.getPresetById(savedPreset!.id);
          expect(found).toBeUndefined();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('useImagePresets Unit Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should have builtin presets', () => {
    const { result } = renderHook(() => useImagePresets());

    expect(result.current.builtinPresets.length).toBeGreaterThan(0);
    expect(result.current.builtinPresets).toEqual(BUILTIN_PRESETS);
  });

  it('should initialize with empty custom presets', () => {
    const { result } = renderHook(() => useImagePresets());

    expect(result.current.customPresets).toEqual([]);
  });

  it('should save custom preset', () => {
    const { result } = renderHook(() => useImagePresets());

    act(() => {
      result.current.saveCustomPreset(
        'My Preset',
        'A custom preset',
        'resize',
        { resize: { width: 500, height: 500 } }
      );
    });

    expect(result.current.customPresets.length).toBe(1);
    expect(result.current.customPresets[0].name).toBe('My Preset');
    expect(result.current.customPresets[0].category).toBe('custom');
  });

  it('should delete custom preset', () => {
    const { result } = renderHook(() => useImagePresets());

    let presetId: string = '';
    act(() => {
      const preset = result.current.saveCustomPreset(
        'To Delete',
        'Will be deleted',
        'crop',
        {}
      );
      presetId = preset.id;
    });

    expect(result.current.customPresets.length).toBe(1);

    act(() => {
      result.current.deleteCustomPreset(presetId);
    });

    expect(result.current.customPresets.length).toBe(0);
  });

  it('should not delete builtin presets', () => {
    const { result } = renderHook(() => useImagePresets());

    const builtinId = BUILTIN_PRESETS[0].id;

    act(() => {
      const deleted = result.current.deleteCustomPreset(builtinId);
      expect(deleted).toBe(false);
    });

    // Builtin presets should still exist
    expect(result.current.builtinPresets.length).toBe(BUILTIN_PRESETS.length);
  });

  it('should get presets by tool type', () => {
    const { result } = renderHook(() => useImagePresets());

    // Add custom preset for resize
    act(() => {
      result.current.saveCustomPreset('Custom Resize', 'test', 'resize', {});
    });

    const resizePresets = result.current.getPresets('resize');

    // Should include both builtin and custom presets for resize
    const builtinResizeCount = BUILTIN_PRESETS.filter(p => p.toolType === 'resize').length;
    expect(resizePresets.length).toBe(builtinResizeCount + 1);
  });

  it('should apply preset and return options', () => {
    const { result } = renderHook(() => useImagePresets());

    const preset = BUILTIN_PRESETS.find(p => p.id === 'web-optimize')!;
    const options = result.current.applyPreset(preset);

    expect(options.format).toBe('webp');
    expect(options.quality).toBe(80);
    expect(options.stripMetadata).toBe(true);
  });

  it('should persist custom presets to localStorage', () => {
    const { result } = renderHook(() => useImagePresets());

    act(() => {
      result.current.saveCustomPreset('Persistent', 'test', 'filters', { blur: 2 });
    });

    // Check localStorage
    const stored = localStorageMock.getItem('image-tool-presets');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Persistent');
  });

  it('should load custom presets from localStorage on init', () => {
    // Pre-populate localStorage
    const presets = [{
      id: 'test-preset',
      name: 'Loaded Preset',
      description: 'From storage',
      category: 'custom',
      toolType: 'compress',
      options: { quality: 50 },
    }];
    localStorageMock.setItem('image-tool-presets', JSON.stringify(presets));

    const { result } = renderHook(() => useImagePresets());

    // Wait for useEffect to run
    expect(result.current.customPresets.length).toBe(1);
    expect(result.current.customPresets[0].name).toBe('Loaded Preset');
  });

  it('should update custom preset', () => {
    const { result } = renderHook(() => useImagePresets());

    let presetId: string = '';
    act(() => {
      const preset = result.current.saveCustomPreset('Original', 'desc', 'resize', {});
      presetId = preset.id;
    });

    act(() => {
      result.current.updateCustomPreset(presetId, { name: 'Updated' });
    });

    const updated = result.current.getPresetById(presetId);
    expect(updated?.name).toBe('Updated');
  });

  it('should clear all custom presets', () => {
    const { result } = renderHook(() => useImagePresets());

    act(() => {
      result.current.saveCustomPreset('Preset 1', 'desc', 'resize', {});
    });
    
    act(() => {
      result.current.saveCustomPreset('Preset 2', 'desc', 'crop', {});
    });

    expect(result.current.customPresets.length).toBe(2);

    act(() => {
      result.current.clearCustomPresets();
    });

    expect(result.current.customPresets.length).toBe(0);
  });
});
