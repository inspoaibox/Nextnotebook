/**
 * ImageToolPanel - 图片处理工具面板
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Layout,
  Menu,
  Card,
  Button,
  Space,
  Typography,
  message,
  Spin,
  Upload,
  Row,
  Col,
  Slider,
  Select,
  InputNumber,
  Switch,
  Divider,
  Descriptions,
  Radio,
  Tooltip,
} from 'antd';
import {
  SwapOutlined,
  ExpandOutlined,
  ScissorOutlined,
  RotateRightOutlined,
  BgColorsOutlined,
  FilterOutlined,
  PictureOutlined,
  InfoCircleOutlined,
  CompressOutlined,
  UploadOutlined,
  DownloadOutlined,
  ReloadOutlined,
  InboxOutlined,
  UndoOutlined,
  RedoOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import {
  imageApi,
  fileToBase64,
  base64ToDataUrl,
  formatFileSize,
  calculateCompressionRatio,
  ImageMetadata,
  ProcessOptions,
  ProcessResult,
} from '../services/imageApi';
import useImageHistory, { ImageToolType } from '../hooks/useImageHistory';
import useImageKeyboard, { SHORTCUT_HELP } from '../hooks/useImageKeyboard';
import CropBox from './CropBox';
import ComparisonView, { ComparisonMode } from './ComparisonView';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;
const { Dragger } = Upload;


// 工具定义
interface ImageTool {
  id: ImageToolType;
  name: string;
  icon: React.ReactNode;
}

const imageTools: ImageTool[] = [
  { id: 'format-convert', name: '格式转换', icon: <SwapOutlined /> },
  { id: 'resize', name: '尺寸调整', icon: <ExpandOutlined /> },
  { id: 'crop', name: '图片裁剪', icon: <ScissorOutlined /> },
  { id: 'rotate-flip', name: '旋转翻转', icon: <RotateRightOutlined /> },
  { id: 'color-adjust', name: '颜色处理', icon: <BgColorsOutlined /> },
  { id: 'filters', name: '滤镜效果', icon: <FilterOutlined /> },
  { id: 'watermark', name: '水印叠加', icon: <PictureOutlined /> },
  { id: 'metadata', name: '元数据', icon: <InfoCircleOutlined /> },
  { id: 'compress', name: '优化压缩', icon: <CompressOutlined /> },
];

// ============ 主组件 ============

interface ImageToolPanelProps {
  defaultTool?: ImageToolType;
  hideSidebar?: boolean;
}

const ImageToolPanel: React.FC<ImageToolPanelProps> = ({ defaultTool = 'format-convert', hideSidebar = true }) => {
  const [selectedTool, setSelectedTool] = useState<ImageToolType>(defaultTool);
  const [imageData, setImageData] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  // 当 defaultTool 变化时同步更新 selectedTool
  React.useEffect(() => {
    setSelectedTool(defaultTool);
  }, [defaultTool]);  const history = useImageHistory();

  const handleFileUpload = useCallback(async (file: File) => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      message.error('文件大小超过 50MB 限制');
      return false;
    }
    try {
      setProcessing(true);
      const base64 = await fileToBase64(file);
      setImageData(base64);
      const meta = await imageApi.getMetadata(base64);
      setMetadata(meta);
      const preview = await imageApi.generatePreview(base64);
      const previewDataUrl = base64ToDataUrl(preview, 'png');
      setPreviewUrl(previewDataUrl);
      setOriginalPreviewUrl(previewDataUrl);
      setResult(null);
      setShowComparison(false);
      history.clear();
      message.success('图片加载成功');
    } catch (error) {
      console.error('Failed to load image:', error);
      message.error('图片加载失败');
    } finally {
      setProcessing(false);
    }
    return false;
  }, [history]);

  const handleProcess = useCallback(async (options: ProcessOptions, useCurrentResult: boolean = false) => {
    // 如果 useCurrentResult 为 true 且有处理结果，则基于当前结果继续处理
    const inputData = useCurrentResult && result?.buffer ? result.buffer : imageData;
    if (!inputData) {
      message.warning('请先上传图片');
      return;
    }
    try {
      setProcessing(true);
      const processResult = await imageApi.process(inputData, options);
      setResult(processResult);
      const newPreviewUrl = base64ToDataUrl(processResult.buffer, processResult.info.format);
      setPreviewUrl(newPreviewUrl);
      history.push({
        toolType: selectedTool,
        options,
        previewUrl: newPreviewUrl,
        result: processResult,
      });
      message.success('处理完成');
    } catch (error) {
      console.error('Failed to process image:', error);
      message.error('处理失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [imageData, result, selectedTool, history]);

  const handleSave = useCallback(async () => {
    const buffer = result?.buffer || imageData;
    if (!buffer) {
      message.warning('没有可保存的图片');
      return;
    }
    const format = result?.info.format || metadata?.format || 'png';
    const defaultName = `image_${Date.now()}.${format}`;
    try {
      const saved = await imageApi.saveFile(buffer, defaultName);
      if (saved) {
        message.success('保存成功');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      message.error('保存失败');
    }
  }, [result, imageData, metadata]);

  const handleReset = useCallback(() => {
    if (imageData && metadata) {
      setResult(null);
      imageApi.generatePreview(imageData).then(preview => {
        setPreviewUrl(base64ToDataUrl(preview, 'png'));
      });
    }
  }, [imageData, metadata]);

  const handleUndo = useCallback(() => {
    if (!history.canUndo) {
      message.info('没有可撤销的操作');
      return;
    }
    const prevState = history.undo();
    if (prevState) {
      setPreviewUrl(prevState.previewUrl);
      setResult(prevState.result || null);
      message.info('已撤销');
    }
  }, [history]);

  const handleRedo = useCallback(() => {
    if (!history.canRedo) {
      message.info('没有可重做的操作');
      return;
    }
    const nextState = history.redo();
    if (nextState) {
      setPreviewUrl(nextState.previewUrl);
      setResult(nextState.result || null);
      message.info('已重做');
    }
  }, [history]);

  useImageKeyboard({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSave: handleSave,
    onReset: handleReset,
  }, !!imageData);

  const shortcutHelpContent = useMemo(() => (
    <div style={{ padding: 8 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>快捷键</div>
      {SHORTCUT_HELP.map((item, index) => (
        <div key={index} style={{ marginBottom: 4 }}>
          <Text code>{item.keys}</Text> {item.action}
        </div>
      ))}
    </div>
  ), []);


  const renderToolContent = () => {
    if (!imageData) {
      return (
        <div style={{ padding: 24 }}>
          <Dragger
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleFileUpload}
            style={{ padding: 40 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽图片到此处</p>
            <p className="ant-upload-hint">支持 JPEG、PNG、WebP、AVIF、GIF、TIFF、SVG 格式</p>
          </Dragger>
        </div>
      );
    }

    const toolProps: ToolProps = {
      imageData,
      metadata,
      result,
      previewUrl,
      originalPreviewUrl,
      showComparison,
      onComparisonToggle: setShowComparison,
      processing,
      onProcess: handleProcess,
      onSave: handleSave,
      onReset: handleReset,
    };

    switch (selectedTool) {
      case 'format-convert':
        return <FormatConvertTool {...toolProps} />;
      case 'resize':
        return <ResizeTool {...toolProps} />;
      case 'crop':
        return <CropTool {...toolProps} />;
      case 'rotate-flip':
        return <RotateFlipTool {...toolProps} />;
      case 'color-adjust':
        return <ColorAdjustTool {...toolProps} />;
      case 'filters':
        return <FiltersTool {...toolProps} />;
      case 'watermark':
        return <WatermarkTool {...toolProps} />;
      case 'metadata':
        return <MetadataTool {...toolProps} />;
      case 'compress':
        return <CompressTool {...toolProps} />;
      default:
        return <div>请选择工具</div>;
    }
  };

  const currentTool = imageTools.find(t => t.id === selectedTool);
  const menuItems = imageTools.map(tool => ({
    key: tool.id,
    icon: tool.icon,
    label: tool.name,
  }));

  // 当隐藏侧边栏时，直接渲染工具内容
  if (hideSidebar) {
    return (
      <div style={{ height: '100%' }}>
        <Spin spinning={processing}>
          {imageData && (
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <Space>
                <Tooltip title="撤销 (Ctrl+Z)">
                  <Button icon={<UndoOutlined />} onClick={handleUndo} disabled={!history.canUndo} />
                </Tooltip>
                <Tooltip title="重做 (Ctrl+Y)">
                  <Button icon={<RedoOutlined />} onClick={handleRedo} disabled={!history.canRedo} />
                </Tooltip>
                <Tooltip title={shortcutHelpContent} placement="bottomRight">
                  <Button icon={<QuestionCircleOutlined />} />
                </Tooltip>
                <Upload accept="image/*" showUploadList={false} beforeUpload={handleFileUpload}>
                  <Button icon={<UploadOutlined />}>更换图片</Button>
                </Upload>
              </Space>
            </div>
          )}
          {renderToolContent()}
        </Spin>
      </div>
    );
  }

  return (
    <Layout style={{ height: '100%' }}>
      <Sider width={180} style={{ background: 'transparent', borderRight: '1px solid var(--border-color, #f0f0f0)' }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedTool]}
          onClick={({ key }) => setSelectedTool(key as ImageToolType)}
          items={menuItems}
          style={{ background: 'transparent', borderRight: 0, height: '100%' }}
        />
      </Sider>
      <Content style={{ padding: 16, overflow: 'auto' }}>
        <Spin spinning={processing}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={5} style={{ margin: 0 }}>
              {currentTool?.icon} {currentTool?.name}
            </Title>
            {imageData && (
              <Space>
                <Tooltip title="撤销 (Ctrl+Z)">
                  <Button icon={<UndoOutlined />} onClick={handleUndo} disabled={!history.canUndo} />
                </Tooltip>
                <Tooltip title="重做 (Ctrl+Y)">
                  <Button icon={<RedoOutlined />} onClick={handleRedo} disabled={!history.canRedo} />
                </Tooltip>
                <Tooltip title={shortcutHelpContent} placement="bottomRight">
                  <Button icon={<QuestionCircleOutlined />} />
                </Tooltip>
                <Upload accept="image/*" showUploadList={false} beforeUpload={handleFileUpload}>
                  <Button icon={<UploadOutlined />}>更换图片</Button>
                </Upload>
              </Space>
            )}
          </div>
          {renderToolContent()}
        </Spin>
      </Content>
    </Layout>
  );
};


// ============ 工具组件 Props ============

interface ToolProps {
  imageData: string;
  metadata: ImageMetadata | null;
  result: ProcessResult | null;
  previewUrl: string | null;
  originalPreviewUrl: string | null;
  showComparison: boolean;
  onComparisonToggle: (show: boolean) => void;
  processing: boolean;
  onProcess: (options: ProcessOptions, useCurrentResult?: boolean) => Promise<void>;
  onSave: () => Promise<void>;
  onReset: () => void;
}

// ============ 预览组件 ============

const ImagePreview: React.FC<{
  previewUrl: string | null;
  metadata: ImageMetadata | null;
  result: ProcessResult | null;
  originalUrl?: string | null;
  showComparison?: boolean;
  onComparisonToggle?: (show: boolean) => void;
}> = ({ previewUrl, metadata, result, originalUrl, showComparison = false, onComparisonToggle }) => {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('horizontal');
  const canCompare = !!result && !!originalUrl && !!previewUrl;

  return (
    <Card 
      size="small" 
      title="预览"
      extra={canCompare && (
        <Switch 
          checked={showComparison} 
          onChange={onComparisonToggle}
          checkedChildren="对比"
          unCheckedChildren="预览"
          size="small"
        />
      )}
      style={{ marginTop: 16 }}
    >
      <div style={{ textAlign: 'center', minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {showComparison && canCompare ? (
          <ComparisonView
            originalUrl={originalUrl}
            processedUrl={previewUrl}
            mode={comparisonMode}
            onModeChange={setComparisonMode}
            width={380}
            height={250}
          />
        ) : previewUrl ? (
          <img src={previewUrl} alt="预览" style={{ maxWidth: '100%', maxHeight: 300 }} />
        ) : (
          <Text type="secondary">暂无预览</Text>
        )}
      </div>
      {(metadata || result) && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {result ? (
              <>
                {result.info.width} x {result.info.height} | {result.info.format.toUpperCase()} | {formatFileSize(result.info.size)}
                {metadata && (
                  <> (原: {formatFileSize(metadata.size)}, 压缩 {calculateCompressionRatio(metadata.size, result.info.size)})</>
                )}
              </>
            ) : metadata ? (
              <>{metadata.width} x {metadata.height} | {metadata.format.toUpperCase()} | {formatFileSize(metadata.size)}</>
            ) : null}
          </Text>
        </div>
      )}
    </Card>
  );
};

// ============ 操作按钮组件 ============

const ActionButtons: React.FC<{
  onProcess: () => void;
  onSave: () => void;
  onReset: () => void;
  processing: boolean;
  hasResult: boolean;
}> = ({ onProcess, onSave, onReset, processing, hasResult }) => (
  <Space style={{ marginTop: 16 }}>
    <Button type="primary" onClick={onProcess} loading={processing}>处理</Button>
    <Button onClick={onReset} icon={<ReloadOutlined />}>重置</Button>
    <Button onClick={onSave} icon={<DownloadOutlined />} disabled={!hasResult}>保存</Button>
  </Space>
);


// ============ 格式转换工具 ============

const FormatConvertTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff'>('jpeg');
  const [quality, setQuality] = useState(80);
  const [compressionLevel, setCompressionLevel] = useState(6);
  const [lossless, setLossless] = useState(false);
  const [progressive, setProgressive] = useState(false);

  const handleProcess = () => {
    const options: ProcessOptions = { format };
    if (format === 'jpeg') {
      options.quality = quality;
      options.progressive = progressive;
    } else if (format === 'png') {
      options.compressionLevel = compressionLevel;
    } else if (format === 'webp' || format === 'avif') {
      options.quality = quality;
      options.lossless = lossless;
    }
    onProcess(options);
  };

  return (
    <div>
      <Card size="small" title="转换设置">
        <Row gutter={16}>
          <Col span={8}>
            <Text>输出格式</Text>
            <Select value={format} onChange={setFormat} style={{ width: '100%', marginTop: 4 }}>
              <Select.Option value="jpeg">JPEG</Select.Option>
              <Select.Option value="png">PNG</Select.Option>
              <Select.Option value="webp">WebP</Select.Option>
              <Select.Option value="avif">AVIF</Select.Option>
              <Select.Option value="gif">GIF</Select.Option>
              <Select.Option value="tiff">TIFF</Select.Option>
            </Select>
          </Col>
          <Col span={8}>
            {(format === 'jpeg' || format === 'webp' || format === 'avif') && (
              <div>
                <Text>质量: {quality}</Text>
                <Slider value={quality} onChange={setQuality} min={1} max={100} />
              </div>
            )}
            {format === 'png' && (
              <div>
                <Text>压缩级别: {compressionLevel}</Text>
                <Slider value={compressionLevel} onChange={setCompressionLevel} min={0} max={9} />
              </div>
            )}
          </Col>
          <Col span={8}>
            <Space direction="vertical">
              {(format === 'webp' || format === 'avif') && (
                <div><Switch checked={lossless} onChange={setLossless} /> 无损压缩</div>
              )}
              {format === 'jpeg' && (
                <div><Switch checked={progressive} onChange={setProgressive} /> 渐进式</div>
              )}
            </Space>
          </Col>
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={onReset} processing={processing} hasResult={!!result} />
      </Card>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};


// ============ 尺寸调整工具 ============

const ResizeTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [width, setWidth] = useState<number | undefined>(metadata?.width);
  const [height, setHeight] = useState<number | undefined>(metadata?.height);
  const [fit, setFit] = useState<'cover' | 'contain' | 'fill' | 'inside' | 'outside'>('contain');
  const [keepRatio, setKeepRatio] = useState(true);
  const [enableTrim, setEnableTrim] = useState(false);

  React.useEffect(() => {
    if (metadata) {
      setWidth(metadata.width);
      setHeight(metadata.height);
    }
  }, [metadata]);

  const handleWidthChange = (value: number | null) => {
    if (value && keepRatio && metadata) {
      const ratio = metadata.height / metadata.width;
      setHeight(Math.round(value * ratio));
    }
    setWidth(value || undefined);
  };

  const handleHeightChange = (value: number | null) => {
    if (value && keepRatio && metadata) {
      const ratio = metadata.width / metadata.height;
      setWidth(Math.round(value * ratio));
    }
    setHeight(value || undefined);
  };

  const handleProcess = () => {
    const options: ProcessOptions = {};
    if (width || height) {
      options.resize = { width, height, fit };
    }
    if (enableTrim) {
      options.trim = true;
    }
    onProcess(options);
  };

  return (
    <div>
      <Card size="small" title="尺寸设置">
        <Row gutter={16}>
          <Col span={6}>
            <Text>宽度</Text>
            <InputNumber value={width} onChange={handleWidthChange} min={1} max={10000} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <Text>高度</Text>
            <InputNumber value={height} onChange={handleHeightChange} min={1} max={10000} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <Text>适应模式</Text>
            <Select value={fit} onChange={setFit} style={{ width: '100%', marginTop: 4 }} size="small">
              <Select.Option value="contain">完整显示</Select.Option>
              <Select.Option value="cover">填充裁剪</Select.Option>
              <Select.Option value="fill">拉伸填充</Select.Option>
              <Select.Option value="inside">不超出</Select.Option>
              <Select.Option value="outside">不小于</Select.Option>
            </Select>
          </Col>
          <Col span={6}>
            <Space direction="vertical" style={{ marginTop: 20 }}>
              <div><Switch checked={keepRatio} onChange={setKeepRatio} size="small" /> 保持比例</div>
              <div><Switch checked={enableTrim} onChange={setEnableTrim} size="small" /> 自动裁边</div>
            </Space>
          </Col>
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={onReset} processing={processing} hasResult={!!result} />
      </Card>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};


// ============ 裁剪工具 ============

// 预设比例
const ASPECT_RATIOS = [
  { label: '自由', value: 'free' },
  { label: '1:1 正方形', value: '1:1' },
  { label: '4:3 标准', value: '4:3' },
  { label: '3:4 竖版', value: '3:4' },
  { label: '16:9 宽屏', value: '16:9' },
  { label: '9:16 竖屏', value: '9:16' },
  { label: '3:2 照片', value: '3:2' },
  { label: '2:3 竖版照片', value: '2:3' },
  { label: '21:9 超宽', value: '21:9' },
  { label: '原始比例', value: 'original' },
];

const CropTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  const [cropWidth, setCropWidth] = useState(metadata?.width || 100);
  const [cropHeight, setCropHeight] = useState(metadata?.height || 100);
  const [aspectRatio, setAspectRatio] = useState<string>('free');
  const [lockRatio, setLockRatio] = useState(false);

  React.useEffect(() => {
    if (metadata && !result) {
      setCropWidth(metadata.width);
      setCropHeight(metadata.height);
      setLeft(0);
      setTop(0);
    }
  }, [metadata, result]);

  // 应用比例
  const applyAspectRatio = useCallback((ratio: string) => {
    if (!metadata) return;
    
    setAspectRatio(ratio);
    
    if (ratio === 'free') {
      setLockRatio(false);
      return;
    }
    
    setLockRatio(true);
    
    let targetRatio: number;
    if (ratio === 'original') {
      targetRatio = metadata.width / metadata.height;
    } else {
      const [w, h] = ratio.split(':').map(Number);
      targetRatio = w / h;
    }
    
    // 计算最大可能的裁剪区域
    const maxW = metadata.width;
    const maxH = metadata.height;
    
    let newWidth: number;
    let newHeight: number;
    
    if (maxW / maxH > targetRatio) {
      // 图片更宽，以高度为基准
      newHeight = maxH;
      newWidth = Math.round(maxH * targetRatio);
    } else {
      // 图片更高，以宽度为基准
      newWidth = maxW;
      newHeight = Math.round(maxW / targetRatio);
    }
    
    // 居中放置
    const newLeft = Math.round((maxW - newWidth) / 2);
    const newTop = Math.round((maxH - newHeight) / 2);
    
    setLeft(newLeft);
    setTop(newTop);
    setCropWidth(newWidth);
    setCropHeight(newHeight);
  }, [metadata]);

  const handleCropBoxChange = useCallback((state: { left: number; top: number; width: number; height: number }) => {
    setLeft(Math.round(state.left));
    setTop(Math.round(state.top));
    setCropWidth(Math.round(state.width));
    setCropHeight(Math.round(state.height));
  }, []);

  // 当宽度改变时，如果锁定比例则自动调整高度
  const handleWidthChange = useCallback((newWidth: number | null) => {
    if (!newWidth || !metadata) return;
    setCropWidth(newWidth);
    
    if (lockRatio && aspectRatio !== 'free') {
      let targetRatio: number;
      if (aspectRatio === 'original') {
        targetRatio = metadata.width / metadata.height;
      } else {
        const [w, h] = aspectRatio.split(':').map(Number);
        targetRatio = w / h;
      }
      const newHeight = Math.round(newWidth / targetRatio);
      if (top + newHeight <= metadata.height) {
        setCropHeight(newHeight);
      }
    }
  }, [lockRatio, aspectRatio, metadata, top]);

  // 当高度改变时，如果锁定比例则自动调整宽度
  const handleHeightChange = useCallback((newHeight: number | null) => {
    if (!newHeight || !metadata) return;
    setCropHeight(newHeight);
    
    if (lockRatio && aspectRatio !== 'free') {
      let targetRatio: number;
      if (aspectRatio === 'original') {
        targetRatio = metadata.width / metadata.height;
      } else {
        const [w, h] = aspectRatio.split(':').map(Number);
        targetRatio = w / h;
      }
      const newWidth = Math.round(newHeight * targetRatio);
      if (left + newWidth <= metadata.width) {
        setCropWidth(newWidth);
      }
    }
  }, [lockRatio, aspectRatio, metadata, left]);

  const handleProcess = () => {
    const maxWidth = metadata?.width || 1000;
    const maxHeight = metadata?.height || 1000;
    if (left + cropWidth > maxWidth || top + cropHeight > maxHeight) {
      message.error('裁剪区域超出图片边界');
      return;
    }
    if (cropWidth <= 0 || cropHeight <= 0) {
      message.error('裁剪尺寸必须大于 0');
      return;
    }
    onProcess({ extract: { left, top, width: cropWidth, height: cropHeight } });
  };

  // 重置裁剪（清除结果，回到裁剪模式）
  const handleResetCrop = () => {
    onReset();
    if (metadata) {
      setLeft(0);
      setTop(0);
      setCropWidth(metadata.width);
      setCropHeight(metadata.height);
      setAspectRatio('free');
      setLockRatio(false);
    }
  };

  const maxWidth = metadata?.width || 1000;
  const maxHeight = metadata?.height || 1000;

  // 如果有处理结果，显示裁剪后的图片
  if (result) {
    return (
      <div>
        <Card size="small" title="裁剪结果">
          <Space>
            <Text>裁剪后尺寸: {result.info.width} × {result.info.height}</Text>
            <Text type="secondary">格式: {result.info.format.toUpperCase()}</Text>
          </Space>
          <div style={{ marginTop: 12 }}>
            <Space>
              <Button onClick={handleResetCrop} icon={<UndoOutlined />}>重新裁剪</Button>
              <Button type="primary" onClick={onSave} icon={<DownloadOutlined />}>保存图片</Button>
            </Space>
          </div>
        </Card>
        <ImagePreview 
          previewUrl={previewUrl} 
          metadata={metadata} 
          result={result} 
          originalUrl={originalPreviewUrl} 
          showComparison={showComparison} 
          onComparisonToggle={onComparisonToggle} 
        />
      </div>
    );
  }

  return (
    <div>
      <Card size="small" title="裁剪设置">
        <Row gutter={[12, 8]} align="middle">
          <Col span={6}>
            <Text>比例</Text>
            <Select
              value={aspectRatio}
              onChange={applyAspectRatio}
              style={{ width: '100%' }}
              size="small"
            >
              {ASPECT_RATIOS.map(r => (
                <Select.Option key={r.value} value={r.value}>{r.label}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Text>左边距</Text>
            <InputNumber value={left} onChange={v => setLeft(v || 0)} min={0} max={maxWidth - 1} style={{ width: '100%' }} size="small" />
          </Col>
          <Col span={4}>
            <Text>上边距</Text>
            <InputNumber value={top} onChange={v => setTop(v || 0)} min={0} max={maxHeight - 1} style={{ width: '100%' }} size="small" />
          </Col>
          <Col span={4}>
            <Text>宽度</Text>
            <InputNumber value={cropWidth} onChange={handleWidthChange} min={1} max={maxWidth - left} style={{ width: '100%' }} size="small" />
          </Col>
          <Col span={4}>
            <Text>高度</Text>
            <InputNumber value={cropHeight} onChange={handleHeightChange} min={1} max={maxHeight - top} style={{ width: '100%' }} size="small" />
          </Col>
          <Col span={2}>
            <Text type="secondary" style={{ fontSize: 11 }}>{cropWidth}×{cropHeight}</Text>
          </Col>
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={handleResetCrop} processing={processing} hasResult={false} />
      </Card>
      {previewUrl && metadata && (
        <Card size="small" title="可视化裁剪" style={{ marginTop: 12 }}>
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img 
                src={originalPreviewUrl || previewUrl} 
                alt="裁剪预览" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: 350, 
                  display: 'block',
                  width: Math.min(600, metadata.width * Math.min(600 / metadata.width, 350 / metadata.height)),
                  height: Math.min(350, metadata.height * Math.min(600 / metadata.width, 350 / metadata.height)),
                }} 
              />
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                <CropBox
                  imageWidth={metadata.width}
                  imageHeight={metadata.height}
                  cropState={{ left, top, width: cropWidth, height: cropHeight }}
                  onChange={handleCropBoxChange}
                  containerWidth={Math.min(600, metadata.width * Math.min(600 / metadata.width, 350 / metadata.height))}
                  containerHeight={Math.min(350, metadata.height * Math.min(600 / metadata.width, 350 / metadata.height))}
                />
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};


// ============ 旋转翻转工具 ============

const RotateFlipTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [rotate, setRotate] = useState(0);
  const [flip, setFlip] = useState(false);
  const [flop, setFlop] = useState(false);

  // 快捷旋转：逆时针90度（基于当前结果）
  const rotateLeft = () => {
    onProcess({ rotate: 270 }, true); // 270度 = 逆时针90度
  };

  // 快捷旋转：顺时针90度（基于当前结果）
  const rotateRight = () => {
    onProcess({ rotate: 90 }, true);
  };

  // 快捷旋转：180度（基于当前结果）
  const rotate180 = () => {
    onProcess({ rotate: 180 }, true);
  };

  // 自定义处理（基于原始图片）
  const handleProcess = () => {
    const options: ProcessOptions = {};
    if (rotate !== 0) options.rotate = rotate;
    if (flip) options.flip = true;
    if (flop) options.flop = true;
    if (Object.keys(options).length === 0) {
      message.info('请选择旋转角度或翻转方式');
      return;
    }
    onProcess(options, false); // 自定义处理基于原始图片
  };

  // 水平翻转（基于当前结果）
  const handleFlop = () => {
    onProcess({ flop: true }, true);
  };

  // 垂直翻转（基于当前结果）
  const handleFlip = () => {
    onProcess({ flip: true }, true);
  };

  return (
    <div>
      <Card size="small" title="快捷操作">
        <Row gutter={16}>
          <Col span={12}>
            <Text>快捷旋转（每次点击基于当前图片）</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                <Button onClick={rotateLeft} disabled={processing}>↺ 逆时针 90°</Button>
                <Button onClick={rotateRight} disabled={processing}>↻ 顺时针 90°</Button>
                <Button onClick={rotate180} disabled={processing}>旋转 180°</Button>
              </Space>
            </div>
          </Col>
          <Col span={12}>
            <Text>快捷翻转</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                <Button onClick={handleFlop} disabled={processing}>↔ 水平翻转</Button>
                <Button onClick={handleFlip} disabled={processing}>↕ 垂直翻转</Button>
              </Space>
            </div>
          </Col>
        </Row>
      </Card>
      <Card size="small" title="自定义旋转（基于原始图片）" style={{ marginTop: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Text>旋转角度: {rotate}°</Text>
            <Slider value={rotate} onChange={setRotate} min={0} max={360} />
          </Col>
          <Col span={8}>
            <Radio.Group value={rotate} onChange={e => setRotate(e.target.value)} size="small">
              <Radio.Button value={0}>0°</Radio.Button>
              <Radio.Button value={90}>90°</Radio.Button>
              <Radio.Button value={180}>180°</Radio.Button>
              <Radio.Button value={270}>270°</Radio.Button>
            </Radio.Group>
          </Col>
          <Col span={8}>
            <Space>
              <div><Switch checked={flop} onChange={setFlop} size="small" /> 水平翻转</div>
              <div><Switch checked={flip} onChange={setFlip} size="small" /> 垂直翻转</div>
            </Space>
          </Col>
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={onReset} processing={processing} hasResult={!!result} />
      </Card>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};

// ============ 颜色处理工具 ============

const ColorAdjustTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [brightness, setBrightness] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [hue, setHue] = useState(0);
  const [grayscale, setGrayscale] = useState(false);

  const handleProcess = () => {
    const options: ProcessOptions = {};
    if (grayscale) {
      options.grayscale = true;
    } else {
      options.modulate = { brightness, saturation, hue };
    }
    onProcess(options);
  };

  return (
    <div>
      <Card size="small" title="颜色设置">
        <Row gutter={16} align="middle">
          <Col span={4}>
            <div><Switch checked={grayscale} onChange={setGrayscale} size="small" /> 灰度</div>
          </Col>
          {!grayscale && (
            <>
              <Col span={6}>
                <Text>亮度: {((brightness - 1) * 100).toFixed(0)}%</Text>
                <Slider value={brightness} onChange={setBrightness} min={0.5} max={2} step={0.01} />
              </Col>
              <Col span={6}>
                <Text>饱和度: {((saturation - 1) * 100).toFixed(0)}%</Text>
                <Slider value={saturation} onChange={setSaturation} min={0} max={2} step={0.01} />
              </Col>
              <Col span={6}>
                <Text>色调: {hue}°</Text>
                <Slider value={hue} onChange={setHue} min={0} max={360} />
              </Col>
            </>
          )}
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={onReset} processing={processing} hasResult={!!result} />
      </Card>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};


// ============ 滤镜效果工具 ============

const FiltersTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [blur, setBlur] = useState(0);
  const [sharpenSigma, setSharpenSigma] = useState(0);
  const [median, setMedian] = useState(0);
  const [gamma, setGamma] = useState(1);
  const [negate, setNegate] = useState(false);
  const [normalise, setNormalise] = useState(false);

  const handleProcess = () => {
    const options: ProcessOptions = {};
    if (blur > 0) options.blur = blur;
    if (sharpenSigma > 0) options.sharpen = { sigma: sharpenSigma };
    if (median > 0) options.median = median;
    if (gamma !== 1) options.gamma = gamma;
    if (negate) options.negate = true;
    if (normalise) options.normalise = true;
    if (Object.keys(options).length === 0) {
      message.info('请调整至少一个滤镜参数');
      return;
    }
    onProcess(options);
  };

  return (
    <div>
      <Card size="small" title="滤镜设置">
        <Row gutter={16}>
          <Col span={6}>
            <Text>模糊: {blur.toFixed(1)}</Text>
            <Slider value={blur} onChange={setBlur} min={0} max={20} step={0.1} />
          </Col>
          <Col span={6}>
            <Text>锐化: {sharpenSigma.toFixed(1)}</Text>
            <Slider value={sharpenSigma} onChange={setSharpenSigma} min={0} max={10} step={0.1} />
          </Col>
          <Col span={6}>
            <Text>中值滤波: {median}</Text>
            <Slider value={median} onChange={setMedian} min={0} max={9} step={1} />
          </Col>
          <Col span={6}>
            <Text>Gamma: {gamma.toFixed(2)}</Text>
            <Slider value={gamma} onChange={setGamma} min={0.1} max={3} step={0.01} />
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: 8 }}>
          <Col span={6}><Switch checked={negate} onChange={setNegate} size="small" /> 反色</Col>
          <Col span={6}><Switch checked={normalise} onChange={setNormalise} size="small" /> 归一化</Col>
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={onReset} processing={processing} hasResult={!!result} />
      </Card>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};


// ============ 水印工具 ============

const WatermarkTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [watermarkType, setWatermarkType] = useState<'image' | 'text'>('text');
  const [watermarkData, setWatermarkData] = useState<string | null>(null);
  const [position, setPosition] = useState('southeast');
  const [opacity, setOpacity] = useState(0.5);
  const [text, setText] = useState('水印文字');
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState('#ffffff');
  const [textRotate, setTextRotate] = useState(-30);
  // 平铺选项
  const [tile, setTile] = useState(false);
  const [tileSpacingX, setTileSpacingX] = useState(150);
  const [tileSpacingY, setTileSpacingY] = useState(100);

  const handleWatermarkUpload = async (file: File) => {
    const base64 = await fileToBase64(file);
    setWatermarkData(base64);
    return false;
  };

  const handleProcess = () => {
    if (watermarkType === 'image') {
      if (!watermarkData) {
        message.warning('请先上传水印图片');
        return;
      }
      onProcess({ composite: [{ input: watermarkData, gravity: position, blend: 'over' }] });
    } else {
      if (!text.trim()) {
        message.warning('请输入水印文字');
        return;
      }
      // 确保颜色格式正确（带 # 前缀）
      const colorValue = fontColor.startsWith('#') ? fontColor : `#${fontColor}`;
      onProcess({
        textWatermark: {
          text: text.trim(),
          fontSize,
          color: colorValue,
          opacity,
          gravity: tile ? 'center' : position, // 平铺模式使用 center
          rotate: textRotate,
          tile,
          tileSpacingX,
          tileSpacingY,
        },
      });
    }
  };

  const positions = [
    { value: 'northwest', label: '左上' },
    { value: 'north', label: '上' },
    { value: 'northeast', label: '右上' },
    { value: 'west', label: '左' },
    { value: 'center', label: '中' },
    { value: 'east', label: '右' },
    { value: 'southwest', label: '左下' },
    { value: 'south', label: '下' },
    { value: 'southeast', label: '右下' },
  ];

  return (
    <div>
      <Card size="small" title="水印设置">
        <Row gutter={16}>
          <Col span={4}>
            <Text>水印类型</Text>
            <Radio.Group value={watermarkType} onChange={e => setWatermarkType(e.target.value)} style={{ marginTop: 4, display: 'block' }} size="small">
              <Radio.Button value="image">图片</Radio.Button>
              <Radio.Button value="text">文字</Radio.Button>
            </Radio.Group>
          </Col>
          {watermarkType === 'image' ? (
            <Col span={8}>
              <Text>水印图片</Text>
              <div style={{ marginTop: 4 }}>
                <Upload accept="image/*" showUploadList={false} beforeUpload={handleWatermarkUpload}>
                  <Button icon={<UploadOutlined />} size="small">{watermarkData ? '更换' : '上传'}</Button>
                </Upload>
                {watermarkData && (
                  <img src={base64ToDataUrl(watermarkData, 'png')} alt="水印" style={{ maxWidth: 60, maxHeight: 30, marginLeft: 8, verticalAlign: 'middle' }} />
                )}
              </div>
            </Col>
          ) : (
            <>
              <Col span={6}>
                <Text>水印文字</Text>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="支持多行"
                  style={{ width: '100%', marginTop: 4, padding: 4, border: '1px solid #d9d9d9', borderRadius: 4, minHeight: 40, resize: 'vertical', fontSize: 12 }}
                />
              </Col>
              <Col span={4}>
                <Text>字号: {fontSize}px</Text>
                <Slider value={fontSize} onChange={setFontSize} min={12} max={72} />
              </Col>
              <Col span={3}>
                <Text>颜色</Text>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} style={{ width: 30, height: 24, border: 'none', cursor: 'pointer' }} />
                  <Text type="secondary" style={{ fontSize: 10 }}>{fontColor}</Text>
                </div>
              </Col>
              <Col span={4}>
                <Text>透明度: {(opacity * 100).toFixed(0)}%</Text>
                <Slider value={opacity} onChange={setOpacity} min={0.1} max={1} step={0.1} />
              </Col>
              <Col span={3}>
                <Text>旋转: {textRotate}°</Text>
                <Slider value={textRotate} onChange={setTextRotate} min={-45} max={45} />
              </Col>
            </>
          )}
        </Row>
        <Row gutter={16} style={{ marginTop: 8 }}>
          <Col span={4}>
            <Switch checked={tile} onChange={setTile} size="small" /> 平铺
          </Col>
          {tile ? (
            <>
              <Col span={5}>
                <Text>水平间距: {tileSpacingX}px</Text>
                <Slider value={tileSpacingX} onChange={setTileSpacingX} min={50} max={300} />
              </Col>
              <Col span={5}>
                <Text>垂直间距: {tileSpacingY}px</Text>
                <Slider value={tileSpacingY} onChange={setTileSpacingY} min={50} max={200} />
              </Col>
            </>
          ) : (
            <Col span={6}>
              <Text>位置</Text>
              <Select value={position} onChange={setPosition} style={{ width: '100%', marginTop: 4 }} size="small">
                {positions.map(p => (<Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>))}
              </Select>
            </Col>
          )}
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={onReset} processing={processing} hasResult={!!result} />
      </Card>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};


// ============ 元数据工具 ============

const MetadataTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave } = props;

  const handleStripMetadata = () => {
    onProcess({ stripMetadata: true });
  };

  return (
    <div>
      <Row gutter={16}>
        <Col span={12}>
          <Card size="small" title="图片信息">
            {metadata ? (
              <Descriptions column={2} size="small">
                <Descriptions.Item label="尺寸">{metadata.width} x {metadata.height}</Descriptions.Item>
                <Descriptions.Item label="格式">{metadata.format.toUpperCase()}</Descriptions.Item>
                <Descriptions.Item label="色彩空间">{metadata.space}</Descriptions.Item>
                <Descriptions.Item label="通道数">{metadata.channels}</Descriptions.Item>
                <Descriptions.Item label="位深度">{metadata.depth}</Descriptions.Item>
                <Descriptions.Item label="透明通道">{metadata.hasAlpha ? '是' : '否'}</Descriptions.Item>
                <Descriptions.Item label="文件大小">{formatFileSize(metadata.size)}</Descriptions.Item>
                {metadata.density && <Descriptions.Item label="DPI">{metadata.density}</Descriptions.Item>}
              </Descriptions>
            ) : (
              <Text type="secondary">暂无元数据</Text>
            )}
            <div style={{ marginTop: 16 }}>
              <Button onClick={handleStripMetadata} loading={processing} size="small">移除所有元数据</Button>
              <Button onClick={onSave} icon={<DownloadOutlined />} style={{ marginLeft: 8 }} disabled={!result} size="small">保存</Button>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          {metadata?.exif && Object.keys(metadata.exif).length > 0 && (
            <Card size="small" title="EXIF 信息">
              <Descriptions column={1} size="small">
                {metadata.exif.Make && <Descriptions.Item label="相机品牌">{metadata.exif.Make}</Descriptions.Item>}
                {metadata.exif.Model && <Descriptions.Item label="相机型号">{metadata.exif.Model}</Descriptions.Item>}
                {metadata.exif.DateTimeOriginal && <Descriptions.Item label="拍摄时间">{metadata.exif.DateTimeOriginal}</Descriptions.Item>}
                {metadata.exif.ExposureTime && <Descriptions.Item label="曝光时间">{metadata.exif.ExposureTime}s</Descriptions.Item>}
                {metadata.exif.FNumber && <Descriptions.Item label="光圈">{metadata.exif.FNumber}</Descriptions.Item>}
                {metadata.exif.ISO && <Descriptions.Item label="ISO">{metadata.exif.ISO}</Descriptions.Item>}
              </Descriptions>
            </Card>
          )}
        </Col>
      </Row>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};


// ============ 压缩工具 ============

const CompressTool: React.FC<ToolProps> = (props) => {
  const { metadata, result, previewUrl, originalPreviewUrl, showComparison, onComparisonToggle, processing, onProcess, onSave, onReset } = props;
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp' | 'avif'>('jpeg');
  const [quality, setQuality] = useState(80);
  const [progressive, setProgressive] = useState(true);
  const [mozjpeg, setMozjpeg] = useState(false);
  const [lossless, setLossless] = useState(false);
  const [stripMeta, setStripMeta] = useState(true);

  const handleProcess = () => {
    const options: ProcessOptions = {
      format,
      quality,
      stripMetadata: stripMeta,
    };
    if (format === 'jpeg') {
      options.progressive = progressive;
      options.mozjpeg = mozjpeg;
    } else if (format === 'webp' || format === 'avif') {
      options.lossless = lossless;
    }
    onProcess(options);
  };

  return (
    <div>
      <Card size="small" title="压缩设置">
        <Row gutter={16} align="middle">
          <Col span={4}>
            <Text>输出格式</Text>
            <Select value={format} onChange={setFormat} style={{ width: '100%', marginTop: 4 }} size="small">
              <Select.Option value="jpeg">JPEG</Select.Option>
              <Select.Option value="png">PNG</Select.Option>
              <Select.Option value="webp">WebP</Select.Option>
              <Select.Option value="avif">AVIF</Select.Option>
            </Select>
          </Col>
          <Col span={6}>
            <Text>质量: {quality}</Text>
            <Slider value={quality} onChange={setQuality} min={1} max={100} />
          </Col>
          <Col span={6}>
            <Space direction="vertical">
              {format === 'jpeg' && (
                <>
                  <div><Switch checked={progressive} onChange={setProgressive} size="small" /> 渐进式</div>
                  <div><Switch checked={mozjpeg} onChange={setMozjpeg} size="small" /> MozJPEG</div>
                </>
              )}
              {(format === 'webp' || format === 'avif') && (
                <div><Switch checked={lossless} onChange={setLossless} size="small" /> 无损</div>
              )}
              <div><Switch checked={stripMeta} onChange={setStripMeta} size="small" /> 移除元数据</div>
            </Space>
          </Col>
          {result && metadata && (
            <Col span={8}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="原始">{formatFileSize(metadata.size)}</Descriptions.Item>
                <Descriptions.Item label="压缩后">{formatFileSize(result.info.size)}</Descriptions.Item>
                <Descriptions.Item label="压缩率">{calculateCompressionRatio(metadata.size, result.info.size)}</Descriptions.Item>
                <Descriptions.Item label="节省">{formatFileSize(metadata.size - result.info.size)}</Descriptions.Item>
              </Descriptions>
            </Col>
          )}
        </Row>
        <ActionButtons onProcess={handleProcess} onSave={onSave} onReset={onReset} processing={processing} hasResult={!!result} />
      </Card>
      <ImagePreview previewUrl={previewUrl} metadata={metadata} result={result} originalUrl={originalPreviewUrl} showComparison={showComparison} onComparisonToggle={onComparisonToggle} />
    </div>
  );
};

export default ImageToolPanel;

// 导出各个工具组件供 ToolboxPanel 使用
export {
  FormatConvertTool,
  ResizeTool,
  CropTool,
  RotateFlipTool,
  ColorAdjustTool,
  FiltersTool,
  WatermarkTool,
  MetadataTool,
  CompressTool,
  ImagePreview,
  ActionButtons,
  imageTools,
};

export type { ToolProps, ImageTool };
