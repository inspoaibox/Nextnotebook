/**
 * RenameTool - PDF 批量重命名工具
 * 支持多文件上传、命名规则选择、模板占位符替换
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Upload,
  Button,
  Space,
  Typography,
  Table,
  Input,
  Select,
  Row,
  Col,
  message,
  Card,
  Tag,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  ClearOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text, Title } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

// ============ 类型定义 ============

interface FileItem {
  id: string;
  file: File;
  originalName: string;
  newName: string;
}

type NamingRule = 'template' | 'prefix' | 'suffix' | 'replace' | 'sequence';

interface RenameConfig {
  rule: NamingRule;
  template: string;
  prefix: string;
  suffix: string;
  searchText: string;
  replaceText: string;
  startNumber: number;
  padding: number;
}

// ============ 模板占位符说明 ============

const TEMPLATE_PLACEHOLDERS = [
  { placeholder: '{name}', description: '原文件名（不含扩展名）' },
  { placeholder: '{ext}', description: '文件扩展名' },
  { placeholder: '{n}', description: '序号（从1开始）' },
  { placeholder: '{nn}', description: '两位序号（01, 02...）' },
  { placeholder: '{nnn}', description: '三位序号（001, 002...）' },
  { placeholder: '{date}', description: '当前日期（YYYY-MM-DD）' },
  { placeholder: '{time}', description: '当前时间（HH-mm-ss）' },
];

// ============ 工具函数 ============

/**
 * 应用命名模板
 */
export function applyTemplate(
  template: string,
  originalName: string,
  index: number,
  config: RenameConfig
): string {
  const nameWithoutExt = originalName.replace(/\.pdf$/i, '');
  const ext = 'pdf';
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const num = config.startNumber + index;

  let result = template
    .replace(/{name}/g, nameWithoutExt)
    .replace(/{ext}/g, ext)
    .replace(/{nnn}/g, String(num).padStart(3, '0'))
    .replace(/{nn}/g, String(num).padStart(2, '0'))
    .replace(/{n}/g, String(num))
    .replace(/{date}/g, date)
    .replace(/{time}/g, time);

  // 确保有 .pdf 扩展名
  if (!result.toLowerCase().endsWith('.pdf')) {
    result += '.pdf';
  }

  return result;
}

/**
 * 根据规则生成新文件名
 */
function generateNewName(
  originalName: string,
  index: number,
  config: RenameConfig
): string {
  const nameWithoutExt = originalName.replace(/\.pdf$/i, '');

  switch (config.rule) {
    case 'template':
      return applyTemplate(config.template, originalName, index, config);

    case 'prefix':
      return `${config.prefix}${nameWithoutExt}.pdf`;

    case 'suffix':
      return `${nameWithoutExt}${config.suffix}.pdf`;

    case 'replace':
      if (!config.searchText) return originalName;
      const replaced = nameWithoutExt.replace(
        new RegExp(escapeRegExp(config.searchText), 'g'),
        config.replaceText
      );
      return `${replaced}.pdf`;

    case 'sequence':
      const num = config.startNumber + index;
      const paddedNum = String(num).padStart(config.padding, '0');
      return `${paddedNum}_${nameWithoutExt}.pdf`;

    default:
      return originalName;
  }
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============ 主组件 ============

const RenameTool: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [config, setConfig] = useState<RenameConfig>({
    rule: 'template',
    template: '{name}_{nn}',
    prefix: 'new_',
    suffix: '_copy',
    searchText: '',
    replaceText: '',
    startNumber: 1,
    padding: 2,
  });

  // 处理文件上传
  const handleUpload = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    const newItem: FileItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file,
      originalName: file.name,
      newName: file.name,
    };

    setFiles(prev => [...prev, newItem]);
    return false; // 阻止自动上传
  }, []);

  // 更新所有文件的新名称
  const updateAllNewNames = useCallback(() => {
    setFiles(prev =>
      prev.map((item, index) => ({
        ...item,
        newName: generateNewName(item.originalName, index, config),
      }))
    );
  }, [config]);

  // 当配置改变时更新预览
  React.useEffect(() => {
    if (files.length > 0) {
      updateAllNewNames();
    }
  }, [config, updateAllNewNames]);

  // 删除文件
  const handleDelete = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // 清空所有文件
  const handleClearAll = useCallback(() => {
    setFiles([]);
  }, []);

  // 手动编辑单个文件名
  const handleEditName = useCallback((id: string, newName: string) => {
    setFiles(prev =>
      prev.map(f => (f.id === id ? { ...f, newName } : f))
    );
  }, []);

  // 下载重命名后的文件
  const handleDownload = useCallback(async () => {
    if (files.length === 0) {
      message.warning('请先添加文件');
      return;
    }

    try {
      for (const item of files) {
        const blob = new Blob([await item.file.arrayBuffer()], {
          type: 'application/pdf',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.newName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      message.success(`已下载 ${files.length} 个文件`);
    } catch (error) {
      console.error('Download failed:', error);
      message.error('下载失败');
    }
  }, [files]);

  // 表格列定义
  const columns: ColumnsType<FileItem> = useMemo(
    () => [
      {
        title: '序号',
        key: 'index',
        width: 60,
        render: (_, __, index) => index + 1,
      },
      {
        title: '原文件名',
        dataIndex: 'originalName',
        key: 'originalName',
        ellipsis: true,
      },
      {
        title: '新文件名',
        dataIndex: 'newName',
        key: 'newName',
        render: (newName, record) => (
          <Input
            value={newName}
            onChange={e => handleEditName(record.id, e.target.value)}
            size="small"
            suffix={<EditOutlined style={{ color: '#999' }} />}
          />
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 80,
        render: (_, record) => (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          />
        ),
      },
    ],
    [handleEditName, handleDelete]
  );

  // 渲染规则配置
  const renderRuleConfig = () => {
    switch (config.rule) {
      case 'template':
        return (
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Input
              placeholder="输入模板，如：{name}_{nn}"
              value={config.template}
              onChange={e => setConfig(prev => ({ ...prev, template: e.target.value }))}
              addonAfter={
                <Tooltip
                  title={
                    <div>
                      {TEMPLATE_PLACEHOLDERS.map(p => (
                        <div key={p.placeholder}>
                          <code>{p.placeholder}</code>: {p.description}
                        </div>
                      ))}
                    </div>
                  }
                >
                  <QuestionCircleOutlined />
                </Tooltip>
              }
            />
            <Space wrap size="small">
              {TEMPLATE_PLACEHOLDERS.slice(0, 5).map(p => (
                <Tag
                  key={p.placeholder}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    setConfig(prev => ({
                      ...prev,
                      template: prev.template + p.placeholder,
                    }))
                  }
                >
                  {p.placeholder}
                </Tag>
              ))}
            </Space>
          </Space>
        );

      case 'prefix':
        return (
          <Input
            placeholder="输入前缀"
            value={config.prefix}
            onChange={e => setConfig(prev => ({ ...prev, prefix: e.target.value }))}
            addonBefore="前缀"
          />
        );

      case 'suffix':
        return (
          <Input
            placeholder="输入后缀"
            value={config.suffix}
            onChange={e => setConfig(prev => ({ ...prev, suffix: e.target.value }))}
            addonBefore="后缀"
          />
        );

      case 'replace':
        return (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="查找文本"
              value={config.searchText}
              onChange={e => setConfig(prev => ({ ...prev, searchText: e.target.value }))}
              style={{ width: '50%' }}
            />
            <Input
              placeholder="替换为"
              value={config.replaceText}
              onChange={e => setConfig(prev => ({ ...prev, replaceText: e.target.value }))}
              style={{ width: '50%' }}
            />
          </Space.Compact>
        );

      case 'sequence':
        return (
          <Space>
            <Input
              type="number"
              value={config.startNumber}
              onChange={e => setConfig(prev => ({ ...prev, startNumber: parseInt(e.target.value) || 1 }))}
              addonBefore="起始"
              style={{ width: 120 }}
            />
            <Input
              type="number"
              value={config.padding}
              onChange={e => setConfig(prev => ({ ...prev, padding: parseInt(e.target.value) || 1 }))}
              addonBefore="位数"
              style={{ width: 120 }}
              min={1}
              max={6}
            />
          </Space>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {/* 参数设置区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col span={24}>
            <Dragger
              accept=".pdf"
              multiple
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
              <p className="ant-upload-hint">支持多个 PDF 文件批量上传</p>
            </Dragger>
          </Col>

          <Col xs={24} sm={8}>
            <Select
              value={config.rule}
              onChange={rule => setConfig(prev => ({ ...prev, rule }))}
              style={{ width: '100%' }}
            >
              <Option value="template">模板命名</Option>
              <Option value="prefix">添加前缀</Option>
              <Option value="suffix">添加后缀</Option>
              <Option value="replace">查找替换</Option>
              <Option value="sequence">序号命名</Option>
            </Select>
          </Col>

          <Col xs={24} sm={16}>
            {renderRuleConfig()}
          </Col>

          <Col span={24}>
            <Space>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
                disabled={files.length === 0}
              >
                下载全部 ({files.length})
              </Button>
              <Popconfirm
                title="确定清空所有文件？"
                onConfirm={handleClearAll}
                disabled={files.length === 0}
              >
                <Button
                  icon={<ClearOutlined />}
                  disabled={files.length === 0}
                >
                  清空
                </Button>
              </Popconfirm>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 文件列表 */}
      {files.length > 0 ? (
        <Table
          dataSource={files}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={files.length > 10 ? { pageSize: 10 } : false}
          scroll={{ y: 400 }}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          <Text type="secondary">请上传 PDF 文件进行批量重命名</Text>
        </div>
      )}
    </div>
  );
};

export default RenameTool;
