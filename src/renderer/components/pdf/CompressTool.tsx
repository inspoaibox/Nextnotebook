/**
 * CompressTool - PDF 压缩工具组件
 * 采用上下布局：上方为参数设置区，下方为压缩结果展示
 * 优先使用 Ghostscript 进行真正的图片压缩，否则使用 pdf-lib 进行基础优化
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, Row, Col, Typography, Upload, Button, Space, message, Radio, Progress, Statistic, Alert, Tag } from 'antd';
import { UploadOutlined, InboxOutlined, DownloadOutlined, CompressOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';
import { formatFileSize, validatePdfHeader, downloadFile } from './utils';

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

interface PDFFile {
  name: string;
  data: ArrayBuffer;
  size: number;
}

interface CompressResult {
  data: ArrayBuffer;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

type CompressLevel = 'low' | 'medium' | 'high';

interface GhostscriptStatus {
  available: boolean;
  path: string | null;
  version?: string | null;
}

// ============ CompressTool 组件 ============

const CompressTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [level, setLevel] = useState<CompressLevel>('medium');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [gsStatus, setGsStatus] = useState<GhostscriptStatus | null>(null);
  const [checkingGs, setCheckingGs] = useState(true);

  // 检查 Ghostscript 可用性
  useEffect(() => {
    const checkGs = async () => {
      try {
        const status = await pdfApi.checkGhostscript();
        setGsStatus(status);
      } catch (error) {
        console.error('Failed to check Ghostscript:', error);
        setGsStatus({ available: false, path: null });
      } finally {
        setCheckingGs(false);
      }
    };
    checkGs();
  }, []);

  // 文件上传处理
  const handleFileUpload = useCallback(async (file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 复制 ArrayBuffer 以避免 detached 问题
      const bufferCopy = arrayBuffer.slice(0);
      
      if (!validatePdfHeader(bufferCopy)) {
        message.error('无效的 PDF 文件');
        return false;
      }

      setPdfFile({
        name: file.name,
        data: bufferCopy,
        size: file.size,
      });
      setResult(null);
      
      message.success(`已加载: ${file.name} (${formatFileSize(file.size)})`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);


  // 执行压缩
  const handleCompress = useCallback(async () => {
    if (!pdfFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      // 复制 ArrayBuffer 以避免 detached 问题
      const compressResult = await pdfApi.compress({
        file: pdfFile.data.slice(0),
        level,
      });

      setResult({
        data: compressResult.data,
        originalSize: compressResult.originalSize,
        compressedSize: compressResult.compressedSize,
        ratio: Math.max(0, compressResult.ratio),
      });

      if (compressResult.compressedSize >= compressResult.originalSize) {
        message.info('文件已经是最优状态，无法进一步压缩');
      } else {
        message.success(`压缩完成，节省 ${compressResult.ratio.toFixed(1)}%`);
      }
    } catch (error) {
      console.error('Compress failed:', error);
      message.error('压缩失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, level]);

  // 下载压缩后的文件
  const handleDownload = useCallback(() => {
    if (!result || !pdfFile) return;
    downloadFile(result.data, pdfFile.name.replace('.pdf', '_compressed.pdf'));
  }, [result, pdfFile]);

  // 未上传文件时显示上传区域
  if (!pdfFile) {
    return (
      <div style={{ padding: 24 }}>
        {/* Ghostscript 状态提示 */}
        {!checkingGs && (
          <Alert
            message={gsStatus?.available ? 'Ghostscript 已就绪' : 'Ghostscript 未安装'}
            description={
              gsStatus?.available 
                ? `使用 Ghostscript 进行高质量压缩 (版本: ${gsStatus.version || '未知'})`
                : '将使用基础优化模式，压缩效果有限。安装 Ghostscript 可获得更好的压缩效果。'
            }
            type={gsStatus?.available ? 'success' : 'warning'}
            showIcon
            icon={gsStatus?.available ? <CheckCircleOutlined /> : <WarningOutlined />}
            style={{ marginBottom: 16 }}
          />
        )}
        
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
          <p className="ant-upload-hint">
            {gsStatus?.available 
              ? '使用 Ghostscript 进行高质量图片压缩'
              : '优化 PDF 文件结构以减小文件大小'
            }
          </p>
        </Dragger>
      </div>
    );
  }

  const levelDescriptions: Record<CompressLevel, { label: string; desc: string }> = gsStatus?.available ? {
    low: { label: '低压缩', desc: '300 DPI - 保持高质量' },
    medium: { label: '中压缩', desc: '150 DPI - 平衡质量与大小' },
    high: { label: '高压缩', desc: '72 DPI - 最小文件' },
  } : {
    low: { label: '低', desc: '保留元数据' },
    medium: { label: '中', desc: '移除部分元数据' },
    high: { label: '高', desc: '移除所有元数据' },
  };


  return (
    <div>
      {/* 上方：参数设置区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={5}>
            <Space>
              <Upload accept=".pdf" showUploadList={false} beforeUpload={handleFileUpload}>
                <Button icon={<UploadOutlined />} size="small">更换文件</Button>
              </Upload>
              <Text ellipsis style={{ maxWidth: 100 }}>{pdfFile.name}</Text>
            </Space>
          </Col>
          <Col span={4}>
            <Text type="secondary">原始大小：</Text>
            <Text strong>{formatFileSize(pdfFile.size)}</Text>
          </Col>
          <Col span={9}>
            <Space>
              <Text type="secondary">压缩级别：</Text>
              <Radio.Group value={level} onChange={(e) => setLevel(e.target.value)} size="small">
                <Radio.Button value="low">{levelDescriptions.low.label}</Radio.Button>
                <Radio.Button value="medium">{levelDescriptions.medium.label}</Radio.Button>
                <Radio.Button value="high">{levelDescriptions.high.label}</Radio.Button>
              </Radio.Group>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {levelDescriptions[level].desc}
              </Text>
            </Space>
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Space>
              {gsStatus?.available ? (
                <Tag color="green" icon={<CheckCircleOutlined />}>Ghostscript</Tag>
              ) : (
                <Tag color="orange" icon={<WarningOutlined />}>基础模式</Tag>
              )}
              <Button
                type="primary"
                icon={<CompressOutlined />}
                onClick={handleCompress}
                loading={processing}
              >
                压缩
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 下方：压缩结果展示 */}
      <Card size="small" title="压缩结果">
        {!gsStatus?.available && (
          <Alert
            message="基础优化模式"
            description="当前使用结构优化方式。安装 Ghostscript 可获得真正的图片压缩，压缩率可达 50-90%。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        
        {!result ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            {processing ? (
              <Space direction="vertical">
                <Progress type="circle" percent={0} status="active" />
                <Text>正在压缩...</Text>
              </Space>
            ) : (
              <Text>选择压缩级别后点击"压缩"按钮</Text>
            )}
          </div>
        ) : (
          <div>
            <Row gutter={24} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Statistic title="原始大小" value={formatFileSize(result.originalSize)} />
              </Col>
              <Col span={6}>
                <Statistic title="压缩后大小" value={formatFileSize(result.compressedSize)} />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="节省比例" 
                  value={result.ratio.toFixed(1)} 
                  suffix="%" 
                  valueStyle={{ color: result.ratio > 0 ? '#3f8600' : '#999' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="节省空间" 
                  value={result.ratio > 0 ? formatFileSize(result.originalSize - result.compressedSize) : '0 B'} 
                />
              </Col>
            </Row>

            {/* 可视化对比 */}
            <div style={{ marginBottom: 24 }}>
              <Text type="secondary">大小对比：</Text>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    height: 24, 
                    background: '#1890ff', 
                    width: '100%',
                    borderRadius: 4,
                  }} />
                  <Text style={{ fontSize: 12 }}>原始: {formatFileSize(result.originalSize)}</Text>
                </div>
                <div style={{ width: 20 }} />
                <div style={{ flex: Math.max(0.1, result.compressedSize / result.originalSize) }}>
                  <div style={{ 
                    height: 24, 
                    background: result.ratio > 0 ? '#52c41a' : '#faad14', 
                    width: '100%',
                    borderRadius: 4,
                  }} />
                  <Text style={{ fontSize: 12 }}>压缩后: {formatFileSize(result.compressedSize)}</Text>
                </div>
              </div>
            </div>

            <Button 
              type="primary" 
              icon={<DownloadOutlined />} 
              onClick={handleDownload}
              size="large"
              disabled={result.compressedSize >= result.originalSize}
            >
              下载压缩后的 PDF
            </Button>
            
            {result.compressedSize >= result.originalSize && (
              <Text type="secondary" style={{ marginLeft: 12 }}>
                文件已是最优状态
              </Text>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default CompressTool;
