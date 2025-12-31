/**
 * ExtractPagesTool - PDF 页面提取工具组件
 * 采用上下布局：上方为参数设置区，下方为页面缩略图网格
 */

import React, { useState, useCallback } from 'react';
import { 
  Card, Row, Col, Typography, Upload, Button, Space, message, 
  Input, Spin
} from 'antd';
import { 
  UploadOutlined, InboxOutlined, DownloadOutlined, ScissorOutlined
} from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';
import PDFThumbnails from './PDFThumbnails';
import { parsePageRanges } from './utils';

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

interface PDFFile {
  name: string;
  data: ArrayBuffer;
  size: number;
}

// ============ ExtractPagesTool 组件 ============

const ExtractPagesTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageRangeInput, setPageRangeInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // PDF 文件上传处理
  const handlePdfUpload = useCallback(async (file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 复制 ArrayBuffer 以避免 detached 问题
      const bufferCopy = arrayBuffer.slice(0);
      
      const header = new Uint8Array(bufferCopy.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      const info = await pdfApi.getInfo(bufferCopy.slice(0));
      
      setPdfFile({
        name: file.name,
        data: bufferCopy,
        size: file.size,
      });
      setTotalPages(info.pageCount);
      setSelectedPages([]);
      setPageRangeInput('');
      setPreviewKey(prev => prev + 1);
      
      message.success(`已加载: ${file.name} (${info.pageCount} 页)`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);

  // 处理页面选择
  const handlePageSelect = useCallback((pages: number[]) => {
    setSelectedPages(pages);
    setPageRangeInput(pages.join(', '));
  }, []);

  // 处理页面范围输入变化
  const handlePageRangeChange = useCallback((value: string) => {
    setPageRangeInput(value);
    const pages = parsePageRanges(value, totalPages);
    setSelectedPages(pages);
  }, [totalPages]);

  // 执行提取
  const handleExtract = useCallback(async () => {
    if (!pdfFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (selectedPages.length === 0) {
      message.warning('请选择要提取的页面');
      return;
    }

    setProcessing(true);

    try {
      // 复制 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.extractPages({
        file: pdfFile.data.slice(0),
        pages: selectedPages,
      });

      // 下载提取的 PDF
      const blob = new Blob([result], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFile.name.replace('.pdf', `_pages_${selectedPages.join('-')}.pdf`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      message.success(`已提取 ${selectedPages.length} 页`);
    } catch (error) {
      console.error('Extract failed:', error);
      message.error('提取失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, selectedPages]);

  // 未上传文件时显示上传区域
  if (!pdfFile) {
    return (
      <div style={{ padding: 24 }}>
        <Dragger
          accept=".pdf"
          showUploadList={false}
          beforeUpload={handlePdfUpload}
          style={{ padding: 40 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽 PDF 文件到此处</p>
          <p className="ant-upload-hint">从 PDF 中提取指定页面生成新文件</p>
        </Dragger>
      </div>
    );
  }

  return (
    <div>
      {/* 上方：参数设置区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={5}>
            <Space>
              <Upload accept=".pdf" showUploadList={false} beforeUpload={handlePdfUpload}>
                <Button icon={<UploadOutlined />} size="small">更换文件</Button>
              </Upload>
              <Text ellipsis style={{ maxWidth: 100 }}>{pdfFile.name}</Text>
            </Space>
          </Col>
          <Col span={6}>
            <Text type="secondary">页面范围：</Text>
            <Input
              value={pageRangeInput}
              onChange={(e) => handlePageRangeChange(e.target.value)}
              placeholder="如: 1,3,5-7"
              size="small"
              style={{ width: 120 }}
            />
          </Col>
          <Col span={5}>
            <Text type="secondary">
              已选择 {selectedPages.length}/{totalPages} 页
            </Text>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Button 
              type="primary"
              icon={<ScissorOutlined />} 
              onClick={handleExtract}
              loading={processing}
              disabled={selectedPages.length === 0}
            >
              提取并下载
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 下方：页面缩略图网格 */}
      <Card 
        size="small" 
        title="页面缩略图"
        extra={<Text type="secondary">点击选择要提取的页面</Text>}
        style={{ height: 'calc(100vh - 280px)' }}
        styles={{ body: { height: 'calc(100% - 40px)', overflow: 'auto', padding: 12 } }}
      >
        <Spin spinning={processing}>
          <PDFThumbnails
            key={previewKey}
            pdfData={pdfFile.data}
            selectedPages={selectedPages}
            onPageSelect={handlePageSelect}
            multiSelect={true}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default ExtractPagesTool;
