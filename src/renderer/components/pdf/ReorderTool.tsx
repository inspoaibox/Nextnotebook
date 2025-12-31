/**
 * ReorderTool - PDF 页面重排工具组件
 * 采用上下布局：上方为参数设置区，下方为可拖拽排序的页面缩略图网格
 */

import React, { useState, useCallback } from 'react';
import { 
  Card, Row, Col, Typography, Upload, Button, Space, message, Spin
} from 'antd';
import { 
  UploadOutlined, InboxOutlined, DownloadOutlined, UndoOutlined, SaveOutlined
} from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';
import PDFThumbnails from './PDFThumbnails';
import { downloadFile } from './utils';

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

interface PDFFile {
  name: string;
  data: ArrayBuffer;
  size: number;
}

// ============ ReorderTool 组件 ============

const ReorderTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [resultData, setResultData] = useState<ArrayBuffer | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
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

      // 获取 PDF 信息
      const info = await pdfApi.getInfo(bufferCopy.slice(0));
      
      setPdfFile({
        name: file.name,
        data: bufferCopy,
        size: file.size,
      });
      setTotalPages(info.pageCount);
      setPageOrder(Array.from({ length: info.pageCount }, (_, i) => i + 1));
      setResultData(null);
      setHasChanges(false);
      setPreviewKey(prev => prev + 1);
      
      message.success(`已加载: ${file.name} (${info.pageCount} 页)`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);

  // 处理页面重排
  const handlePageReorder = useCallback((newOrder: number[]) => {
    setPageOrder(newOrder);
    // 检查是否有变化
    const originalOrder = Array.from({ length: totalPages }, (_, i) => i + 1);
    const changed = JSON.stringify(newOrder) !== JSON.stringify(originalOrder);
    setHasChanges(changed);
  }, [totalPages]);

  // 应用重排
  const handleApply = useCallback(async () => {
    if (!pdfFile || !hasChanges) return;

    setProcessing(true);

    try {
      // 复制 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.reorder({
        file: pdfFile.data.slice(0),
        newOrder: pageOrder,
      });

      setResultData(result);
      setPreviewKey(prev => prev + 1);
      message.success('页面重排完成');
    } catch (error) {
      console.error('Reorder failed:', error);
      message.error('重排失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, pageOrder, hasChanges]);

  // 重置
  const handleReset = useCallback(() => {
    if (pdfFile) {
      setPageOrder(Array.from({ length: totalPages }, (_, i) => i + 1));
      setResultData(null);
      setHasChanges(false);
      setPreviewKey(prev => prev + 1);
      message.info('已重置为原始顺序');
    }
  }, [pdfFile, totalPages]);

  // 下载结果
  const handleDownload = useCallback(() => {
    const dataToDownload = resultData || pdfFile?.data;
    if (!dataToDownload || !pdfFile) return;
    downloadFile(dataToDownload, pdfFile.name.replace('.pdf', '_reordered.pdf'));
  }, [resultData, pdfFile]);

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
          <p className="ant-upload-hint">拖拽页面缩略图来重新排列页面顺序</p>
        </Dragger>
      </div>
    );
  }

  return (
    <div>
      {/* 上方：参数设置区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Space>
              <Upload accept=".pdf" showUploadList={false} beforeUpload={handlePdfUpload}>
                <Button icon={<UploadOutlined />} size="small">更换文件</Button>
              </Upload>
              <Text ellipsis style={{ maxWidth: 120 }}>{pdfFile.name}</Text>
            </Space>
          </Col>
          <Col span={6}>
            <Text type="secondary">共 {totalPages} 页</Text>
            {hasChanges && (
              <Text type="warning" style={{ marginLeft: 12 }}>
                (已修改顺序)
              </Text>
            )}
          </Col>
          <Col span={12} style={{ textAlign: 'right' }}>
            <Space>
              <Button 
                icon={<UndoOutlined />} 
                onClick={handleReset}
                disabled={!hasChanges && !resultData}
              >
                重置
              </Button>
              <Button 
                type="primary"
                icon={<SaveOutlined />} 
                onClick={handleApply}
                loading={processing}
                disabled={!hasChanges}
              >
                应用
              </Button>
              <Button 
                icon={<DownloadOutlined />} 
                onClick={handleDownload}
                disabled={!pdfFile}
              >
                下载
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 下方：可拖拽排序的页面缩略图网格 */}
      <Card 
        size="small" 
        title="拖拽页面调整顺序"
        extra={
          <Text type="secondary">
            当前顺序: {pageOrder.join(', ')}
          </Text>
        }
        style={{ height: 'calc(100vh - 280px)' }}
        styles={{ body: { height: 'calc(100% - 40px)', overflow: 'auto', padding: 12 } }}
      >
        <Spin spinning={processing}>
          <PDFThumbnails
            key={previewKey}
            pdfData={resultData || pdfFile.data}
            selectedPages={[]}
            onPageSelect={() => {}}
            onPageReorder={handlePageReorder}
            draggable={true}
            multiSelect={false}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default ReorderTool;
