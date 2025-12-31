/**
 * RotateTool - PDF 旋转调整工具组件
 * 采用上下布局：上方为参数设置区，下方为页面缩略图网格
 * 支持单个页面直接旋转操作
 */

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Card, Row, Col, Typography, Upload, Button, Space, message, 
  Checkbox, Spin
} from 'antd';
import { 
  UploadOutlined, InboxOutlined, DownloadOutlined, 
  RotateLeftOutlined, RotateRightOutlined, UndoOutlined
} from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';
import PDFThumbnails from './PDFThumbnails';

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

interface PDFFile {
  name: string;
  data: ArrayBuffer;
  size: number;
}

type RotationAngle = 90 | -90 | 180;
type RotationType = 'cw' | 'ccw' | 'flip-h' | 'flip-v';

// ============ RotateTool 组件 ============

const RotateTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [resultData, setResultData] = useState<ArrayBuffer | null>(null);
  const [selectAll, setSelectAll] = useState(true);
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
      setResultData(null);
      setSelectedPages([]);
      setSelectAll(true);
      setPreviewKey(prev => prev + 1);
      
      message.success(`已加载: ${file.name} (${info.pageCount} 页)`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);

  // 当总页数变化时，如果选择全部，更新选中页面
  useEffect(() => {
    if (selectAll && totalPages > 0) {
      setSelectedPages(Array.from({ length: totalPages }, (_, i) => i + 1));
    }
  }, [selectAll, totalPages]);

  // 处理页面选择
  const handlePageSelect = useCallback((pages: number[]) => {
    setSelectedPages(pages);
    setSelectAll(pages.length === totalPages);
  }, [totalPages]);

  // 处理全选切换
  const handleSelectAllChange = useCallback((checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedPages(Array.from({ length: totalPages }, (_, i) => i + 1));
    } else {
      setSelectedPages([]);
    }
  }, [totalPages]);

  // 执行旋转
  const handleRotate = useCallback(async (angle: RotationAngle) => {
    if (!pdfFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (selectedPages.length === 0) {
      message.warning('请选择要旋转的页面');
      return;
    }

    setProcessing(true);

    try {
      const sourceData = resultData || pdfFile.data;
      // 复制 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.rotate({
        file: sourceData.slice(0),
        pages: selectedPages,
        angle,
      });

      setResultData(result);
      // 不再更新 previewKey，避免所有缩略图闪烁
      // setPreviewKey(prev => prev + 1);
      
      const angleText = angle === 90 ? '顺时针 90°' : angle === -90 ? '逆时针 90°' : '180°';
      message.success(`已旋转 ${selectedPages.length} 页 (${angleText})`);
    } catch (error) {
      console.error('Rotate failed:', error);
      message.error('旋转失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, selectedPages, resultData]);

  // 单个页面旋转（用于缩略图上的快捷操作）
  const handleSinglePageRotate = useCallback(async (page: number, type: RotationType) => {
    if (!pdfFile) return;

    setProcessing(true);

    try {
      const sourceData = resultData || pdfFile.data;
      let angle: RotationAngle;
      
      switch (type) {
        case 'cw':
          angle = 90;
          break;
        case 'ccw':
          angle = -90;
          break;
        case 'flip-h':
        case 'flip-v':
          angle = 180;
          break;
        default:
          angle = 90;
      }
      
      // 复制 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.rotate({
        file: sourceData.slice(0),
        pages: [page],
        angle,
      });

      setResultData(result);
      setPreviewKey(prev => prev + 1); // 只在单页旋转时更新预览
      
      const typeText = type === 'cw' ? '顺时针' : type === 'ccw' ? '逆时针' : '翻转';
      message.success(`第 ${page} 页已${typeText}旋转`);
    } catch (error) {
      console.error('Single page rotate failed:', error);
      message.error('旋转失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, resultData]);

  // 重置
  const handleReset = useCallback(() => {
    if (pdfFile) {
      setResultData(null);
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
    a.download = pdfFile.name.replace('.pdf', '_rotated.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <p className="ant-upload-hint">旋转 PDF 页面（90°、-90°、180°）</p>
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
              <Text ellipsis style={{ maxWidth: 120 }}>{pdfFile.name}</Text>
            </Space>
          </Col>
          <Col span={6}>
            <Space>
              <Text type="secondary">旋转角度：</Text>
              <Button.Group>
                <Button 
                  icon={<RotateLeftOutlined />} 
                  onClick={() => handleRotate(-90)}
                  loading={processing}
                  title="逆时针 90°"
                >
                  -90°
                </Button>
                <Button 
                  onClick={() => handleRotate(180)}
                  loading={processing}
                  title="旋转 180°"
                >
                  180°
                </Button>
                <Button 
                  icon={<RotateRightOutlined />} 
                  onClick={() => handleRotate(90)}
                  loading={processing}
                  title="顺时针 90°"
                >
                  90°
                </Button>
              </Button.Group>
            </Space>
          </Col>
          <Col span={5}>
            <Checkbox 
              checked={selectAll}
              onChange={(e) => handleSelectAllChange(e.target.checked)}
            >
              选择所有页面
            </Checkbox>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              ({selectedPages.length}/{totalPages} 页)
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
              <Button 
                type="primary"
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

      {/* 下方：页面缩略图网格 */}
      <Card 
        size="small" 
        title={`页面缩略图 ${resultData ? '（已修改）' : ''}`}
        style={{ height: 'calc(100vh - 280px)' }}
        styles={{ body: { height: 'calc(100% - 40px)', overflow: 'auto', padding: 12 } }}
      >
        <Spin spinning={processing}>
          <PDFThumbnails
            key={previewKey}
            pdfData={resultData || pdfFile.data}
            selectedPages={selectedPages}
            onPageSelect={handlePageSelect}
            multiSelect={true}
            showRotateButtons={true}
            onPageRotate={handleSinglePageRotate}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default RotateTool;
