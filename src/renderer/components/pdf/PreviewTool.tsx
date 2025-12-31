/**
 * PreviewTool - PDF 预览工具组件
 * 采用上下布局：上方为文件上传和控制栏，下方为预览区
 * 支持键盘快捷键（Arrow keys, Page Up/Down）
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, Row, Col, Typography, Upload, Button, Space, message } from 'antd';
import { UploadOutlined, InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import PDFPreview from './PDFPreview';
import { formatFileSize } from './utils';

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

export interface PreviewToolProps {
  pdfData?: ArrayBuffer | null;
  pdfInfo?: PDFInfo | null;
  onFileUpload?: (file: File) => Promise<boolean>;
  onTotalPagesChange?: (total: number) => void;
}

export interface PDFInfo {
  pageCount: number;
  title?: string;
  author?: string;
  fileSize: number;
  fileName: string;
}

// ============ PreviewTool 组件 ============

const PreviewTool: React.FC<PreviewToolProps> = ({
  pdfData: externalPdfData,
  pdfInfo: externalPdfInfo,
  onFileUpload: externalOnFileUpload,
  onTotalPagesChange,
}) => {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(externalPdfData || null);
  const [pdfInfo, setPdfInfo] = useState<PDFInfo | null>(externalPdfInfo || null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(false);

  // 同步外部数据
  useEffect(() => {
    if (externalPdfData !== undefined) {
      setPdfData(externalPdfData);
    }
  }, [externalPdfData]);

  useEffect(() => {
    if (externalPdfInfo !== undefined) {
      setPdfInfo(externalPdfInfo);
    }
  }, [externalPdfInfo]);

  // 文件上传处理
  const handleFileUpload = useCallback(async (file: File): Promise<boolean> => {
    if (externalOnFileUpload) {
      return externalOnFileUpload(file);
    }

    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_FILE_SIZE) {
      message.error('文件大小超过 100MB 限制');
      return false;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      setLoading(true);
      const arrayBuffer = await file.arrayBuffer();
      
      // 验证 PDF magic bytes
      const header = new Uint8Array(arrayBuffer.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      setPdfData(arrayBuffer);
      setPdfInfo({
        pageCount: 0,
        fileSize: file.size,
        fileName: file.name,
      });
      setCurrentPage(1);
      message.success('PDF 加载成功');
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, [externalOnFileUpload]);

  // 页数变化回调
  const handleTotalPagesChange = useCallback((total: number) => {
    setTotalPages(total);
    setPdfInfo(prev => prev ? { ...prev, pageCount: total } : null);
    onTotalPagesChange?.(total);
  }, [onTotalPagesChange]);

  // 下载当前 PDF
  const handleDownload = useCallback(() => {
    if (!pdfData || !pdfInfo) return;
    
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfInfo.fileName || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pdfData, pdfInfo]);

  // 未上传文件时显示上传区域
  if (!pdfData) {
    return (
      <div style={{ padding: 24 }}>
        <Dragger
          accept=".pdf"
          showUploadList={false}
          beforeUpload={handleFileUpload}
          style={{ padding: 40 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽 PDF 文件到此处</p>
          <p className="ant-upload-hint">支持单个 PDF 文件，最大 100MB</p>
        </Dragger>
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 200px)', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
      {/* 上方：文件信息和控制栏 */}
      <Card size="small" style={{ marginBottom: 12, flexShrink: 0 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
              <Text>
                <Text type="secondary">文件：</Text>
                {pdfInfo?.fileName || '-'}
              </Text>
              <Text>
                <Text type="secondary">页数：</Text>
                {totalPages || pdfInfo?.pageCount || '-'}
              </Text>
              <Text>
                <Text type="secondary">大小：</Text>
                {pdfInfo ? formatFileSize(pdfInfo.fileSize) : '-'}
              </Text>
              <Text>
                <Text type="secondary">当前：</Text>
                第 {currentPage} 页
              </Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Upload accept=".pdf" showUploadList={false} beforeUpload={handleFileUpload}>
                <Button icon={<UploadOutlined />} size="small">更换文件</Button>
              </Upload>
              <Button icon={<DownloadOutlined />} size="small" onClick={handleDownload}>
                下载
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 下方：PDF 预览区 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PDFPreview
          pdfData={pdfData}
          currentPage={currentPage}
          zoom={zoom}
          showControls={true}
          showSearch={true}
          onPageChange={setCurrentPage}
          onTotalPagesChange={handleTotalPagesChange}
          onZoomChange={setZoom}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
};

export default PreviewTool;
