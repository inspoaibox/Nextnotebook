/**
 * GeneratorConfig 组件
 * 密码/资料生成器的配置面板
 */

import React from 'react';
import {
  Form,
  Select,
  InputNumber,
  Checkbox,
  Slider,
  Button,
  Divider,
  Space,
} from 'antd';
import { ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  GeneratorOptions,
  GeneratorCountryCode,
  GeneratorGender,
  PasswordOptions,
  GeneratorIncludeFields,
  COUNTRY_CONFIG,
} from '@shared/types';

interface GeneratorConfigProps {
  options: GeneratorOptions;
  onCountryChange: (country: GeneratorCountryCode) => void;
  onGenderChange: (gender: GeneratorGender) => void;
  onQuantityChange: (quantity: number) => void;
  onPasswordOptionsChange: (options: PasswordOptions) => void;
  onIncludeFieldsChange: (fields: GeneratorIncludeFields) => void;
  onGenerate: () => void;
  onReset: () => void;
  loading: boolean;
  error: string | null;
}

const GeneratorConfig: React.FC<GeneratorConfigProps> = ({
  options,
  onCountryChange,
  onGenderChange,
  onQuantityChange,
  onPasswordOptionsChange,
  onIncludeFieldsChange,
  onGenerate,
  onReset,
  loading,
  error,
}) => {
  // 国家选项
  const countryOptions = Object.entries(COUNTRY_CONFIG).map(([code, config]) => ({
    value: code,
    label: config.label,
  }));

  // 更新密码选项的辅助函数
  const updatePasswordOption = (key: keyof PasswordOptions, value: number | boolean) => {
    onPasswordOptionsChange({
      ...options.passwordOptions,
      [key]: value,
    });
  };

  // 更新可选字段的辅助函数
  const updateIncludeField = (key: keyof GeneratorIncludeFields, value: boolean) => {
    onIncludeFieldsChange({
      ...options.includeFields,
      [key]: value,
    });
  };

  // 检查是否至少选择了一种字符类型
  const hasValidCharTypes = 
    options.passwordOptions.uppercase ||
    options.passwordOptions.lowercase ||
    options.passwordOptions.numbers ||
    options.passwordOptions.symbols;

  return (
    <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      <Form layout="vertical" size="small">
        {/* 基础选项 - 国家和性别在一行 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <Form.Item label="国家/地区" style={{ marginBottom: 0, flex: 1 }}>
            <Select
              value={options.country}
              onChange={onCountryChange}
              options={countryOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="性别" style={{ marginBottom: 0, flex: 1 }}>
            <Select
              value={options.gender}
              onChange={onGenderChange}
              options={[
                { value: 'random', label: '随机' },
                { value: 'male', label: '男' },
                { value: 'female', label: '女' },
              ]}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>

        <Form.Item label="生成数量" style={{ marginBottom: 12 }}>
          <InputNumber
            value={options.quantity}
            onChange={v => onQuantityChange(v || 1)}
            min={1}
            max={100}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Divider style={{ margin: '12px 0' }}>密码设置</Divider>

        <Form.Item label={`密码长度: ${options.passwordOptions.length}`} style={{ marginBottom: 12 }}>
          <Slider
            value={options.passwordOptions.length}
            onChange={v => updatePasswordOption('length', v)}
            min={8}
            max={64}
            marks={{ 8: '8', 16: '16', 32: '32', 64: '64' }}
          />
        </Form.Item>

        <Form.Item label="字符类型" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            <Checkbox
              checked={options.passwordOptions.uppercase}
              onChange={e => updatePasswordOption('uppercase', e.target.checked)}
            >
              大写 (A-Z)
            </Checkbox>
            <Checkbox
              checked={options.passwordOptions.lowercase}
              onChange={e => updatePasswordOption('lowercase', e.target.checked)}
            >
              小写 (a-z)
            </Checkbox>
            <Checkbox
              checked={options.passwordOptions.numbers}
              onChange={e => updatePasswordOption('numbers', e.target.checked)}
            >
              数字 (0-9)
            </Checkbox>
            <Checkbox
              checked={options.passwordOptions.symbols}
              onChange={e => updatePasswordOption('symbols', e.target.checked)}
            >
              符号 (!@#$)
            </Checkbox>
          </div>
          {!hasValidCharTypes && (
            <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>
              至少选择一种字符类型
            </div>
          )}
        </Form.Item>

        <Divider style={{ margin: '12px 0' }}>可选字段</Divider>

        <Form.Item style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            <Checkbox
              checked={options.includeFields.name}
              onChange={e => updateIncludeField('name', e.target.checked)}
            >
              姓名
            </Checkbox>
            <Checkbox
              checked={options.includeFields.address}
              onChange={e => updateIncludeField('address', e.target.checked)}
            >
              地址
            </Checkbox>
            <Checkbox
              checked={options.includeFields.phone}
              onChange={e => updateIncludeField('phone', e.target.checked)}
            >
              电话
            </Checkbox>
            <Checkbox
              checked={options.includeFields.email}
              onChange={e => updateIncludeField('email', e.target.checked)}
            >
              邮箱
            </Checkbox>
            <Checkbox
              checked={options.includeFields.company}
              onChange={e => updateIncludeField('company', e.target.checked)}
            >
              工作单位
            </Checkbox>
          </div>
        </Form.Item>

        {error && (
          <div style={{ color: '#ff4d4f', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <Space style={{ width: '100%' }} direction="vertical">
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={onGenerate}
            loading={loading}
            disabled={!hasValidCharTypes}
            block
          >
            生成
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={onReset}
            block
          >
            重置
          </Button>
        </Space>
      </Form>
    </div>
  );
};

export default GeneratorConfig;
