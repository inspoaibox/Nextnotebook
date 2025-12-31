/**
 * MetadataTool - PDF 元数据编辑工具
 * 支持查看和编辑 PDF 文档的元数据信息
 */

import React, { useState, useCallback, useEffect } from 'react';
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
  Form,
  Descriptions,
  Tag,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  EditOutlined,
  InfoCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { pdfApi, PDFMetadata } from '../../services/pdfApi';

const { Text, Title } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

// ============ 主组件 ============

const MetadataTool: React.FC = () => {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // 元数据
  const [metadata, setMetadata] = useState<PDFMetadata>({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
  });

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

      // 获取元数据
      const meta = await pdfApi.getMetadata(bufferCopy.slice(0));
      setMetadata(meta);
      setIsEditing(false);

      message.success('PDF 加载成功');
      return false;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 保存元数据
  const handleSave = useCallback(async () => {
    if (!pdfData) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    try {
      setProcessing(true);
      // 复制 ArrayBuffer 以避免 detached 问题
      const updatedPdf = await pdfApi.setMetadata({
        file: pdfData.slice(0),
        ...metadata,
      });

      // 更新本地数据
      setPdfData(updatedPdf);

      // 下载文件
      const blob = new Blob([updatedPdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.pdf', '_metadata.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsEditing(false);
      message.success('元数据保存成功');
    } catch (error) {
      console.error('Failed to save metadata:', error);
      message.error('保存失败');
    } finally {
      setProcessing(false);
    }
  }, [pdfData, metadata, fileName]);

  // 渲染查看模式
  const renderViewMode = () => (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="标题">
        {metadata.title || <Text type="secondary">未设置</Text>}
      </Descriptions.Item>
      <Descriptions.Item label="作者">
        {metadata.author || <Text type="secondary">未设置</Text>}
      </Descriptions.Item>
      <Descriptions.Item label="主题">
        {metadata.subject || <Text type="secondary">未设置</Text>}
      </Descriptions.Item>
      <Descriptions.Item label="关键词">
        {metadata.keywords ? (
          <Space wrap>
            {metadata.keywords.split(',').map((kw, i) => (
              <Tag key={i}>{kw.trim()}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">未设置</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="创建程序">
        {metadata.creator || <Text type="secondary">未设置</Text>}
      </Descriptions.Item>
      <Descriptions.Item label="PDF 生成器">
        {metadata.producer || <Text type="secondary">未设置</Text>}
      </Descriptions.Item>
    </Descriptions>
  );

  // 渲染编辑模式
  const renderEditMode = () => (
    <Form layout="vertical" size="small">
      <Form.Item label="标题">
        <Input
          value={metadata.title || ''}
          onChange={e => setMetadata(prev => ({ ...prev, title: e.target.value }))}
          placeholder="输入文档标题"
        />
      </Form.Item>

      <Form.Item label="作者">
        <Input
          value={metadata.author || ''}
          onChange={e => setMetadata(prev => ({ ...prev, author: e.target.value }))}
          placeholder="输入作者名称"
        />
      </Form.Item>

      <Form.Item label="主题">
        <Input
          value={metadata.subject || ''}
          onChange={e => setMetadata(prev => ({ ...prev, subject: e.target.value }))}
          placeholder="输入文档主题"
        />
      </Form.Item>

      <Form.Item label="关键词" extra="多个关键词用逗号分隔">
        <TextArea
          value={metadata.keywords || ''}
          onChange={e => setMetadata(prev => ({ ...prev, keywords: e.target.value }))}
          placeholder="输入关键词，用逗号分隔"
          rows={2}
        />
      </Form.Item>

      <Form.Item label="创建程序">
        <Input
          value={metadata.creator || ''}
          onChange={e => setMetadata(prev => ({ ...prev, creator: e.target.value }))}
          placeholder="输入创建程序名称"
        />
      </Form.Item>

      <Form.Item label="PDF 生成器">
        <Input
          value={metadata.producer || ''}
          onChange={e => setMetadata(prev => ({ ...prev, producer: e.target.value }))}
          placeholder="输入 PDF 生成器名称"
          disabled
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          此字段由 PDF 库自动设置
        </Text>
      </Form.Item>
    </Form>
  );

  return (
    <div style={{ padding: 16 }}>
      <Spin spinning={loading || processing}>
        {/* 文件上传区 */}
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
                  <p className="ant-upload-hint">查看和编辑 PDF 元数据信息</p>
                </Dragger>
              </Col>
            ) : (
              <>
                <Col flex="auto">
                  <Space>
                    <InfoCircleOutlined />
                    <Text strong>{fileName}</Text>
                  </Space>
                </Col>
                <Col>
                  <Space>
                    <Upload accept=".pdf" showUploadList={false} beforeUpload={handleUpload}>
                      <Button>更换文件</Button>
                    </Upload>
                    {isEditing ? (
                      <>
                        <Button onClick={() => setIsEditing(false)}>取消</Button>
                        <Button
                          type="primary"
                          icon={<SaveOutlined />}
                          onClick={handleSave}
                        >
                          保存
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => setIsEditing(true)}
                      >
                        编辑
                      </Button>
                    )}
                  </Space>
                </Col>
              </>
            )}
          </Row>
        </Card>

        {/* 元数据显示/编辑区 */}
        {pdfData && (
          <Card
            size="small"
            title={
              <Space>
                <InfoCircleOutlined />
                <span>文档元数据</span>
                {isEditing && <Tag color="blue">编辑中</Tag>}
              </Space>
            }
          >
            {isEditing ? renderEditMode() : renderViewMode()}
          </Card>
        )}
      </Spin>
    </div>
  );
};

export default MetadataTool;
