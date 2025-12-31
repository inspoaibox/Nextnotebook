/**
 * useRealTimePreview - 实时预览 Hook
 * 支持防抖处理和低分辨率预览
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ProcessOptions, ProcessResult, imageApi } from '../services/imageApi';

// 实时预览配置
export interface RealTimePreviewConfig {
  enabled: boolean;
  debounceMs: number;
  previewScale: number; // 预览缩放比例
}

// 默认配置
const DEFAULT_CONFIG: RealTimePreviewConfig = {
  enabled: true,
  debounceMs: 300,
  previewScale: 0.5,
};

/**
 * 实时预览 Hook
 */
export function useRealTimePreview(
  imageData: string | null,
  config: Partial<RealTimePreviewConfig> = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [previewResult, setPreviewResult] = useState<ProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 防抖定时器
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 请求计数器（用于取消过期请求）
  const requestIdRef = useRef(0);

  /**
   * 清除防抖定时器
   */
  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  /**
   * 执行预览处理
   */
  const processPreview = useCallback(async (
    options: ProcessOptions,
    immediate: boolean = false
  ) => {
    if (!imageData || !mergedConfig.enabled) {
      return;
    }

    // 清除之前的定时器
    clearDebounceTimer();

    const doProcess = async () => {
      const currentRequestId = ++requestIdRef.current;
      
      setIsProcessing(true);
      setError(null);

      try {
        // 使用低分辨率预览
        const previewOptions: ProcessOptions = {
          ...options,
          // 如果有 resize 选项，按比例缩小
          resize: options.resize ? {
            ...options.resize,
            width: options.resize.width 
              ? Math.round(options.resize.width * mergedConfig.previewScale) 
              : undefined,
            height: options.resize.height 
              ? Math.round(options.resize.height * mergedConfig.previewScale) 
              : undefined,
          } : undefined,
        };

        const result = await imageApi.process(imageData, previewOptions);

        // 检查请求是否过期
        if (currentRequestId === requestIdRef.current) {
          setPreviewResult(result);
        }
      } catch (err) {
        // 检查请求是否过期
        if (currentRequestId === requestIdRef.current) {
          setError((err as Error).message);
        }
      } finally {
        // 检查请求是否过期
        if (currentRequestId === requestIdRef.current) {
          setIsProcessing(false);
        }
      }
    };

    if (immediate) {
      await doProcess();
    } else {
      // 防抖处理
      debounceTimerRef.current = setTimeout(doProcess, mergedConfig.debounceMs);
    }
  }, [imageData, mergedConfig.enabled, mergedConfig.debounceMs, mergedConfig.previewScale, clearDebounceTimer]);

  /**
   * 取消当前预览
   */
  const cancelPreview = useCallback(() => {
    clearDebounceTimer();
    requestIdRef.current++;
    setIsProcessing(false);
  }, [clearDebounceTimer]);

  /**
   * 清除预览结果
   */
  const clearPreview = useCallback(() => {
    cancelPreview();
    setPreviewResult(null);
    setError(null);
  }, [cancelPreview]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      clearDebounceTimer();
    };
  }, [clearDebounceTimer]);

  return {
    // 状态
    previewResult,
    isProcessing,
    error,
    
    // 方法
    processPreview,
    cancelPreview,
    clearPreview,
  };
}

export default useRealTimePreview;
