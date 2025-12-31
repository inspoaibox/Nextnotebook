/**
 * WatermarkTool - PDF 加水印工具组件
 * 采用上下布局：上方为参数设置区，下方为 PDF 预览区
 */

import React, { useState, useCallback } from 'react';
import { 
  Card, Row, Col, Typography, Upload, Button, Space, message, 
  Radio, Slider, Input, InputNumber, ColorPicker, Checkbox
} from 'antd';
import { 
  UploadOutlined, InboxOutlined, DownloadOutlined, 
  FontColorsOutlined, PictureOutlined, EyeOutlined 
} from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';
import PDFPreview from './PDFPreview';

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

interface PDFFile {
  name: string;
  data: ArrayBuffer;
  size: number;
}

type WatermarkType = 'text' | 'image';
type PositionType = 'center' | 'tile';

interface WatermarkConfig {
  type: WatermarkType;
  text: string;
  imageData: ArrayBuffer | null;
  imageName: string;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  position: PositionType;
  spacingX: number;  // 横向间距
  spacingY: number;  // 纵向间距
  applyToAllPages: boolean;
  selectedPages: number[];
}

// ============ WatermarkTool 组件 ============

const WatermarkTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resultData, setResultData] = useState<ArrayBuffer | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  
  const [config, setConfig] = useState<WatermarkConfig>({
    type: 'text',
    text: '机密文件',
    imageData: null,
    imageName: '',
    fontSize: 48,
    color: '#ff0000',
    opacity: 0.3,
    rotation: -45,
    position: 'tile',
    spacingX: 100,  // 默认横向间距
    spacingY: 80,   // 默认纵向间距
    applyToAllPages: true,
    selectedPages: [],
  });

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

      // 先清除旧数据
      setResultData(null);
      
      // 设置新文件
      setPdfFile({
        name: file.name,
        data: bufferCopy,
        size: file.size,
      });
      
      // 强制更新预览
      setPreviewKey(Date.now());
      
      message.success(`已加载: ${file.name}`);
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
    }
    
    // 始终返回 false 阻止默认上传
    return false;
  }, []);

  // 水印图片上传处理
  const handleImageUpload = useCallback(async (file: File): Promise<boolean> => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      message.error('请上传 PNG 或 JPG 图片');
      return false;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      // 复制 ArrayBuffer 以避免 detached 问题
      const bufferCopy = arrayBuffer.slice(0);
      setConfig(prev => ({
        ...prev,
        imageData: bufferCopy,
        imageName: file.name,
      }));
      message.success(`水印图片已加载: ${file.name}`);
      return true;
    } catch (error) {
      console.error('Failed to load image:', error);
      message.error('图片加载失败');
      return false;
    }
  }, []);

  // 应用水印
  const handleApplyWatermark = useCallback(async () => {
    if (!pdfFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (config.type === 'text' && !config.text.trim()) {
      message.warning('请输入水印文字');
      return;
    }

    if (config.type === 'image' && !config.imageData) {
      message.warning('请上传水印图片');
      return;
    }

    setProcessing(true);

    try {
      // 复制 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.addWatermark({
        file: pdfFile.data.slice(0),
        type: config.type,
        text: config.type === 'text' ? config.text : undefined,
        imageData: config.type === 'image' ? config.imageData!.slice(0) : undefined,
        fontSize: config.fontSize,
        color: config.color,
        opacity: config.opacity,
        rotation: config.rotation,
        position: config.position,
        spacingX: config.spacingX,
        spacingY: config.spacingY,
        pages: config.applyToAllPages ? undefined : config.selectedPages,
      });

      setResultData(result);
      setPreviewKey(prev => prev + 1);
      message.success('水印添加成功');
    } catch (error) {
      console.error('Add watermark failed:', error);
      message.error('添加水印失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, config]);

  // 下载结果
  const handleDownload = useCallback(() => {
    if (!resultData || !pdfFile) return;

    const blob = new Blob([resultData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFile.name.replace('.pdf', '_watermarked.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [resultData, pdfFile]);

  // 更新配置
  const updateConfig = useCallback(<K extends keyof WatermarkConfig>(
    key: K, 
    value: WatermarkConfig[K]
  ) => {
    setConfig((prev: WatermarkConfig) => ({ ...prev, [key]: value }));
  }, []);

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
          <p className="ant-upload-hint">为 PDF 添加文字或图片水印</p>
        </Dragger>
      </div>
    );
  }

  return (
    <div>
      {/* 上方：参数设置区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle" style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Space>
              <Upload accept=".pdf" showUploadList={false} beforeUpload={handlePdfUpload}>
                <Button icon={<UploadOutlined />} size="small">更换文件</Button>
              </Upload>
              <Text ellipsis style={{ maxWidth: 150 }}>{pdfFile.name}</Text>
            </Space>
          </Col>
          <Col span={4}>
            <Text type="secondary">水印类型：</Text>
            <Radio.Group 
              value={config.type} 
              onChange={(e) => updateConfig('type', e.target.value)}
              size="small"
            >
              <Radio.Button value="text"><FontColorsOutlined /> 文字</Radio.Button>
              <Radio.Button value="image"><PictureOutlined /> 图片</Radio.Button>
            </Radio.Group>
          </Col>
          <Col span={4}>
            <Text type="secondary">位置：</Text>
            <Radio.Group 
              value={config.position} 
              onChange={(e) => updateConfig('position', e.target.value)}
              size="small"
            >
              <Radio.Button value="center">居中</Radio.Button>
              <Radio.Button value="tile">平铺</Radio.Button>
            </Radio.Group>
          </Col>
          <Col span={6}>
            <Checkbox 
              checked={config.applyToAllPages}
              onChange={(e) => updateConfig('applyToAllPages', e.target.checked)}
            >
              应用到所有页面
            </Checkbox>
          </Col>
          <Col span={4} style={{ textAlign: 'right' }}>
            <Space>
              <Button
                type="primary"
                icon={<EyeOutlined />}
                onClick={handleApplyWatermark}
                loading={processing}
              >
                预览
              </Button>
              {resultData && (
                <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                  下载
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {/* 水印配置 */}
        <Row gutter={16} align="middle">
          {config.type === 'text' ? (
            <>
              <Col span={6}>
                <Text type="secondary">水印文字：</Text>
                <Input
                  value={config.text}
                  onChange={(e) => updateConfig('text', e.target.value)}
                  placeholder="输入水印文字"
                  size="small"
                  style={{ width: 150 }}
                />
              </Col>
              <Col span={4}>
                <Text type="secondary">字号：</Text>
                <InputNumber
                  value={config.fontSize}
                  onChange={(v) => updateConfig('fontSize', v || 48)}
                  min={12}
                  max={200}
                  size="small"
                  style={{ width: 70 }}
                />
              </Col>
              <Col span={4}>
                <Text type="secondary">颜色：</Text>
                <ColorPicker
                  value={config.color}
                  onChange={(_, hex) => updateConfig('color', hex)}
                  size="small"
                />
              </Col>
            </>
          ) : (
            <Col span={8}>
              <Space>
                <Upload 
                  accept=".png,.jpg,.jpeg" 
                  showUploadList={false} 
                  beforeUpload={handleImageUpload}
                >
                  <Button icon={<UploadOutlined />} size="small">选择图片</Button>
                </Upload>
                {config.imageName && (
                  <Text type="secondary">{config.imageName}</Text>
                )}
              </Space>
            </Col>
          )}
          <Col span={5}>
            <Text type="secondary">透明度：</Text>
            <Slider
              value={config.opacity}
              onChange={(v) => updateConfig('opacity', v)}
              min={0.1}
              max={1}
              step={0.1}
              style={{ width: 100, display: 'inline-block', marginLeft: 8 }}
            />
            <Text style={{ marginLeft: 8 }}>{Math.round(config.opacity * 100)}%</Text>
          </Col>
          <Col span={5}>
            <Text type="secondary">旋转：</Text>
            <Slider
              value={config.rotation}
              onChange={(v) => updateConfig('rotation', v)}
              min={-180}
              max={180}
              step={15}
              style={{ width: 100, display: 'inline-block', marginLeft: 8 }}
            />
            <Text style={{ marginLeft: 8 }}>{config.rotation}°</Text>
          </Col>
        </Row>

        {/* 平铺间距设置（仅在平铺模式下显示） */}
        {config.position === 'tile' && (
          <Row gutter={16} align="middle" style={{ marginTop: 12 }}>
            <Col span={6}>
              <Text type="secondary">横向间距：</Text>
              <InputNumber
                value={config.spacingX}
                onChange={(v) => updateConfig('spacingX', v || 100)}
                min={0}
                max={500}
                step={10}
                size="small"
                style={{ width: 80 }}
                addonAfter="px"
              />
            </Col>
            <Col span={6}>
              <Text type="secondary">纵向间距：</Text>
              <InputNumber
                value={config.spacingY}
                onChange={(v) => updateConfig('spacingY', v || 80)}
                min={0}
                max={500}
                step={10}
                size="small"
                style={{ width: 80 }}
                addonAfter="px"
              />
            </Col>
          </Row>
        )}
      </Card>

      {/* 下方：PDF 预览区 */}
      <Card 
        size="small" 
        title={resultData ? "预览效果（已添加水印）" : "原始 PDF"}
        style={{ height: 'calc(100vh - 320px)' }}
        styles={{ body: { height: 'calc(100% - 40px)', padding: 0, display: 'flex', flexDirection: 'column' } }}
      >
        <PDFPreview
          key={previewKey}
          pdfData={resultData || pdfFile.data}
          style={{ flex: 1, minHeight: 0 }}
        />
      </Card>
    </div>
  );
};

export default WatermarkTool;
