/**
 * FormFillTool - PDF 表单填写工具
 * 支持检测和填写 PDF 表单字段
 */

import React, { useState, useCallback } from 'react';
import {
  Upload,
  Button,
  Space,
  Typography,
  Card,
  Row,
  Col,
  message,
  Spin,
  Input,
  Checkbox,
  Select,
  Form,
  Empty,
  Tag,
  Alert,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  ClearOutlined,
  FormOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';
import { pdfApi, FormField } from '../../services/pdfApi';

const { Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

// ============ 类型定义 ============

interface FormValues {
  [fieldName: string]: any;
}

// ============ 主组件 ============

const FormFillTool: React.FC = () => {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 处理文件上传
  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      setLoading(true);
      const arrayBuffer = await file.arrayBuffer();
      
      // 复制 ArrayBuffer 以避免 detached 问题
      const bufferCopy = arrayBuffer.slice(0);
      
      // 验证 PDF
      const header = new Uint8Array(bufferCopy.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      setPdfData(bufferCopy);
      setFileName(file.name);

      // 获取表单字段
      const fields = await pdfApi.getFormFields(bufferCopy.slice(0));
      setFormFields(fields);

      // 初始化表单值
      const initialValues: FormValues = {};
      fields.forEach(field => {
        initialValues[field.name] = field.value;
      });
      setFormValues(initialValues);

      if (fields.length === 0) {
        message.info('此 PDF 没有可填写的表单字段');
      } else {
        message.success(`检测到 ${fields.length} 个表单字段`);
      }

      return false;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 更新字段值
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [fieldName]: value,
    }));
  }, []);

  // 清空所有字段
  const handleClearAll = useCallback(() => {
    const clearedValues: FormValues = {};
    formFields.forEach(field => {
      if (field.type === 'checkbox') {
        clearedValues[field.name] = false;
      } else {
        clearedValues[field.name] = '';
      }
    });
    setFormValues(clearedValues);
    message.success('已清空所有字段');
  }, [formFields]);

  // 保存填写后的 PDF
  const handleSave = useCallback(async () => {
    if (!pdfData) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    try {
      setProcessing(true);
      // 复制 ArrayBuffer 以避免 detached 问题
      const filledPdf = await pdfApi.fillForm(pdfData.slice(0), formValues);

      // 下载文件
      const blob = new Blob([filledPdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.pdf', '_filled.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      message.success('表单保存成功');
    } catch (error) {
      console.error('Failed to save form:', error);
      message.error('保存失败');
    } finally {
      setProcessing(false);
    }
  }, [pdfData, formValues, fileName]);

  // 渲染字段输入控件
  const renderFieldInput = (field: FormField) => {
    const value = formValues[field.name];

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value || ''}
            onChange={e => handleFieldChange(field.name, e.target.value)}
            placeholder={`输入 ${field.name}`}
          />
        );

      case 'checkbox':
        return (
          <Checkbox
            checked={!!value}
            onChange={e => handleFieldChange(field.name, e.target.checked)}
          >
            {field.name}
          </Checkbox>
        );

      case 'radio':
        return (
          <Select
            value={value || undefined}
            onChange={v => handleFieldChange(field.name, v)}
            placeholder="选择选项"
            style={{ width: '100%' }}
          >
            {field.options?.map(opt => (
              <Option key={opt} value={opt}>{opt}</Option>
            ))}
          </Select>
        );

      case 'dropdown':
        return (
          <Select
            value={value || undefined}
            onChange={v => handleFieldChange(field.name, v)}
            placeholder="选择选项"
            style={{ width: '100%' }}
          >
            {field.options?.map(opt => (
              <Option key={opt} value={opt}>{opt}</Option>
            ))}
          </Select>
        );

      case 'button':
        return (
          <Tag color="default">按钮字段（不可编辑）</Tag>
        );

      default:
        return (
          <Input
            value={value || ''}
            onChange={e => handleFieldChange(field.name, e.target.value)}
            placeholder={`输入 ${field.name}`}
          />
        );
    }
  };

  // 获取字段类型图标
  const getFieldTypeIcon = (type: FormField['type']) => {
    switch (type) {
      case 'text':
        return <FileTextOutlined />;
      case 'checkbox':
        return <CheckSquareOutlined />;
      case 'radio':
      case 'dropdown':
        return <FormOutlined />;
      default:
        return <FormOutlined />;
    }
  };

  // 按页面分组字段
  const fieldsByPage = formFields.reduce((acc, field) => {
    const page = field.page;
    if (!acc[page]) {
      acc[page] = [];
    }
    acc[page].push(field);
    return acc;
  }, {} as Record<number, FormField[]>);

  return (
    <div style={{ padding: 16 }}>
      <Spin spinning={loading || processing}>
        {/* 参数设置区 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 12]} align="middle">
            {!pdfData ? (
              <Col span={24}>
                <Dragger
                  accept=".pdf"
                  showUploadList={false}
                  beforeUpload={handleUpload}
                  style={{ padding: '12px 0' }}
                >
                  <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                    <InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} />
                  </p>
                  <p className="ant-upload-text" style={{ marginBottom: 4 }}>
                    点击或拖拽 PDF 文件到此处
                  </p>
                  <p className="ant-upload-hint">支持带有表单字段的 PDF 文件</p>
                </Dragger>
              </Col>
            ) : (
              <>
                <Col flex="auto">
                  <Space>
                    <Text strong>{fileName}</Text>
                    <Tag color="blue">{formFields.length} 个字段</Tag>
                  </Space>
                </Col>
                <Col>
                  <Space>
                    <Upload accept=".pdf" showUploadList={false} beforeUpload={handleUpload}>
                      <Button>更换文件</Button>
                    </Upload>
                    <Button
                      icon={<ClearOutlined />}
                      onClick={handleClearAll}
                      disabled={formFields.length === 0}
                    >
                      清空
                    </Button>
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={handleSave}
                      disabled={formFields.length === 0}
                    >
                      保存
                    </Button>
                  </Space>
                </Col>
              </>
            )}
          </Row>
        </Card>

        {/* 表单字段区 */}
        {pdfData && (
          <>
            {formFields.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="此 PDF 没有可填写的表单字段"
              />
            ) : (
              <div style={{ maxHeight: 500, overflow: 'auto' }}>
                {Object.entries(fieldsByPage).map(([page, fields]) => (
                  <Card
                    key={page}
                    size="small"
                    title={`第 ${page} 页`}
                    style={{ marginBottom: 12 }}
                  >
                    <Form layout="vertical" size="small">
                      {fields.map(field => (
                        <Form.Item
                          key={field.name}
                          label={
                            <Space>
                              {getFieldTypeIcon(field.type)}
                              <span>{field.name}</span>
                              <Tag>{field.type}</Tag>
                            </Space>
                          }
                          style={{ marginBottom: 12 }}
                        >
                          {renderFieldInput(field)}
                        </Form.Item>
                      ))}
                    </Form>
                  </Card>
                ))}
              </div>
            )}

            {formFields.length > 0 && (
              <Alert
                type="info"
                showIcon
                message="提示"
                description="填写完成后点击「保存」按钮下载填写后的 PDF 文件。某些复杂表单可能无法完全支持。"
                style={{ marginTop: 16 }}
              />
            )}
          </>
        )}
      </Spin>
    </div>
  );
};

export default FormFillTool;
