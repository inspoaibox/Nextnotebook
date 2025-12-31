/**
 * ConvertTool - PDF 转换工具组件
 * 提供多种 PDF 转换功能：灰度转换、PDF/A 转换、修复、版本转换、线性化
 * 需要 Ghostscript 支持
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, Row, Col, Typography, Upload, Button, Space, message, Radio, Statistic, Alert, Tag, Tabs, Tooltip } from 'antd';
import { 
  UploadOutlined, InboxOutlined, DownloadOutlined, CheckCircleOutlined, WarningOutlined,
  BgColorsOutlined, SafetyCertificateOutlined, ToolOutlined, SwapOutlined, GlobalOutlined
} from '@ant-design/icons';
import { pdfApi, ConvertResult } from '../../services/pdfApi';
import { formatFileSize, validatePdfHeader, downloadFile } from './utils';

const { Text, Title } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

interface PDFFile {
  name: string;
  data: ArrayBuffer;
  size: number;
}

interface GhostscriptStatus {
  available: boolean;
  path: string | null;
  version?: string | null;
}

type ConvertType = 'grayscale' | 'pdfa' | 'repair' | 'version' | 'linearize';
type PDFALevel = '1b' | '2b' | '3b';
type PDFVersion = '1.4' | '1.5' | '1.6' | '1.7' | '2.0';

// ============ ConvertTool 组件 ============

const ConvertTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [convertType, setConvertType] = useState<ConvertType>('grayscale');
  const [pdfaLevel, setPdfaLevel] = useState<PDFALevel>('2b');
  const [pdfVersion, setPdfVersion] = useState<PDFVersion>('1.4');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
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

  // 执行转换
  const handleConvert = useCallback(async () => {
    if (!pdfFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (!gsStatus?.available) {
      message.error('Ghostscript 不可用，无法执行转换');
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      let convertResult: ConvertResult;
      
      switch (convertType) {
        case 'grayscale':
          convertResult = await pdfApi.toGrayscale(pdfFile.data.slice(0));
          break;
        case 'pdfa':
          convertResult = await pdfApi.toPDFA({ file: pdfFile.data.slice(0), level: pdfaLevel });
          break;
        case 'repair':
          convertResult = await pdfApi.repair(pdfFile.data.slice(0));
          break;
        case 'version':
          convertResult = await pdfApi.convertVersion({ file: pdfFile.data.slice(0), version: pdfVersion });
          break;
        case 'linearize':
          convertResult = await pdfApi.linearize(pdfFile.data.slice(0));
          break;
        default:
          throw new Error('未知的转换类型');
      }

      setResult(convertResult);
      message.success('转换完成');
    } catch (error) {
      console.error('Convert failed:', error);
      message.error('转换失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, convertType, pdfaLevel, pdfVersion, gsStatus]);

  // 下载转换后的文件
  const handleDownload = useCallback(() => {
    if (!result || !pdfFile) return;
    
    const suffixMap: Record<ConvertType, string> = {
      grayscale: '_grayscale',
      pdfa: `_pdfa${pdfaLevel}`,
      repair: '_repaired',
      version: `_v${pdfVersion}`,
      linearize: '_web',
    };
    
    downloadFile(result.data, pdfFile.name.replace('.pdf', `${suffixMap[convertType]}.pdf`));
  }, [result, pdfFile, convertType, pdfaLevel, pdfVersion]);

  // Ghostscript 不可用时显示提示
  if (!checkingGs && !gsStatus?.available) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message="Ghostscript 未安装"
          description="PDF 转换功能需要 Ghostscript 支持。请安装 Ghostscript 后重试。"
          type="error"
          showIcon
        />
      </div>
    );
  }

  // 未上传文件时显示上传区域
  if (!pdfFile) {
    return (
      <div style={{ padding: 24 }}>
        {!checkingGs && gsStatus?.available && (
          <Alert
            message="Ghostscript 已就绪"
            description={`版本: ${gsStatus.version || '未知'}`}
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
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
          <p className="ant-upload-hint">支持灰度转换、PDF/A 转换、修复、版本转换、Web 优化</p>
        </Dragger>
      </div>
    );
  }


  // 转换类型配置
  const convertTypes = [
    { key: 'grayscale', label: '灰度转换', icon: <BgColorsOutlined />, desc: '将彩色 PDF 转为灰度，减小文件大小' },
    { key: 'pdfa', label: 'PDF/A', icon: <SafetyCertificateOutlined />, desc: '转换为符合存档标准的 PDF/A 格式' },
    { key: 'repair', label: '修复', icon: <ToolOutlined />, desc: '尝试修复损坏的 PDF 文件' },
    { key: 'version', label: '版本转换', icon: <SwapOutlined />, desc: '转换 PDF 版本以提高兼容性' },
    { key: 'linearize', label: 'Web 优化', icon: <GlobalOutlined />, desc: '优化 PDF 以便在 Web 上快速查看' },
  ];

  return (
    <div>
      {/* 上方：参数设置区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Space>
              <Upload accept=".pdf" showUploadList={false} beforeUpload={handleFileUpload}>
                <Button icon={<UploadOutlined />} size="small">更换文件</Button>
              </Upload>
              <Text ellipsis style={{ maxWidth: 120 }}>{pdfFile.name}</Text>
              <Text type="secondary">({formatFileSize(pdfFile.size)})</Text>
            </Space>
          </Col>
          <Col span={12}>
            <Tabs
              activeKey={convertType}
              onChange={(key) => { setConvertType(key as ConvertType); setResult(null); }}
              size="small"
              items={convertTypes.map(t => ({
                key: t.key,
                label: (
                  <Tooltip title={t.desc}>
                    <Space size={4}>{t.icon}{t.label}</Space>
                  </Tooltip>
                ),
              }))}
            />
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              onClick={handleConvert}
              loading={processing}
            >
              转换
            </Button>
          </Col>
        </Row>

        {/* 额外参数 */}
        {convertType === 'pdfa' && (
          <Row style={{ marginTop: 12 }}>
            <Col span={24}>
              <Space>
                <Text type="secondary">PDF/A 级别：</Text>
                <Radio.Group value={pdfaLevel} onChange={(e) => setPdfaLevel(e.target.value)} size="small">
                  <Radio.Button value="1b">PDF/A-1b</Radio.Button>
                  <Radio.Button value="2b">PDF/A-2b</Radio.Button>
                  <Radio.Button value="3b">PDF/A-3b</Radio.Button>
                </Radio.Group>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {pdfaLevel === '1b' ? '基础存档格式' : pdfaLevel === '2b' ? '支持透明度和图层' : '支持嵌入任意文件'}
                </Text>
              </Space>
            </Col>
          </Row>
        )}

        {convertType === 'version' && (
          <Row style={{ marginTop: 12 }}>
            <Col span={24}>
              <Space>
                <Text type="secondary">目标版本：</Text>
                <Radio.Group value={pdfVersion} onChange={(e) => setPdfVersion(e.target.value)} size="small">
                  <Radio.Button value="1.4">1.4</Radio.Button>
                  <Radio.Button value="1.5">1.5</Radio.Button>
                  <Radio.Button value="1.6">1.6</Radio.Button>
                  <Radio.Button value="1.7">1.7</Radio.Button>
                  <Radio.Button value="2.0">2.0</Radio.Button>
                </Radio.Group>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {pdfVersion === '1.4' ? '最广泛兼容' : pdfVersion === '2.0' ? '最新标准' : ''}
                </Text>
              </Space>
            </Col>
          </Row>
        )}
      </Card>

      {/* 下方：转换结果展示 */}
      <Card size="small" title="转换结果">
        {!result ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            {processing ? (
              <Text>正在转换...</Text>
            ) : (
              <Text>选择转换类型后点击"转换"按钮</Text>
            )}
          </div>
        ) : (
          <div>
            <Row gutter={24} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Statistic title="原始大小" value={formatFileSize(result.originalSize)} />
              </Col>
              <Col span={8}>
                <Statistic title="转换后大小" value={formatFileSize(result.convertedSize)} />
              </Col>
              <Col span={8}>
                <Statistic 
                  title="大小变化" 
                  value={((result.convertedSize - result.originalSize) / result.originalSize * 100).toFixed(1)} 
                  suffix="%" 
                  valueStyle={{ color: result.convertedSize <= result.originalSize ? '#3f8600' : '#cf1322' }}
                  prefix={result.convertedSize <= result.originalSize ? '↓' : '↑'}
                />
              </Col>
            </Row>

            <Button 
              type="primary" 
              icon={<DownloadOutlined />} 
              onClick={handleDownload}
              size="large"
            >
              下载转换后的 PDF
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ConvertTool;
