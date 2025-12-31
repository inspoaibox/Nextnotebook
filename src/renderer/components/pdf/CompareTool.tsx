/**
 * CompareTool - PDF 对比工具
 * 支持双文件上传、并排预览、同步导航和缩放
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Switch,
  InputNumber,
  Divider,
} from 'antd';
import {
  InboxOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  LeftOutlined,
  RightOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import PDFPreview from './PDFPreview';

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

interface PDFFile {
  data: ArrayBuffer | null;
  name: string;
  pageCount: number;
}

// ============ 主组件 ============

const CompareTool: React.FC = () => {
  const [leftPdf, setLeftPdf] = useState<PDFFile>({ data: null, name: '', pageCount: 0 });
  const [rightPdf, setRightPdf] = useState<PDFFile>({ data: null, name: '', pageCount: 0 });
  const [loading, setLoading] = useState<'left' | 'right' | null>(null);
  
  // 同步控制
  const [syncNavigation, setSyncNavigation] = useState(true);
  const [syncZoom, setSyncZoom] = useState(true);
  
  // 当前状态
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  // 处理文件上传
  const handleUpload = useCallback(async (file: File, side: 'left' | 'right') => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      setLoading(side);
      const arrayBuffer = await file.arrayBuffer();
      
      // 验证 PDF
      const header = new Uint8Array(arrayBuffer.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      const pdfFile: PDFFile = {
        data: arrayBuffer,
        name: file.name,
        pageCount: 0, // 将由 PDFPreview 更新
      };

      if (side === 'left') {
        setLeftPdf(pdfFile);
      } else {
        setRightPdf(pdfFile);
      }

      message.success(`${side === 'left' ? '左侧' : '右侧'} PDF 加载成功`);
      return false;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    } finally {
      setLoading(null);
    }
  }, []);

  // 更新页数
  const handlePageCountChange = useCallback((side: 'left' | 'right', count: number) => {
    if (side === 'left') {
      setLeftPdf(prev => ({ ...prev, pageCount: count }));
    } else {
      setRightPdf(prev => ({ ...prev, pageCount: count }));
    }
  }, []);

  // 页面导航
  const handlePageChange = useCallback((page: number) => {
    const maxPage = Math.max(leftPdf.pageCount, rightPdf.pageCount);
    if (page >= 1 && page <= maxPage) {
      setCurrentPage(page);
    }
  }, [leftPdf.pageCount, rightPdf.pageCount]);

  // 缩放控制
  const handleZoomChange = useCallback((newZoom: number) => {
    if (newZoom >= 25 && newZoom <= 400) {
      setZoom(newZoom);
    }
  }, []);

  const maxPage = Math.max(leftPdf.pageCount, rightPdf.pageCount);

  // 渲染上传区域
  const renderUploadArea = (side: 'left' | 'right') => {
    const pdf = side === 'left' ? leftPdf : rightPdf;
    const isLoading = loading === side;

    if (pdf.data) {
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
            <Row justify="space-between" align="middle">
              <Col>
                <Text strong ellipsis style={{ maxWidth: 150 }} title={pdf.name}>
                  {pdf.name}
                </Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  ({pdf.pageCount} 页)
                </Text>
              </Col>
              <Col>
                <Upload
                  accept=".pdf"
                  showUploadList={false}
                  beforeUpload={file => handleUpload(file, side)}
                >
                  <Button size="small">更换</Button>
                </Upload>
              </Col>
            </Row>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <PDFPreview
              pdfData={pdf.data}
              currentPage={syncNavigation ? currentPage : undefined}
              zoom={syncZoom ? zoom : undefined}
              onPageChange={syncNavigation ? handlePageChange : undefined}
              onTotalPagesChange={count => handlePageCountChange(side, count)}
              showControls={!syncNavigation || !syncZoom}
            />
          </div>
        </div>
      );
    }

    return (
      <Spin spinning={isLoading}>
        <Dragger
          accept=".pdf"
          showUploadList={false}
          beforeUpload={file => handleUpload(file, side)}
          style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">
            {side === 'left' ? '上传左侧 PDF' : '上传右侧 PDF'}
          </p>
          <p className="ant-upload-hint">点击或拖拽文件</p>
        </Dragger>
      </Spin>
    );
  };

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 控制栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Space>
              <Text>同步导航</Text>
              <Switch
                checked={syncNavigation}
                onChange={setSyncNavigation}
                size="small"
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Text>同步缩放</Text>
              <Switch
                checked={syncZoom}
                onChange={setSyncZoom}
                size="small"
              />
            </Space>
          </Col>
          
          {(syncNavigation || syncZoom) && (
            <>
              <Divider type="vertical" />
              
              {syncNavigation && maxPage > 0 && (
                <Col>
                  <Space>
                    <Button
                      size="small"
                      icon={<LeftOutlined />}
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1}
                    />
                    <InputNumber
                      size="small"
                      min={1}
                      max={maxPage}
                      value={currentPage}
                      onChange={v => v && handlePageChange(v)}
                      style={{ width: 60 }}
                    />
                    <Text type="secondary">/ {maxPage}</Text>
                    <Button
                      size="small"
                      icon={<RightOutlined />}
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= maxPage}
                    />
                  </Space>
                </Col>
              )}
              
              {syncZoom && (
                <Col>
                  <Space>
                    <Button
                      size="small"
                      icon={<ZoomOutOutlined />}
                      onClick={() => handleZoomChange(zoom - 25)}
                      disabled={zoom <= 25}
                    />
                    <InputNumber
                      size="small"
                      min={25}
                      max={400}
                      value={zoom}
                      onChange={v => v && handleZoomChange(v)}
                      formatter={v => `${v}%`}
                      parser={v => parseInt(v?.replace('%', '') || '100', 10)}
                      style={{ width: 70 }}
                    />
                    <Button
                      size="small"
                      icon={<ZoomInOutlined />}
                      onClick={() => handleZoomChange(zoom + 25)}
                      disabled={zoom >= 400}
                    />
                  </Space>
                </Col>
              )}
            </>
          )}
        </Row>
      </Card>

      {/* 并排预览区 */}
      <Row gutter={12} style={{ flex: 1, minHeight: 0 }}>
        <Col span={12} style={{ height: '100%' }}>
          <Card
            size="small"
            title="左侧文档"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, padding: 0, overflow: 'hidden' }}
          >
            {renderUploadArea('left')}
          </Card>
        </Col>
        <Col span={12} style={{ height: '100%' }}>
          <Card
            size="small"
            title="右侧文档"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, padding: 0, overflow: 'hidden' }}
          >
            {renderUploadArea('right')}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CompareTool;
