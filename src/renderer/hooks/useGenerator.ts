/**
 * useGenerator Hook
 * 管理密码/资料生成器的状态和逻辑
 */

import { useState, useCallback } from 'react';
import {
  GeneratorOptions,
  GeneratedProfile,
  DEFAULT_GENERATOR_OPTIONS,
  GeneratorCountryCode,
  GeneratorGender,
  PasswordOptions,
  GeneratorIncludeFields,
} from '@shared/types';
import {
  generateProfile,
  generateBatch,
  validateGeneratorOptions,
  formatProfileAsNotes,
  formatProfileForCopy,
} from '../services/fakerGenerator';

export interface UseGeneratorReturn {
  // 配置状态
  options: GeneratorOptions;
  setCountry: (country: GeneratorCountryCode) => void;
  setGender: (gender: GeneratorGender) => void;
  setQuantity: (quantity: number) => void;
  setPasswordOptions: (options: PasswordOptions) => void;
  setIncludeFields: (fields: GeneratorIncludeFields) => void;
  toggleIncludeField: (field: keyof GeneratorIncludeFields) => void;
  resetOptions: () => void;
  
  // 生成结果
  profiles: GeneratedProfile[];
  loading: boolean;
  error: string | null;
  
  // 操作
  generate: () => void;
  clearProfiles: () => void;
  
  // 工具函数
  formatAsNotes: (profile: GeneratedProfile) => string;
  formatForCopy: (profile: GeneratedProfile) => string;
}

export function useGenerator(): UseGeneratorReturn {
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_GENERATOR_OPTIONS);
  const [profiles, setProfiles] = useState<GeneratedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 设置国家
  const setCountry = useCallback((country: GeneratorCountryCode) => {
    setOptions(prev => ({ ...prev, country }));
  }, []);

  // 设置性别
  const setGender = useCallback((gender: GeneratorGender) => {
    setOptions(prev => ({ ...prev, gender }));
  }, []);

  // 设置数量
  const setQuantity = useCallback((quantity: number) => {
    setOptions(prev => ({ ...prev, quantity }));
  }, []);

  // 设置密码选项
  const setPasswordOptions = useCallback((passwordOptions: PasswordOptions) => {
    setOptions(prev => ({ ...prev, passwordOptions }));
  }, []);

  // 设置可选字段
  const setIncludeFields = useCallback((includeFields: GeneratorIncludeFields) => {
    setOptions(prev => ({ ...prev, includeFields }));
  }, []);

  // 切换单个可选字段
  const toggleIncludeField = useCallback((field: keyof GeneratorIncludeFields) => {
    setOptions(prev => ({
      ...prev,
      includeFields: {
        ...prev.includeFields,
        [field]: !prev.includeFields[field],
      },
    }));
  }, []);

  // 重置选项
  const resetOptions = useCallback(() => {
    setOptions(DEFAULT_GENERATOR_OPTIONS);
  }, []);

  // 生成资料
  const generate = useCallback(() => {
    setError(null);
    
    // 验证选项
    const validationError = validateGeneratorOptions(options);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setLoading(true);
    
    try {
      const newProfiles = generateBatch(options);
      setProfiles(newProfiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }, [options]);

  // 清除生成结果
  const clearProfiles = useCallback(() => {
    setProfiles([]);
    setError(null);
  }, []);

  return {
    options,
    setCountry,
    setGender,
    setQuantity,
    setPasswordOptions,
    setIncludeFields,
    toggleIncludeField,
    resetOptions,
    profiles,
    loading,
    error,
    generate,
    clearProfiles,
    formatAsNotes: formatProfileAsNotes,
    formatForCopy: formatProfileForCopy,
  };
}
