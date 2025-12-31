/**
 * DeletePagesTool - PDF 页面删除工具组件
 * 采用上下布局：上方为参数设置区，下方为页面缩略图网格
 */

import React, { useState, useCallback } from 'react';
import { 
  Card, Row, Col, Typography, Upload, Button, Space, message, 
  Input, Popconfirm, Spin, Alert
} from 'antd';
import { 
  UploadOutlined, InboxOutlined, DownloadOutlined, 
  DeleteOutlined, UndoOutlined, WarningOutlined
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

// ============ DeletePagesTool 组件 ============

const DeletePagesTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageRangeInput, setPageRangeInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [resultData, setResultData] = useState<ArrayBuffer | null>(null);
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
      setSelectedPages([]);
      setPageRangeInput('');
      setResultData(null);
      setPreviewKey(prev => prev + 1);
      
      message.success(`已加载: ${file.name} (${info.pageCount} 页)`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);

  // 处理页面选择（点击缩略图）
  const handlePageSelect = useCallback((pages: number[]) => {
    setSelectedPages(pages);
    setPageRangeInput(pages.join(', '));
  }, []);

  // 处理单个页面删除（点击缩略图上的删除按钮）
  const handleSinglePageDelete = useCallback(async (page: number) => {
    if (!pdfFile) return;

    // 检查是否会删除所有页面
    if (totalPages <= 1) {
      message.error('不能删除所有页面，PDF 文件必须至少保留一页');
      return;
    }

    setProcessing(true);

    try {
      const sourceData = resultData || pdfFile.data;
      // 复制 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.deletePages({
        file: sourceData.slice(0),
        pages: [page],
      });

      // 更新状态
      const newTotalPages = totalPages - 1;
      setResultData(result);
      setTotalPages(newTotalPages);
      // 从选中列表中移除已删除的页面，并调整页码
      setSelectedPages(prev => prev.filter(p => p !== page).map(p => p > page ? p - 1 : p));
      setPageRangeInput('');
      setPreviewKey(prev => prev + 1);
      
      message.success(`已删除第 ${page} 页，剩余 ${newTotalPages} 页`);
    } catch (error) {
      console.error('Delete page failed:', error);
      message.error('删除失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, totalPages, resultData]);

  // 处理页面范围输入变化
  const handlePageRangeChange = useCallback((value: string) => {
    setPageRangeInput(value);
    const pages = parsePageRanges(value, totalPages);
    setSelectedPages(pages);
  }, [totalPages]);

  // 执行删除
  const handleDelete = useCallback(async () => {
    if (!pdfFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (selectedPages.length === 0) {
      message.warning('请选择要删除的页面');
      return;
    }

    if (selectedPages.length >= totalPages) {
      message.error('不能删除所有页面');
      return;
    }

    setProcessing(true);

    try {
      const sourceData = resultData || pdfFile.data;
      // 复制 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.deletePages({
        file: sourceData.slice(0),
        pages: selectedPages,
      });

      // 更新状态
      const newTotalPages = totalPages - selectedPages.length;
      setResultData(result);
      setTotalPages(newTotalPages);
      setSelectedPages([]);
      setPageRangeInput('');
      setPreviewKey(prev => prev + 1);
      
      message.success(`已删除 ${selectedPages.length} 页，剩余 ${newTotalPages} 页`);
    } catch (error) {
      console.error('Delete failed:', error);
      message.error('删除失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, selectedPages, totalPages, resultData]);

  // 重置
  const handleReset = useCallback(async () => {
    if (pdfFile) {
      // 复制 ArrayBuffer 以避免 detached 问题
      const info = await pdfApi.getInfo(pdfFile.data.slice(0));
      setResultData(null);
      setTotalPages(info.pageCount);
      setSelectedPages([]);
      setPageRangeInput('');
      setPreviewKey(prev => prev + 1);
      message.info('已重置为原始状态');
    }
  }, [pdfFile]);

  // 下载结果
  const handleDownload = useCallback(() => {
    const dataToDownload = resultData || pdfFile?.data;
    if (!dataToDownload || !pdfFile) return;

    const blob = new Blob([dataToDownload], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFile.name.replace('.pdf', '_deleted.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [resultData, pdfFile]);

  // 检查是否会删除所有页面
  const willDeleteAll = selectedPages.length >= totalPages;

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
          <p className="ant-upload-hint">选择并删除 PDF 中的指定页面</p>
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
            <Space>
              {resultData && (
                <Button 
                  icon={<UndoOutlined />} 
                  onClick={handleReset}
                >
                  重置
                </Button>
              )}
              <Popconfirm
                title="确认删除"
                description={`确定要删除选中的 ${selectedPages.length} 页吗？此操作不可撤销。`}
                onConfirm={handleDelete}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                disabled={selectedPages.length === 0 || willDeleteAll}
              >
                <Button 
                  danger
                  icon={<DeleteOutlined />} 
                  loading={processing}
                  disabled={selectedPages.length === 0 || willDeleteAll}
                >
                  删除选中页
                </Button>
              </Popconfirm>
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
        
        {willDeleteAll && selectedPages.length > 0 && (
          <Alert
            message="不能删除所有页面"
            description="PDF 文件必须至少保留一页"
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* 下方：页面缩略图网格 */}
      <Card 
        size="small" 
        title={`页面缩略图 ${resultData ? '（已修改）' : ''}`}
        extra={
          <Text type="secondary">
            点击选择要删除的页面
          </Text>
        }
        style={{ height: 'calc(100vh - 300px)' }}
        styles={{ body: { height: 'calc(100% - 40px)', overflow: 'auto', padding: 12 } }}
      >
        <Spin spinning={processing}>
          <PDFThumbnails
            key={previewKey}
            pdfData={resultData || pdfFile.data}
            selectedPages={selectedPages}
            onPageSelect={handlePageSelect}
            multiSelect={true}
            showDeleteButton={true}
            onPageDelete={handleSinglePageDelete}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default DeletePagesTool;
