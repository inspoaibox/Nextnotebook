import React, { useState } from 'react';
import { Layout, Menu, Card, Input, Button, Space, Typography, message, Tabs, Row, Col, Tooltip, Select, Checkbox, Tag, Upload, Slider } from 'antd';
import {
  FontSizeOutlined,
  CodeOutlined,
  SwapOutlined,
  ToolOutlined,
  CopyOutlined,
  ClearOutlined,
  FieldTimeOutlined,
  QrcodeOutlined,
  BgColorsOutlined,
  KeyOutlined,
  FileTextOutlined,
  NumberOutlined,
  LinkOutlined,
  LockOutlined,
  UnlockOutlined,
  SortAscendingOutlined,
  DiffOutlined,
  AppstoreOutlined,
  TranslationOutlined,
  PictureOutlined,
  ExpandOutlined,
  ScissorOutlined,
  RotateRightOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  CompressOutlined,
  OrderedListOutlined,
  DeleteOutlined,
  PlusOutlined,
  FilePdfOutlined,
  FileSearchOutlined,
  MergeCellsOutlined,
  FileImageOutlined,
  FontColorsOutlined,
  EditOutlined,
  FormOutlined,
  StarOutlined,
  InboxOutlined,
  SmileOutlined,
  DownloadOutlined,
  HeartOutlined,
  HeartFilled,
  SearchOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  CalculatorOutlined,
} from '@ant-design/icons';
// @ts-ignore
import openmojiData from 'openmoji/data/openmoji.json';
import { pinyin } from 'pinyin-pro';
import ImageToolPanel, {
  FormatConvertTool as ImageFormatConvertTool,
  ResizeTool as ImageResizeTool,
  CropTool as ImageCropTool,
  RotateFlipTool as ImageRotateFlipTool,
  ColorAdjustTool as ImageColorAdjustTool,
  FiltersTool as ImageFiltersTool,
  WatermarkTool as ImageWatermarkTool,
  MetadataTool as ImageMetadataTool,
  CompressTool as ImageCompressTool,
} from './ImageToolPanel';
import PDFToolPanel from './pdf/PDFToolPanel';

const { Content, Sider } = Layout;
const { TextArea } = Input;
const { Text, Title } = Typography;

// 工具分类
type ToolCategory = 'text' | 'code' | 'convert' | 'image' | 'pdf' | 'other';

// 分类图标
const categoryIcons: Record<ToolCategory, React.ReactNode> = {
  text: <FontSizeOutlined />,
  code: <CodeOutlined />,
  convert: <SwapOutlined />,
  image: <PictureOutlined />,
  pdf: <FilePdfOutlined />,
  other: <ToolOutlined />,
};

// 工具定义
interface Tool {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: ToolCategory;
}

const tools: Tool[] = [
  // 文字处理
  { id: 'word-count', name: '字数统计', icon: <NumberOutlined />, category: 'text' },
  { id: 'text-dedupe', name: '文本去重', icon: <DiffOutlined />, category: 'text' },
  { id: 'case-convert', name: '大小写转换', icon: <FontSizeOutlined />, category: 'text' },
  { id: 'text-sort', name: '文本排序', icon: <SortAscendingOutlined />, category: 'text' },
  { id: 'pinyin', name: '汉字转拼音', icon: <TranslationOutlined />, category: 'text' },
  { id: 'url-extract', name: 'URL提取', icon: <LinkOutlined />, category: 'text' },
  { id: 'text-merge-split', name: '合并拆分', icon: <SwapOutlined />, category: 'text' },
  { id: 'text-prefix-suffix', name: '前后缀处理', icon: <OrderedListOutlined />, category: 'text' },
  { id: 'text-compare', name: '文本对比', icon: <DiffOutlined />, category: 'text' },
  // 编程工具
  { id: 'json-format', name: 'JSON格式化', icon: <CodeOutlined />, category: 'code' },
  { id: 'base64', name: 'Base64编解码', icon: <LockOutlined />, category: 'code' },
  { id: 'url-encode', name: 'URL编解码', icon: <LinkOutlined />, category: 'code' },
  { id: 'timestamp', name: '时间戳转换', icon: <FieldTimeOutlined />, category: 'code' },
  { id: 'hash', name: 'Hash计算', icon: <KeyOutlined />, category: 'code' },
  { id: 'uuid', name: 'UUID生成', icon: <KeyOutlined />, category: 'code' },
  { id: 'html-editor', name: 'HTML编辑器', icon: <CodeOutlined />, category: 'code' },
  // 格式转换
  { id: 'md-html', name: 'MD/HTML互转', icon: <FileTextOutlined />, category: 'convert' },
  // 图片处理 - 9 个独立工具
  { id: 'image-format-convert', name: '格式转换', icon: <SwapOutlined />, category: 'image' },
  { id: 'image-resize', name: '尺寸调整', icon: <ExpandOutlined />, category: 'image' },
  { id: 'image-crop', name: '图片裁剪', icon: <ScissorOutlined />, category: 'image' },
  { id: 'image-rotate-flip', name: '旋转翻转', icon: <RotateRightOutlined />, category: 'image' },
  { id: 'image-color-adjust', name: '颜色处理', icon: <BgColorsOutlined />, category: 'image' },
  { id: 'image-filters', name: '滤镜效果', icon: <FilterOutlined />, category: 'image' },
  { id: 'image-watermark', name: '水印叠加', icon: <PictureOutlined />, category: 'image' },
  { id: 'image-metadata', name: '元数据', icon: <InfoCircleOutlined />, category: 'image' },
  { id: 'image-compress', name: '优化压缩', icon: <CompressOutlined />, category: 'image' },
  // PDF 工具 - 15 个独立工具
  { id: 'pdf-preview', name: 'PDF 预览', icon: <FileSearchOutlined />, category: 'pdf' },
  { id: 'pdf-merge-split', name: '合并拆分', icon: <MergeCellsOutlined />, category: 'pdf' },
  { id: 'pdf-to-image', name: '转图片', icon: <FileImageOutlined />, category: 'pdf' },
  { id: 'pdf-compress', name: '压缩', icon: <CompressOutlined />, category: 'pdf' },
  { id: 'pdf-watermark', name: '加水印', icon: <FontColorsOutlined />, category: 'pdf' },
  { id: 'pdf-rotate', name: '旋转调整', icon: <RotateRightOutlined />, category: 'pdf' },
  { id: 'pdf-reorder', name: '页面重排', icon: <SwapOutlined />, category: 'pdf' },
  { id: 'pdf-delete-pages', name: '页面删除', icon: <DeleteOutlined />, category: 'pdf' },
  { id: 'pdf-extract-pages', name: '页面提取', icon: <ScissorOutlined />, category: 'pdf' },
  { id: 'pdf-rename', name: '批量重命名', icon: <EditOutlined />, category: 'pdf' },
  { id: 'pdf-form-fill', name: '表单填写', icon: <FormOutlined />, category: 'pdf' },
  { id: 'pdf-security', name: '安全加密', icon: <LockOutlined />, category: 'pdf' },
  { id: 'pdf-metadata', name: '元数据', icon: <InfoCircleOutlined />, category: 'pdf' },
  { id: 'pdf-image-to-pdf', name: '图片转PDF', icon: <PictureOutlined />, category: 'pdf' },
  { id: 'pdf-compare', name: 'PDF 对比', icon: <DiffOutlined />, category: 'pdf' },
  // 其他工具
  { id: 'qrcode', name: '二维码生成', icon: <QrcodeOutlined />, category: 'other' },
  { id: 'color', name: '颜色转换', icon: <BgColorsOutlined />, category: 'other' },
  { id: 'emoji', name: 'Emoji表情', icon: <SmileOutlined />, category: 'other' },
  { id: 'batch-url', name: '网址批量打开', icon: <GlobalOutlined />, category: 'other' },
  { id: 'unit-convert', name: '单位换算', icon: <CalculatorOutlined />, category: 'other' },
];

const categoryNames: Record<ToolCategory, string> = {
  text: '文字处理',
  code: '编程工具',
  convert: '格式转换',
  image: '图片处理',
  pdf: 'PDF 工具',
  other: '其他工具',
};

const ToolboxPanel: React.FC = () => {
  const [selectedTool, setSelectedTool] = useState<string>('word-count');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
  };

  // 渲染工具内容
  const renderToolContent = () => {
    switch (selectedTool) {
      case 'word-count':
        return <WordCountTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'text-dedupe':
        return <TextDedupeTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'case-convert':
        return <CaseConvertTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'text-sort':
        return <TextSortTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'pinyin':
        return <PinyinTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'url-extract':
        return <UrlExtractTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'text-merge-split':
        return <TextMergeSplitTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'text-prefix-suffix':
        return <TextPrefixSuffixTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'text-compare':
        return <TextCompareTool />;
      case 'json-format':
        return <JsonFormatTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'base64':
        return <Base64Tool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'url-encode':
        return <UrlEncodeTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'timestamp':
        return <TimestampTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'hash':
        return <HashTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'uuid':
        return <UuidTool output={output} setOutput={setOutput} />;
      case 'qrcode':
        return <QrcodeTool input={input} setInput={setInput} />;
      case 'color':
        return <ColorTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'emoji':
        return <EmojiTool />;
      case 'batch-url':
        return <BatchUrlTool />;
      case 'unit-convert':
        return <UnitConvertTool />;
      case 'md-html':
        return <MdHtmlTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
      case 'html-editor':
        return <HtmlEditorTool />;
      case 'image-format-convert':
        return <ImageToolPanel defaultTool="format-convert" />;
      case 'image-resize':
        return <ImageToolPanel defaultTool="resize" />;
      case 'image-crop':
        return <ImageToolPanel defaultTool="crop" />;
      case 'image-rotate-flip':
        return <ImageToolPanel defaultTool="rotate-flip" />;
      case 'image-color-adjust':
        return <ImageToolPanel defaultTool="color-adjust" />;
      case 'image-filters':
        return <ImageToolPanel defaultTool="filters" />;
      case 'image-watermark':
        return <ImageToolPanel defaultTool="watermark" />;
      case 'image-metadata':
        return <ImageToolPanel defaultTool="metadata" />;
      case 'image-compress':
        return <ImageToolPanel defaultTool="compress" />;
      // PDF 工具
      case 'pdf-preview':
        return <PDFToolPanel defaultTool="preview" />;
      case 'pdf-merge-split':
        return <PDFToolPanel defaultTool="merge-split" />;
      case 'pdf-to-image':
        return <PDFToolPanel defaultTool="to-image" />;
      case 'pdf-compress':
        return <PDFToolPanel defaultTool="compress" />;
      case 'pdf-watermark':
        return <PDFToolPanel defaultTool="watermark" />;
      case 'pdf-rotate':
        return <PDFToolPanel defaultTool="rotate" />;
      case 'pdf-reorder':
        return <PDFToolPanel defaultTool="reorder" />;
      case 'pdf-delete-pages':
        return <PDFToolPanel defaultTool="delete-pages" />;
      case 'pdf-extract-pages':
        return <PDFToolPanel defaultTool="extract-pages" />;
      case 'pdf-rename':
        return <PDFToolPanel defaultTool="rename" />;
      case 'pdf-form-fill':
        return <PDFToolPanel defaultTool="form-fill" />;
      case 'pdf-security':
        return <PDFToolPanel defaultTool="security" />;
      case 'pdf-metadata':
        return <PDFToolPanel defaultTool="metadata" />;
      case 'pdf-image-to-pdf':
        return <PDFToolPanel defaultTool="image-to-pdf" />;
      case 'pdf-compare':
        return <PDFToolPanel defaultTool="compare" />;
      default:
        return <div>请选择工具</div>;
    }
  };

  const currentTool = tools.find(t => t.id === selectedTool);

  // 按分类组织菜单 - 使用 SubMenu 支持折叠
  const menuItems = Object.entries(categoryNames).map(([category, name]) => ({
    key: category,
    icon: categoryIcons[category as ToolCategory],
    label: name,
    children: tools
      .filter(t => t.category === category)
      .map(tool => ({
        key: tool.id,
        icon: tool.icon,
        label: tool.name,
      })),
  }));

  // 获取当前选中工具所属的分类
  const selectedCategory = currentTool?.category;

  return (
    <Layout style={{ height: '100%' }}>
      <Sider width={260} className="toolbox-sider" style={{ borderRight: '1px solid var(--border-color, #f0f0f0)' }}>
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color, #f0f0f0)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AppstoreOutlined style={{ fontSize: 16, color: '#1890ff' }} />
          <span style={{ fontWeight: 500 }}>工具箱</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedTool]}
          defaultOpenKeys={selectedCategory ? [selectedCategory] : ['text']}
          onClick={({ key }) => {
            // 只处理工具点击，不处理分类点击
            if (tools.find(t => t.id === key)) {
              setSelectedTool(key);
              setInput('');
              setOutput('');
            }
          }}
          items={menuItems}
          style={{ background: 'transparent', borderRight: 0, height: 'calc(100% - 49px)', overflow: 'auto' }}
        />
      </Sider>
      <Content style={{ padding: 16, overflow: 'auto' }}>
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            {currentTool?.icon} {currentTool?.name}
          </Title>
        </div>
        {renderToolContent()}
      </Content>
    </Layout>
  );
};

// 工具组件 Props
interface ToolProps {
  input: string;
  setInput: (v: string) => void;
  output: string;
  setOutput: (v: string) => void;
}

// 字数统计工具
const WordCountTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const analyze = () => {
    const text = input;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split('\n').length : 0;
    const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const english = (text.match(/[a-zA-Z]/g) || []).length;
    const numbers = (text.match(/[0-9]/g) || []).length;
    
    setOutput(`总字符数: ${chars}
字符数(不含空格): ${charsNoSpace}
单词数: ${words}
行数: ${lines}
中文字符: ${chinese}
英文字母: ${english}
数字: ${numbers}`);
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入文本</Text>
        <TextArea rows={12} value={input} onChange={e => setInput(e.target.value)} placeholder="请输入要统计的文本..." />
        <Button type="primary" onClick={analyze} style={{ marginTop: 8 }}>统计</Button>
      </Col>
      <Col span={12}>
        <Text strong>统计结果</Text>
        <TextArea rows={12} value={output} readOnly style={{ background: '#f5f5f5' }} />
      </Col>
    </Row>
  );
};


// 文本去重工具
const TextDedupeTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const dedupe = () => {
    const lines = input.split('\n');
    const unique = [...new Set(lines)];
    setOutput(unique.join('\n'));
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入文本（每行一个）</Text>
        <TextArea rows={12} value={input} onChange={e => setInput(e.target.value)} placeholder="每行一个，将去除重复行..." />
        <Button type="primary" onClick={dedupe} style={{ marginTop: 8 }}>去重</Button>
      </Col>
      <Col span={12}>
        <Text strong>去重结果</Text>
        <TextArea rows={12} value={output} readOnly style={{ background: '#f5f5f5' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};

// 大小写转换工具
const CaseConvertTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const convert = (type: 'upper' | 'lower' | 'capitalize' | 'camel' | 'snake') => {
    let result = input;
    switch (type) {
      case 'upper':
        result = input.toUpperCase();
        break;
      case 'lower':
        result = input.toLowerCase();
        break;
      case 'capitalize':
        result = input.replace(/\b\w/g, c => c.toUpperCase());
        break;
      case 'camel':
        result = input.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
        break;
      case 'snake':
        result = input.replace(/\s+/g, '_').toLowerCase();
        break;
    }
    setOutput(result);
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入文本</Text>
        <TextArea rows={10} value={input} onChange={e => setInput(e.target.value)} placeholder="请输入要转换的文本..." />
        <Space wrap style={{ marginTop: 8 }}>
          <Button onClick={() => convert('upper')}>全部大写</Button>
          <Button onClick={() => convert('lower')}>全部小写</Button>
          <Button onClick={() => convert('capitalize')}>首字母大写</Button>
          <Button onClick={() => convert('camel')}>驼峰命名</Button>
          <Button onClick={() => convert('snake')}>下划线命名</Button>
        </Space>
      </Col>
      <Col span={12}>
        <Text strong>转换结果</Text>
        <TextArea rows={10} value={output} readOnly style={{ background: '#f5f5f5' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};

// 文本排序工具
const TextSortTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const sort = (type: 'asc' | 'desc' | 'reverse' | 'shuffle') => {
    const lines = input.split('\n').filter(l => l.trim());
    let result: string[];
    switch (type) {
      case 'asc':
        result = [...lines].sort((a, b) => a.localeCompare(b, 'zh-CN'));
        break;
      case 'desc':
        result = [...lines].sort((a, b) => b.localeCompare(a, 'zh-CN'));
        break;
      case 'reverse':
        result = [...lines].reverse();
        break;
      case 'shuffle':
        result = [...lines].sort(() => Math.random() - 0.5);
        break;
      default:
        result = lines;
    }
    setOutput(result.join('\n'));
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入文本（每行一个）</Text>
        <TextArea rows={12} value={input} onChange={e => setInput(e.target.value)} placeholder="每行一个，将进行排序..." />
        <Space wrap style={{ marginTop: 8 }}>
          <Button onClick={() => sort('asc')}>升序</Button>
          <Button onClick={() => sort('desc')}>降序</Button>
          <Button onClick={() => sort('reverse')}>倒序</Button>
          <Button onClick={() => sort('shuffle')}>随机</Button>
        </Space>
      </Col>
      <Col span={12}>
        <Text strong>排序结果</Text>
        <TextArea rows={12} value={output} readOnly style={{ background: '#f5f5f5' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};

// JSON格式化工具
const JsonFormatTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const format = () => {
    try {
      const obj = JSON.parse(input);
      setOutput(JSON.stringify(obj, null, 2));
    } catch (e) {
      setOutput('JSON 格式错误: ' + (e as Error).message);
    }
  };

  const compress = () => {
    try {
      const obj = JSON.parse(input);
      setOutput(JSON.stringify(obj));
    } catch (e) {
      setOutput('JSON 格式错误: ' + (e as Error).message);
    }
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入 JSON</Text>
        <TextArea rows={14} value={input} onChange={e => setInput(e.target.value)} placeholder='{"key": "value"}' style={{ fontFamily: 'monospace' }} />
        <Space style={{ marginTop: 8 }}>
          <Button type="primary" onClick={format}>格式化</Button>
          <Button onClick={compress}>压缩</Button>
        </Space>
      </Col>
      <Col span={12}>
        <Text strong>结果</Text>
        <TextArea rows={14} value={output} readOnly style={{ background: '#f5f5f5', fontFamily: 'monospace' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};

// Base64 编解码工具
const Base64Tool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const encode = () => {
    try {
      setOutput(btoa(unescape(encodeURIComponent(input))));
    } catch (e) {
      setOutput('编码错误');
    }
  };

  const decode = () => {
    try {
      setOutput(decodeURIComponent(escape(atob(input))));
    } catch (e) {
      setOutput('解码错误: 无效的 Base64 字符串');
    }
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入</Text>
        <TextArea rows={10} value={input} onChange={e => setInput(e.target.value)} placeholder="输入要编码或解码的文本..." />
        <Space style={{ marginTop: 8 }}>
          <Button type="primary" onClick={encode} icon={<LockOutlined />}>编码</Button>
          <Button onClick={decode} icon={<UnlockOutlined />}>解码</Button>
        </Space>
      </Col>
      <Col span={12}>
        <Text strong>结果</Text>
        <TextArea rows={10} value={output} readOnly style={{ background: '#f5f5f5' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};

// URL 编解码工具
const UrlEncodeTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const encode = () => setOutput(encodeURIComponent(input));
  const decode = () => {
    try {
      setOutput(decodeURIComponent(input));
    } catch {
      setOutput('解码错误');
    }
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入</Text>
        <TextArea rows={10} value={input} onChange={e => setInput(e.target.value)} placeholder="输入 URL 或文本..." />
        <Space style={{ marginTop: 8 }}>
          <Button type="primary" onClick={encode}>编码</Button>
          <Button onClick={decode}>解码</Button>
        </Space>
      </Col>
      <Col span={12}>
        <Text strong>结果</Text>
        <TextArea rows={10} value={output} readOnly style={{ background: '#f5f5f5' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};


// 时间戳转换工具
const TimestampTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const [currentTs, setCurrentTs] = useState(Math.floor(Date.now() / 1000));

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const toDate = () => {
    const ts = parseInt(input);
    if (isNaN(ts)) {
      setOutput('请输入有效的时间戳');
      return;
    }
    // 自动判断秒/毫秒
    const date = ts > 9999999999 ? new Date(ts) : new Date(ts * 1000);
    setOutput(`本地时间: ${date.toLocaleString()}
UTC时间: ${date.toUTCString()}
ISO格式: ${date.toISOString()}`);
  };

  const toTimestamp = () => {
    const date = new Date(input);
    if (isNaN(date.getTime())) {
      setOutput('请输入有效的日期时间');
      return;
    }
    setOutput(`秒级时间戳: ${Math.floor(date.getTime() / 1000)}
毫秒级时间戳: ${date.getTime()}`);
  };

  const useNow = () => {
    setInput(currentTs.toString());
  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Text>当前时间戳: <Text strong copyable>{currentTs}</Text></Text>
        <Text style={{ marginLeft: 16 }}>({new Date(currentTs * 1000).toLocaleString()})</Text>
      </Card>
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>输入</Text>
          <TextArea rows={4} value={input} onChange={e => setInput(e.target.value)} placeholder="输入时间戳或日期时间..." />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" onClick={toDate}>时间戳 → 日期</Button>
            <Button onClick={toTimestamp}>日期 → 时间戳</Button>
            <Button onClick={useNow}>使用当前时间</Button>
          </Space>
        </Col>
        <Col span={12}>
          <Text strong>结果</Text>
          <TextArea rows={4} value={output} readOnly style={{ background: '#f5f5f5' }} />
        </Col>
      </Row>
    </div>
  );
};

// Hash 计算工具
const HashTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const calculate = async (algorithm: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest(algorithm, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    setOutput(hashHex);
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入文本</Text>
        <TextArea rows={8} value={input} onChange={e => setInput(e.target.value)} placeholder="输入要计算哈希的文本..." />
        <Space wrap style={{ marginTop: 8 }}>
          <Button onClick={() => calculate('SHA-1')}>SHA-1</Button>
          <Button type="primary" onClick={() => calculate('SHA-256')}>SHA-256</Button>
          <Button onClick={() => calculate('SHA-384')}>SHA-384</Button>
          <Button onClick={() => calculate('SHA-512')}>SHA-512</Button>
        </Space>
      </Col>
      <Col span={12}>
        <Text strong>哈希值</Text>
        <TextArea rows={8} value={output} readOnly style={{ background: '#f5f5f5', fontFamily: 'monospace', wordBreak: 'break-all' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};

// UUID 生成工具
const UuidTool: React.FC<{ output: string; setOutput: (v: string) => void }> = ({ output, setOutput }) => {
  const [count, setCount] = useState(1);
  const [format, setFormat] = useState<'standard' | 'no-dash' | 'upper'>('standard');

  const generate = () => {
    const uuids: string[] = [];
    for (let i = 0; i < count; i++) {
      let uuid: string = crypto.randomUUID();
      if (format === 'no-dash') uuid = uuid.replace(/-/g, '');
      if (format === 'upper') uuid = uuid.toUpperCase();
      uuids.push(uuid);
    }
    setOutput(uuids.join('\n'));
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Text>生成数量:</Text>
        <Input type="number" value={count} onChange={e => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))} style={{ width: 80 }} min={1} max={100} />
        <Text>格式:</Text>
        <Select value={format} onChange={setFormat} style={{ width: 120 }}>
          <Select.Option value="standard">标准格式</Select.Option>
          <Select.Option value="no-dash">无连字符</Select.Option>
          <Select.Option value="upper">大写</Select.Option>
        </Select>
        <Button type="primary" onClick={generate}>生成</Button>
      </Space>
      <TextArea rows={12} value={output} readOnly style={{ background: '#f5f5f5', fontFamily: 'monospace' }} />
      <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
    </div>
  );
};

// 二维码生成工具 - 使用 qrcode.react 库
const QrcodeTool: React.FC<{ input: string; setInput: (v: string) => void }> = ({ input, setInput }) => {
  // 基础设置
  const [size, setSize] = useState(256);
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [marginSize, setMarginSize] = useState(2);
  
  // 内容类型
  const [contentType, setContentType] = useState<'text' | 'url' | 'wifi' | 'vcard' | 'email' | 'phone' | 'sms'>('text');
  
  // WiFi 设置
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiEncryption, setWifiEncryption] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [wifiHidden, setWifiHidden] = useState(false);
  
  // vCard 设置
  const [vcardName, setVcardName] = useState('');
  const [vcardPhone, setVcardPhone] = useState('');
  const [vcardEmail, setVcardEmail] = useState('');
  const [vcardOrg, setVcardOrg] = useState('');
  const [vcardTitle, setVcardTitle] = useState('');
  const [vcardAddress, setVcardAddress] = useState('');
  const [vcardWebsite, setVcardWebsite] = useState('');
  
  // Email 设置
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  
  // SMS 设置
  const [smsPhone, setSmsPhone] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  
  // Logo 设置
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoSize, setLogoSize] = useState(50);
  
  // 引用 canvas/svg 用于下载
  const qrRef = React.useRef<HTMLDivElement>(null);

  // 生成二维码内容
  const getQRValue = (): string => {
    switch (contentType) {
      case 'url':
        return input.startsWith('http') ? input : `https://${input}`;
      case 'wifi':
        // WiFi 格式: WIFI:T:WPA;S:mynetwork;P:mypass;H:true;;
        return `WIFI:T:${wifiEncryption};S:${wifiSSID};P:${wifiPassword};H:${wifiHidden};;`;
      case 'vcard':
        // vCard 3.0 格式
        const vcard = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          vcardName ? `FN:${vcardName}` : '',
          vcardName ? `N:${vcardName.split(' ').reverse().join(';')};;;` : '',
          vcardPhone ? `TEL:${vcardPhone}` : '',
          vcardEmail ? `EMAIL:${vcardEmail}` : '',
          vcardOrg ? `ORG:${vcardOrg}` : '',
          vcardTitle ? `TITLE:${vcardTitle}` : '',
          vcardAddress ? `ADR:;;${vcardAddress};;;;` : '',
          vcardWebsite ? `URL:${vcardWebsite}` : '',
          'END:VCARD',
        ].filter(Boolean).join('\n');
        return vcard;
      case 'email':
        // mailto 格式
        const params = [];
        if (emailSubject) params.push(`subject=${encodeURIComponent(emailSubject)}`);
        if (emailBody) params.push(`body=${encodeURIComponent(emailBody)}`);
        return `mailto:${emailTo}${params.length ? '?' + params.join('&') : ''}`;
      case 'phone':
        return `tel:${input}`;
      case 'sms':
        return `sms:${smsPhone}${smsMessage ? `?body=${encodeURIComponent(smsMessage)}` : ''}`;
      default:
        return input;
    }
  };

  const qrValue = getQRValue();
  const hasContent = qrValue.trim().length > 0;

  // 下载二维码
  const downloadQR = (format: 'png' | 'svg') => {
    if (!qrRef.current) return;
    
    if (format === 'svg') {
      const svg = qrRef.current.querySelector('svg');
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'qrcode.svg';
        a.click();
        URL.revokeObjectURL(url);
        message.success('SVG 已下载');
      }
    } else {
      const svg = qrRef.current.querySelector('svg');
      if (svg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgData = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        img.onload = () => {
          canvas.width = size;
          canvas.height = size;
          ctx?.drawImage(img, 0, 0);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = 'qrcode.png';
          a.click();
          message.success('PNG 已下载');
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      }
    }
  };

  // 复制到剪贴板
  const copyQR = async () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (svg) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = async () => {
        canvas.width = size;
        canvas.height = size;
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
              message.success('已复制到剪贴板');
            } catch {
              message.error('复制失败');
            }
          }
        });
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }
  };

  // 渲染内容输入区域
  const renderContentInput = () => {
    switch (contentType) {
      case 'wifi':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input placeholder="WiFi 名称 (SSID)" value={wifiSSID} onChange={e => setWifiSSID(e.target.value)} />
            <Input.Password placeholder="WiFi 密码" value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} />
            <Space>
              <span>加密方式:</span>
              <Select value={wifiEncryption} onChange={setWifiEncryption} style={{ width: 100 }}>
                <Select.Option value="WPA">WPA/WPA2</Select.Option>
                <Select.Option value="WEP">WEP</Select.Option>
                <Select.Option value="nopass">无密码</Select.Option>
              </Select>
              <Checkbox checked={wifiHidden} onChange={e => setWifiHidden(e.target.checked)}>隐藏网络</Checkbox>
            </Space>
          </Space>
        );
      case 'vcard':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input placeholder="姓名" value={vcardName} onChange={e => setVcardName(e.target.value)} />
            <Input placeholder="电话" value={vcardPhone} onChange={e => setVcardPhone(e.target.value)} />
            <Input placeholder="邮箱" value={vcardEmail} onChange={e => setVcardEmail(e.target.value)} />
            <Input placeholder="公司" value={vcardOrg} onChange={e => setVcardOrg(e.target.value)} />
            <Input placeholder="职位" value={vcardTitle} onChange={e => setVcardTitle(e.target.value)} />
            <Input placeholder="地址" value={vcardAddress} onChange={e => setVcardAddress(e.target.value)} />
            <Input placeholder="网站" value={vcardWebsite} onChange={e => setVcardWebsite(e.target.value)} />
          </Space>
        );
      case 'email':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input placeholder="收件人邮箱" value={emailTo} onChange={e => setEmailTo(e.target.value)} />
            <Input placeholder="主题" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
            <TextArea rows={3} placeholder="邮件内容" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
          </Space>
        );
      case 'sms':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input placeholder="手机号码" value={smsPhone} onChange={e => setSmsPhone(e.target.value)} />
            <TextArea rows={3} placeholder="短信内容" value={smsMessage} onChange={e => setSmsMessage(e.target.value)} />
          </Space>
        );
      default:
        return (
          <TextArea 
            rows={4} 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder={contentType === 'url' ? '输入网址...' : contentType === 'phone' ? '输入电话号码...' : '输入文本内容...'} 
          />
        );
    }
  };

  // 动态导入 QRCodeSVG
  const [QRCodeSVG, setQRCodeSVG] = useState<any>(null);
  React.useEffect(() => {
    import('qrcode.react').then(mod => {
      setQRCodeSVG(() => mod.QRCodeSVG);
    });
  }, []);

  return (
    <Row gutter={16}>
      {/* 左侧配置区域 */}
      <Col span={12}>
        <Card size="small" title="内容类型" style={{ marginBottom: 12 }}>
          <Select value={contentType} onChange={setContentType} style={{ width: '100%' }}>
            <Select.Option value="text">纯文本</Select.Option>
            <Select.Option value="url">网址链接</Select.Option>
            <Select.Option value="wifi">WiFi 连接</Select.Option>
            <Select.Option value="vcard">电子名片</Select.Option>
            <Select.Option value="email">电子邮件</Select.Option>
            <Select.Option value="phone">电话号码</Select.Option>
            <Select.Option value="sms">短信</Select.Option>
          </Select>
        </Card>

        <Card size="small" title="内容" style={{ marginBottom: 12 }}>
          {renderContentInput()}
        </Card>

        <Card size="small" title="样式设置" style={{ marginBottom: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 60 }}>尺寸:</span>
              <Select value={size} onChange={setSize} style={{ width: 100 }}>
                <Select.Option value={128}>128px</Select.Option>
                <Select.Option value={200}>200px</Select.Option>
                <Select.Option value={256}>256px</Select.Option>
                <Select.Option value={300}>300px</Select.Option>
                <Select.Option value={400}>400px</Select.Option>
                <Select.Option value={512}>512px</Select.Option>
              </Select>
              <span style={{ width: 60 }}>容错:</span>
              <Tooltip title="L=7%, M=15%, Q=25%, H=30%">
                <Select value={level} onChange={setLevel} style={{ width: 80 }}>
                  <Select.Option value="L">L (7%)</Select.Option>
                  <Select.Option value="M">M (15%)</Select.Option>
                  <Select.Option value="Q">Q (25%)</Select.Option>
                  <Select.Option value="H">H (30%)</Select.Option>
                </Select>
              </Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 60 }}>前景色:</span>
              <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} style={{ width: 40, height: 28, cursor: 'pointer' }} />
              <Input value={fgColor} onChange={e => setFgColor(e.target.value)} style={{ width: 90 }} />
              <span style={{ width: 60 }}>背景色:</span>
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 40, height: 28, cursor: 'pointer' }} />
              <Input value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 90 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 60 }}>边距:</span>
              <Select value={marginSize} onChange={setMarginSize} style={{ width: 100 }}>
                <Select.Option value={0}>无边距</Select.Option>
                <Select.Option value={1}>1 模块</Select.Option>
                <Select.Option value={2}>2 模块</Select.Option>
                <Select.Option value={4}>4 模块</Select.Option>
              </Select>
            </div>
          </Space>
        </Card>

        <Card size="small" title="Logo 设置">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Checkbox checked={logoEnabled} onChange={e => setLogoEnabled(e.target.checked)}>
              添加 Logo
            </Checkbox>
            {logoEnabled && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setLogoUrl(ev.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                  >
                    选择图片
                  </Button>
                  {logoUrl && (
                    <Button type="text" danger onClick={() => setLogoUrl('')}>
                      清除
                    </Button>
                  )}
                </div>
                {logoUrl && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    padding: 8,
                    background: '#f5f5f5',
                    borderRadius: 4,
                  }}>
                    <img 
                      src={logoUrl} 
                      alt="Logo 预览" 
                      style={{ 
                        width: 40, 
                        height: 40, 
                        objectFit: 'contain',
                        borderRadius: 4,
                      }} 
                    />
                    <span style={{ fontSize: 12, color: '#888' }}>Logo 已选择</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Logo 尺寸:</span>
                  <Select value={logoSize} onChange={setLogoSize} style={{ width: 100 }}>
                    <Select.Option value={30}>30px</Select.Option>
                    <Select.Option value={40}>40px</Select.Option>
                    <Select.Option value={50}>50px</Select.Option>
                    <Select.Option value={60}>60px</Select.Option>
                    <Select.Option value={80}>80px</Select.Option>
                  </Select>
                </div>
              </>
            )}
          </Space>
        </Card>
      </Col>

      {/* 右侧预览区域 */}
      <Col span={12}>
        <Card size="small" title="二维码预览">
          <div 
            ref={qrRef}
            style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              padding: 16, 
              background: bgColor, 
              borderRadius: 8,
              minHeight: 280,
            }}
          >
            {hasContent && QRCodeSVG ? (
              <QRCodeSVG
                value={qrValue}
                size={size}
                level={level}
                fgColor={fgColor}
                bgColor={bgColor}
                marginSize={marginSize}
                imageSettings={logoEnabled && logoUrl ? {
                  src: logoUrl,
                  height: logoSize,
                  width: logoSize,
                  excavate: true,
                } : undefined}
              />
            ) : (
              <Text type="secondary">请输入内容生成二维码</Text>
            )}
          </div>
          
          {hasContent && (
            <Space style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}>
              <Button icon={<CopyOutlined />} onClick={copyQR}>复制</Button>
              <Button onClick={() => downloadQR('png')}>下载 PNG</Button>
              <Button onClick={() => downloadQR('svg')}>下载 SVG</Button>
            </Space>
          )}
        </Card>

        {hasContent && (
          <Card size="small" title="二维码内容" style={{ marginTop: 12 }}>
            <TextArea 
              rows={4} 
              value={qrValue} 
              readOnly 
              style={{ background: '#f5f5f5', fontFamily: 'monospace', fontSize: 12 }} 
            />
          </Card>
        )}
      </Col>
    </Row>
  );
};

// 颜色转换工具 - 增强版
const ColorTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const [color, setColor] = useState('#1890ff');
  const [activeTab, setActiveTab] = useState<'picker' | 'image' | 'palette' | 'gradient' | 'contrast'>('picker');
  const [savedColors, setSavedColors] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('savedColors') || '[]');
    } catch { return []; }
  });
  const [imageUrl, setImageUrl] = useState<string>('');
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [gradientColors, setGradientColors] = useState<string[]>(['#1890ff', '#52c41a']);
  const [gradientAngle, setGradientAngle] = useState(90);
  const [contrastBg, setContrastBg] = useState('#ffffff');
  const [contrastFg, setContrastFg] = useState('#000000');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);

  // 颜色转换函数
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  };

  const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const rgbToHsv = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
  };

  const rgbToCmyk = (r: number, g: number, b: number) => {
    const c = 1 - r / 255, m = 1 - g / 255, y = 1 - b / 255;
    const k = Math.min(c, m, y);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((c - k) / (1 - k)) * 100),
      m: Math.round(((m - k) / (1 - k)) * 100),
      y: Math.round(((y - k) / (1 - k)) * 100),
      k: Math.round(k * 100)
    };
  };

  // 计算对比度
  const getLuminance = (r: number, g: number, b: number) => {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const getContrastRatio = (color1: string, color2: string) => {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return 0;
    const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  // 生成颜色信息
  const getColorInfo = (hex: string) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
    return { hex, rgb, hsl, hsv, cmyk };
  };

  // 屏幕取色
  const pickFromScreen = async () => {
    try {
      if ('EyeDropper' in window) {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        setColor(result.sRGBHex);
        message.success('取色成功');
      } else {
        message.warning('当前浏览器不支持屏幕取色功能');
      }
    } catch (e) {
      // 用户取消
    }
  };

  // 图片取色
  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target?.result as string;
      setImageUrl(url);
      
      // 提取主色调
      try {
        const { extractColors } = await import('extract-colors');
        const colors = await extractColors(url, { pixels: 10000, distance: 0.2, saturationDistance: 0.2 });
        setExtractedColors(colors.slice(0, 8).map(c => c.hex));
      } catch (err) {
        console.error('提取颜色失败:', err);
      }
    };
    reader.readAsDataURL(file);
    return false;
  };

  // 图片点击取色
  const handleImageClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const pixel = ctx.getImageData(x * scaleX, y * scaleY, 1, 1).data;
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
    setColor(hex);
    message.success(`已选取颜色: ${hex}`);
  };

  // 绘制图片到 canvas
  React.useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // 保存颜色
  const saveColor = (c: string) => {
    if (!savedColors.includes(c)) {
      const newColors = [...savedColors, c];
      setSavedColors(newColors);
      localStorage.setItem('savedColors', JSON.stringify(newColors));
      message.success('颜色已保存');
    }
  };

  // 删除保存的颜色
  const removeColor = (c: string) => {
    const newColors = savedColors.filter(sc => sc !== c);
    setSavedColors(newColors);
    localStorage.setItem('savedColors', JSON.stringify(newColors));
  };

  // 复制颜色
  const copyColor = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  const colorInfo = getColorInfo(color);
  const contrastRatio = getContrastRatio(contrastFg, contrastBg);

  // 预设调色板
  const presetPalettes = {
    'Material': ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'],
    'Ant Design': ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#1da57a'],
    'Tailwind': ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'],
  };

  return (
    <div style={{ height: 'calc(100vh - 180px)', overflow: 'auto' }}>
      <Tabs activeKey={activeTab} onChange={(k) => setActiveTab(k as any)} items={[
        { key: 'picker', label: '颜色选择' },
        { key: 'image', label: '图片取色' },
        { key: 'palette', label: '调色板' },
        { key: 'gradient', label: '渐变生成' },
        { key: 'contrast', label: '对比度检查' },
      ]} />

      {activeTab === 'picker' && (
        <Row gutter={24}>
          <Col span={12}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>颜色选择器</Text>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <input 
                    type="color" 
                    value={color} 
                    onChange={e => setColor(e.target.value)} 
                    style={{ width: 80, height: 80, cursor: 'pointer', border: 'none', borderRadius: 8 }} 
                  />
                  <div>
                    <Input 
                      value={color} 
                      onChange={e => setColor(e.target.value)} 
                      style={{ width: 120, marginBottom: 8 }} 
                      placeholder="#RRGGBB"
                    />
                    <Space>
                      <Button icon={<BgColorsOutlined />} onClick={pickFromScreen} size="small">屏幕取色</Button>
                      <Button icon={<StarOutlined />} onClick={() => saveColor(color)} size="small">收藏</Button>
                    </Space>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ width: '100%', height: 60, background: color, borderRadius: 8, marginBottom: 16, border: '1px solid #d9d9d9' }} />
            
            {savedColors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>收藏的颜色</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {savedColors.map(c => (
                    <Tooltip key={c} title={c}>
                      <div 
                        onClick={() => setColor(c)}
                        style={{ 
                          width: 32, height: 32, background: c, borderRadius: 4, cursor: 'pointer',
                          border: color === c ? '2px solid #1890ff' : '1px solid #d9d9d9',
                          position: 'relative'
                        }}
                      >
                        <span 
                          onClick={(e) => { e.stopPropagation(); removeColor(c); }}
                          style={{ position: 'absolute', top: -6, right: -6, fontSize: 12, color: '#ff4d4f', cursor: 'pointer' }}
                        >×</span>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </Col>
          
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>颜色值</Text>
            {colorInfo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'HEX', value: colorInfo.hex.toUpperCase() },
                  { label: 'RGB', value: `rgb(${colorInfo.rgb.r}, ${colorInfo.rgb.g}, ${colorInfo.rgb.b})` },
                  { label: 'RGBA', value: `rgba(${colorInfo.rgb.r}, ${colorInfo.rgb.g}, ${colorInfo.rgb.b}, 1)` },
                  { label: 'HSL', value: `hsl(${colorInfo.hsl.h}, ${colorInfo.hsl.s}%, ${colorInfo.hsl.l}%)` },
                  { label: 'HSV', value: `hsv(${colorInfo.hsv.h}, ${colorInfo.hsv.s}%, ${colorInfo.hsv.v}%)` },
                  { label: 'CMYK', value: `cmyk(${colorInfo.cmyk.c}%, ${colorInfo.cmyk.m}%, ${colorInfo.cmyk.y}%, ${colorInfo.cmyk.k}%)` },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag style={{ width: 50, textAlign: 'center' }}>{item.label}</Tag>
                    <Input value={item.value} readOnly style={{ flex: 1, fontFamily: 'monospace' }} />
                    <Button icon={<CopyOutlined />} size="small" onClick={() => copyColor(item.value)} />
                  </div>
                ))}
              </div>
            )}
          </Col>
        </Row>
      )}

      {activeTab === 'image' && (
        <div>
          <Upload.Dragger
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleImageUpload}
            style={{ marginBottom: 16 }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p>点击或拖拽图片到此处</p>
          </Upload.Dragger>
          
          {imageUrl && (
            <>
              <div style={{ marginBottom: 16 }}>
                <Text strong>点击图片取色</Text>
                <canvas 
                  ref={canvasRef}
                  onClick={handleImageClick}
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: 400, 
                    cursor: 'crosshair',
                    display: 'block',
                    marginTop: 8,
                    border: '1px solid #d9d9d9',
                    borderRadius: 8
                  }} 
                />
              </div>
              
              {extractedColors.length > 0 && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>提取的主色调</Text>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {extractedColors.map((c, i) => (
                      <Tooltip key={i} title={c}>
                        <div 
                          onClick={() => { setColor(c); copyColor(c); }}
                          style={{ 
                            width: 48, height: 48, background: c, borderRadius: 8, cursor: 'pointer',
                            border: '1px solid #d9d9d9', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            paddingBottom: 4
                          }}
                        >
                          <span style={{ fontSize: 10, color: (() => { const rgb = hexToRgb(c); return rgb ? getLuminance(rgb.r, rgb.g, rgb.b) > 0.5 ? '#000' : '#fff' : '#000'; })() }}>
                            {c.slice(1, 4)}
                          </span>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          
          <div style={{ marginTop: 16, padding: 16, background: color, borderRadius: 8, textAlign: 'center' }}>
            <Text style={{ color: (() => { const rgb = hexToRgb(color); return rgb ? getLuminance(rgb.r, rgb.g, rgb.b) > 0.5 ? '#000' : '#fff' : '#000'; })() }}>
              当前颜色: {color}
            </Text>
          </div>
        </div>
      )}

      {activeTab === 'palette' && (
        <div>
          {Object.entries(presetPalettes).map(([name, colors]) => (
            <div key={name} style={{ marginBottom: 24 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>{name}</Text>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {colors.map((c, i) => (
                  <Tooltip key={i} title={c}>
                    <div 
                      onClick={() => { setColor(c); copyColor(c); }}
                      style={{ 
                        width: 40, height: 40, background: c, borderRadius: 4, cursor: 'pointer',
                        border: color === c ? '2px solid #000' : 'none'
                      }}
                    />
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'gradient' && (
        <div>
          <Row gutter={16}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>渐变颜色</Text>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {gradientColors.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="color" value={c} onChange={e => {
                      const newColors = [...gradientColors];
                      newColors[i] = e.target.value;
                      setGradientColors(newColors);
                    }} style={{ width: 40, height: 40, cursor: 'pointer' }} />
                    {gradientColors.length > 2 && (
                      <Button size="small" danger onClick={() => setGradientColors(gradientColors.filter((_, idx) => idx !== i))}>×</Button>
                    )}
                  </div>
                ))}
                <Button onClick={() => setGradientColors([...gradientColors, '#888888'])}>+</Button>
              </div>
              
              <Text strong style={{ display: 'block', marginBottom: 8 }}>角度: {gradientAngle}°</Text>
              <Slider value={gradientAngle} onChange={setGradientAngle} min={0} max={360} />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>预览</Text>
              <div style={{ 
                height: 150, 
                borderRadius: 8,
                background: `linear-gradient(${gradientAngle}deg, ${gradientColors.join(', ')})`,
                marginBottom: 16
              }} />
              
              <Text strong style={{ display: 'block', marginBottom: 8 }}>CSS 代码</Text>
              <Input.TextArea 
                value={`background: linear-gradient(${gradientAngle}deg, ${gradientColors.join(', ')});`}
                readOnly
                rows={2}
                style={{ fontFamily: 'monospace' }}
              />
              <Button 
                icon={<CopyOutlined />} 
                onClick={() => copyColor(`linear-gradient(${gradientAngle}deg, ${gradientColors.join(', ')})`)}
                style={{ marginTop: 8 }}
              >
                复制
              </Button>
            </Col>
          </Row>
        </div>
      )}

      {activeTab === 'contrast' && (
        <div>
          <Row gutter={24}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>前景色（文字）</Text>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input type="color" value={contrastFg} onChange={e => setContrastFg(e.target.value)} style={{ width: 60, height: 40 }} />
                <Input value={contrastFg} onChange={e => setContrastFg(e.target.value)} style={{ width: 100 }} />
              </div>
              
              <Text strong style={{ display: 'block', marginBottom: 8 }}>背景色</Text>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input type="color" value={contrastBg} onChange={e => setContrastBg(e.target.value)} style={{ width: 60, height: 40 }} />
                <Input value={contrastBg} onChange={e => setContrastBg(e.target.value)} style={{ width: 100 }} />
              </div>
              <Button onClick={() => { const t = contrastFg; setContrastFg(contrastBg); setContrastBg(t); }}>交换颜色</Button>
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>预览</Text>
              <div style={{ 
                padding: 24, 
                background: contrastBg, 
                borderRadius: 8,
                marginBottom: 16
              }}>
                <div style={{ color: contrastFg, fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>大标题文字</div>
                <div style={{ color: contrastFg, fontSize: 16, marginBottom: 8 }}>正文内容示例</div>
                <div style={{ color: contrastFg, fontSize: 12 }}>小字说明文字</div>
              </div>
              
              <div style={{ 
                padding: 16, 
                background: contrastRatio >= 7 ? '#f6ffed' : contrastRatio >= 4.5 ? '#fffbe6' : '#fff2f0',
                borderRadius: 8,
                border: `1px solid ${contrastRatio >= 7 ? '#b7eb8f' : contrastRatio >= 4.5 ? '#ffe58f' : '#ffccc7'}`
              }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
                  对比度: {contrastRatio.toFixed(2)}:1
                </div>
                <div>
                  <Tag color={contrastRatio >= 4.5 ? 'success' : 'error'}>AA 普通文字 {contrastRatio >= 4.5 ? '✓' : '✗'}</Tag>
                  <Tag color={contrastRatio >= 3 ? 'success' : 'error'}>AA 大文字 {contrastRatio >= 3 ? '✓' : '✗'}</Tag>
                  <Tag color={contrastRatio >= 7 ? 'success' : 'error'}>AAA 普通文字 {contrastRatio >= 7 ? '✓' : '✗'}</Tag>
                  <Tag color={contrastRatio >= 4.5 ? 'success' : 'error'}>AAA 大文字 {contrastRatio >= 4.5 ? '✓' : '✗'}</Tag>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
};

// 汉字转拼音工具
const PinyinTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const [toneType, setToneType] = useState<'symbol' | 'num' | 'none'>('none');
  const [separator, setSeparator] = useState(' ');
  const [showMultiple, setShowMultiple] = useState(false);
  const [outputFormat, setOutputFormat] = useState<'pinyin' | 'initial' | 'final' | 'first'>('pinyin');

  const convert = () => {
    if (!input.trim()) {
      setOutput('');
      return;
    }

    try {
      let result = '';
      
      switch (outputFormat) {
        case 'pinyin':
          // 完整拼音
          result = pinyin(input, {
            toneType,
            separator,
            multiple: showMultiple,
            type: 'string',
          });
          break;
        case 'initial':
          // 声母
          result = pinyin(input, {
            pattern: 'initial',
            separator,
            type: 'string',
          });
          break;
        case 'final':
          // 韵母
          result = pinyin(input, {
            pattern: 'final',
            toneType,
            separator,
            type: 'string',
          });
          break;
        case 'first':
          // 首字母
          result = pinyin(input, {
            pattern: 'first',
            separator: '',
            type: 'string',
          });
          break;
      }
      
      setOutput(result);
    } catch (e) {
      setOutput('转换出错: ' + (e as Error).message);
    }
  };

  // 批量转换多种格式
  const convertAll = () => {
    if (!input.trim()) {
      setOutput('');
      return;
    }

    try {
      const results = [
        `带声调: ${pinyin(input, { toneType: 'symbol', separator: ' ', type: 'string' })}`,
        `数字声调: ${pinyin(input, { toneType: 'num', separator: ' ', type: 'string' })}`,
        `无声调: ${pinyin(input, { toneType: 'none', separator: ' ', type: 'string' })}`,
        `首字母: ${pinyin(input, { pattern: 'first', separator: '', type: 'string' })}`,
        `首字母(大写): ${pinyin(input, { pattern: 'first', separator: '', type: 'string' }).toUpperCase()}`,
        `声母: ${pinyin(input, { pattern: 'initial', separator: ' ', type: 'string' })}`,
        `韵母: ${pinyin(input, { pattern: 'final', toneType: 'symbol', separator: ' ', type: 'string' })}`,
        `无分隔: ${pinyin(input, { toneType: 'none', separator: '', type: 'string' })}`,
      ];
      setOutput(results.join('\n'));
    } catch (e) {
      setOutput('转换出错: ' + (e as Error).message);
    }
  };

  return (
    <div>
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>输入汉字</Text>
          <TextArea 
            rows={6} 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="请输入要转换的汉字文本..." 
          />
          <div style={{ marginTop: 12 }}>
            <Space wrap>
              <span>输出格式:</span>
              <Select 
                value={outputFormat} 
                onChange={setOutputFormat} 
                style={{ width: 100 }}
                options={[
                  { value: 'pinyin', label: '完整拼音' },
                  { value: 'initial', label: '声母' },
                  { value: 'final', label: '韵母' },
                  { value: 'first', label: '首字母' },
                ]}
              />
              <span>声调:</span>
              <Select 
                value={toneType} 
                onChange={setToneType} 
                style={{ width: 100 }}
                disabled={outputFormat === 'initial' || outputFormat === 'first'}
                options={[
                  { value: 'symbol', label: '符号' },
                  { value: 'num', label: '数字' },
                  { value: 'none', label: '无' },
                ]}
              />
            </Space>
          </div>
          <div style={{ marginTop: 8 }}>
            <Space wrap>
              <span>分隔符:</span>
              <Select 
                value={separator} 
                onChange={setSeparator} 
                style={{ width: 80 }}
                options={[
                  { value: ' ', label: '空格' },
                  { value: '-', label: '连字符' },
                  { value: '', label: '无' },
                  { value: ',', label: '逗号' },
                ]}
              />
              <Checkbox checked={showMultiple} onChange={e => setShowMultiple(e.target.checked)}>
                显示多音字
              </Checkbox>
            </Space>
          </div>
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" onClick={convert}>转换</Button>
            <Button onClick={convertAll}>全部格式</Button>
          </Space>
        </Col>
        <Col span={12}>
          <Text strong>拼音结果</Text>
          <TextArea 
            rows={10} 
            value={output} 
            readOnly 
            style={{ background: '#f5f5f5' }} 
          />
          <Button 
            onClick={() => navigator.clipboard.writeText(output)} 
            style={{ marginTop: 8 }} 
            icon={<CopyOutlined />}
          >
            复制
          </Button>
        </Col>
      </Row>
    </div>
  );
};

// 文本合并拆分工具
const TextMergeSplitTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  // 模式：合并或拆分
  const [mode, setMode] = useState<'merge' | 'split'>('merge');
  
  // 合并设置
  const [mergeDelimiter, setMergeDelimiter] = useState(',');
  const [mergeCustom, setMergeCustom] = useState('');
  const [trimLines, setTrimLines] = useState(true);
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [addQuotes, setAddQuotes] = useState(false);
  const [quoteChar, setQuoteChar] = useState('"');
  
  // 拆分设置
  const [splitType, setSplitType] = useState<'delimiter' | 'regex' | 'length' | 'count'>('delimiter');
  const [splitDelimiter, setSplitDelimiter] = useState(',');
  const [splitCustom, setSplitCustom] = useState('');
  const [splitRegex, setSplitRegex] = useState('');
  const [splitLength, setSplitLength] = useState(10);
  const [splitCount, setSplitCount] = useState(5);
  const [keepDelimiter, setKeepDelimiter] = useState(false);

  // 预设分隔符
  const delimiterPresets = [
    { label: '逗号 ,', value: ',' },
    { label: '分号 ;', value: ';' },
    { label: '空格', value: ' ' },
    { label: '制表符', value: '\t' },
    { label: '换行符', value: '\n' },
    { label: '竖线 |', value: '|' },
    { label: '冒号 :', value: ':' },
    { label: '点号 .', value: '.' },
    { label: '斜杠 /', value: '/' },
    { label: '自定义', value: 'custom' },
  ];

  // 获取实际使用的合并分隔符
  const getActualMergeDelimiter = () => {
    if (mergeDelimiter === 'custom') {
      // 处理转义字符
      return mergeCustom
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
    }
    return mergeDelimiter;
  };

  // 获取实际使用的拆分分隔符
  const getActualSplitDelimiter = () => {
    if (splitDelimiter === 'custom') {
      return splitCustom
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
    }
    return splitDelimiter;
  };

  // 合并操作
  const handleMerge = () => {
    if (!input.trim()) {
      setOutput('');
      return;
    }

    let lines = input.split('\n');
    
    // 去除每行首尾空白
    if (trimLines) {
      lines = lines.map(line => line.trim());
    }
    
    // 移除空行
    if (removeEmpty) {
      lines = lines.filter(line => line.length > 0);
    }
    
    // 添加引号
    if (addQuotes) {
      lines = lines.map(line => `${quoteChar}${line}${quoteChar}`);
    }
    
    const delimiter = getActualMergeDelimiter();
    setOutput(lines.join(delimiter));
  };

  // 拆分操作
  const handleSplit = () => {
    if (!input.trim()) {
      setOutput('');
      return;
    }

    let result: string[] = [];

    switch (splitType) {
      case 'delimiter': {
        const delimiter = getActualSplitDelimiter();
        if (keepDelimiter) {
          // 保留分隔符
          const regex = new RegExp(`(${escapeRegex(delimiter)})`, 'g');
          result = input.split(regex).filter(s => s.length > 0);
        } else {
          result = input.split(delimiter);
        }
        break;
      }
      case 'regex': {
        try {
          const regex = new RegExp(splitRegex, 'g');
          if (keepDelimiter) {
            result = input.split(regex).filter(s => s.length > 0);
          } else {
            result = input.split(regex);
          }
        } catch (e) {
          setOutput('正则表达式错误: ' + (e as Error).message);
          return;
        }
        break;
      }
      case 'length': {
        // 按固定长度拆分
        const len = Math.max(1, splitLength);
        for (let i = 0; i < input.length; i += len) {
          result.push(input.slice(i, i + len));
        }
        break;
      }
      case 'count': {
        // 按数量均分
        const count = Math.max(1, splitCount);
        const partLength = Math.ceil(input.length / count);
        for (let i = 0; i < input.length; i += partLength) {
          result.push(input.slice(i, i + partLength));
        }
        break;
      }
    }

    // 去除空白
    if (trimLines) {
      result = result.map(s => s.trim());
    }
    if (removeEmpty) {
      result = result.filter(s => s.length > 0);
    }

    setOutput(result.join('\n'));
  };

  // 转义正则特殊字符
  const escapeRegex = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // 复制结果
  const copyOutput = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      message.success('已复制到剪贴板');
    }
  };

  // 交换输入输出
  const swapInputOutput = () => {
    const temp = input;
    setInput(output);
    setOutput(temp);
  };

  // 统计信息
  const getStats = () => {
    const inputLines = input.split('\n').filter(l => l.trim()).length;
    const outputLines = output.split('\n').filter(l => l.trim()).length;
    return { inputLines, outputLines };
  };

  const stats = getStats();

  return (
    <div>
      {/* 模式切换 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Text strong>操作模式</Text>
            <Select
              value={mode}
              onChange={setMode}
              style={{ width: '100%', marginTop: 4 }}
            >
              <Select.Option value="merge">合并（多行 → 单行）</Select.Option>
              <Select.Option value="split">拆分（单行 → 多行）</Select.Option>
            </Select>
          </Col>
          
          {mode === 'merge' ? (
            <>
              <Col span={6}>
                <Text strong>合并分隔符</Text>
                <Select
                  value={mergeDelimiter}
                  onChange={setMergeDelimiter}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  {delimiterPresets.map(p => (
                    <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                  ))}
                </Select>
              </Col>
              {mergeDelimiter === 'custom' && (
                <Col span={4}>
                  <Text strong>自定义</Text>
                  <Input
                    value={mergeCustom}
                    onChange={e => setMergeCustom(e.target.value)}
                    placeholder="如: \n 或 ||"
                    style={{ marginTop: 4 }}
                  />
                </Col>
              )}
              <Col span={8}>
                <div style={{ marginTop: 20 }}>
                  <Space wrap>
                    <Checkbox checked={trimLines} onChange={e => setTrimLines(e.target.checked)}>去除空白</Checkbox>
                    <Checkbox checked={removeEmpty} onChange={e => setRemoveEmpty(e.target.checked)}>移除空行</Checkbox>
                    <Checkbox checked={addQuotes} onChange={e => setAddQuotes(e.target.checked)}>添加引号</Checkbox>
                    {addQuotes && (
                      <Select value={quoteChar} onChange={setQuoteChar} size="small" style={{ width: 70 }}>
                        <Select.Option value='"'>双引号</Select.Option>
                        <Select.Option value="'">单引号</Select.Option>
                        <Select.Option value="`">反引号</Select.Option>
                      </Select>
                    )}
                  </Space>
                </div>
              </Col>
            </>
          ) : (
            <>
              <Col span={4}>
                <Text strong>拆分方式</Text>
                <Select
                  value={splitType}
                  onChange={setSplitType}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  <Select.Option value="delimiter">按分隔符</Select.Option>
                  <Select.Option value="regex">按正则</Select.Option>
                  <Select.Option value="length">按长度</Select.Option>
                  <Select.Option value="count">按数量</Select.Option>
                </Select>
              </Col>
              {splitType === 'delimiter' && (
                <>
                  <Col span={4}>
                    <Text strong>分隔符</Text>
                    <Select
                      value={splitDelimiter}
                      onChange={setSplitDelimiter}
                      style={{ width: '100%', marginTop: 4 }}
                    >
                      {delimiterPresets.map(p => (
                        <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                      ))}
                    </Select>
                  </Col>
                  {splitDelimiter === 'custom' && (
                    <Col span={3}>
                      <Text strong>自定义</Text>
                      <Input
                        value={splitCustom}
                        onChange={e => setSplitCustom(e.target.value)}
                        placeholder="分隔符"
                        style={{ marginTop: 4 }}
                      />
                    </Col>
                  )}
                </>
              )}
              {splitType === 'regex' && (
                <Col span={6}>
                  <Text strong>正则表达式</Text>
                  <Input
                    value={splitRegex}
                    onChange={e => setSplitRegex(e.target.value)}
                    placeholder="如: [,;] 或 \s+"
                    style={{ marginTop: 4 }}
                  />
                </Col>
              )}
              {splitType === 'length' && (
                <Col span={4}>
                  <Text strong>每段长度</Text>
                  <Input
                    type="number"
                    value={splitLength}
                    onChange={e => setSplitLength(parseInt(e.target.value) || 10)}
                    min={1}
                    style={{ marginTop: 4 }}
                  />
                </Col>
              )}
              {splitType === 'count' && (
                <Col span={4}>
                  <Text strong>拆分数量</Text>
                  <Input
                    type="number"
                    value={splitCount}
                    onChange={e => setSplitCount(parseInt(e.target.value) || 5)}
                    min={1}
                    style={{ marginTop: 4 }}
                  />
                </Col>
              )}
              <Col span={6}>
                <div style={{ marginTop: 20 }}>
                  <Space wrap>
                    <Checkbox checked={trimLines} onChange={e => setTrimLines(e.target.checked)}>去除空白</Checkbox>
                    <Checkbox checked={removeEmpty} onChange={e => setRemoveEmpty(e.target.checked)}>移除空项</Checkbox>
                    {(splitType === 'delimiter' || splitType === 'regex') && (
                      <Checkbox checked={keepDelimiter} onChange={e => setKeepDelimiter(e.target.checked)}>保留分隔符</Checkbox>
                    )}
                  </Space>
                </div>
              </Col>
            </>
          )}
        </Row>
      </Card>

      {/* 输入输出区域 */}
      <Row gutter={16}>
        <Col span={11}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong>输入文本</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {mode === 'merge' ? `${stats.inputLines} 行` : `${input.length} 字符`}
            </Text>
          </div>
          <TextArea
            rows={14}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={mode === 'merge' ? '输入多行文本，每行一个项目...' : '输入要拆分的文本...'}
          />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" onClick={mode === 'merge' ? handleMerge : handleSplit}>
              {mode === 'merge' ? '合并' : '拆分'}
            </Button>
            <Button onClick={() => { setInput(''); setOutput(''); }} icon={<ClearOutlined />}>清空</Button>
          </Space>
        </Col>
        <Col span={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Tooltip title="交换输入输出">
            <Button icon={<SwapOutlined />} onClick={swapInputOutput} />
          </Tooltip>
        </Col>
        <Col span={11}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong>输出结果</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {mode === 'merge' ? `${output.length} 字符` : `${stats.outputLines} 行`}
            </Text>
          </div>
          <TextArea
            rows={14}
            value={output}
            readOnly
            style={{ background: '#f5f5f5' }}
            placeholder="处理结果将显示在这里..."
          />
          <Button
            onClick={copyOutput}
            style={{ marginTop: 8 }}
            icon={<CopyOutlined />}
            disabled={!output}
          >
            复制
          </Button>
        </Col>
      </Row>
    </div>
  );
};

// 前后缀处理工具
const TextPrefixSuffixTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  // 操作模式
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  // 位置：前缀或后缀
  const [position, setPosition] = useState<'prefix' | 'suffix' | 'both'>('prefix');
  
  // 添加模式设置
  const [addType, setAddType] = useState<'static' | 'number' | 'letter' | 'weekday' | 'custom'>('static');
  const [staticPrefix, setStaticPrefix] = useState('');
  const [staticSuffix, setStaticSuffix] = useState('');
  
  // 递增设置
  const [startNumber, setStartNumber] = useState(1);
  const [step, setStep] = useState(1);
  const [numberPadding, setNumberPadding] = useState(0); // 数字补零位数
  const [letterCase, setLetterCase] = useState<'lower' | 'upper'>('lower');
  const [startLetter, setStartLetter] = useState('a');
  
  // 自定义序列
  const [customSequence, setCustomSequence] = useState('');
  const [sequenceCycle, setSequenceCycle] = useState(true); // 循环使用序列
  
  // 删除模式设置
  const [removeType, setRemoveType] = useState<'chars' | 'regex' | 'pattern'>('chars');
  const [removeChars, setRemoveChars] = useState(0); // 删除字符数
  const [removeRegex, setRemoveRegex] = useState('');
  const [removePattern, setRemovePattern] = useState(''); // 删除指定内容
  
  // 分隔符
  const [separator, setSeparator] = useState('');

  // 星期预设
  const weekdays = {
    cn: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    cnFull: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enFull: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  };
  const [weekdayFormat, setWeekdayFormat] = useState<'cn' | 'cnFull' | 'en' | 'enFull'>('cn');

  // 生成递增值
  const generateValue = (index: number): string => {
    switch (addType) {
      case 'number': {
        const num = startNumber + index * step;
        return numberPadding > 0 ? String(num).padStart(numberPadding, '0') : String(num);
      }
      case 'letter': {
        const startCode = startLetter.toLowerCase().charCodeAt(0) - 97;
        const letterIndex = (startCode + index * step) % 26;
        const letter = String.fromCharCode(97 + letterIndex);
        return letterCase === 'upper' ? letter.toUpperCase() : letter;
      }
      case 'weekday': {
        const days = weekdays[weekdayFormat];
        return days[index % 7];
      }
      case 'custom': {
        const items = customSequence.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
        if (items.length === 0) return '';
        if (sequenceCycle) {
          return items[index % items.length];
        }
        return index < items.length ? items[index] : items[items.length - 1];
      }
      default:
        return '';
    }
  };

  // 添加前后缀
  const handleAdd = () => {
    if (!input.trim()) {
      setOutput('');
      return;
    }

    const lines = input.split('\n');
    const result = lines.map((line, index) => {
      if (!line.trim()) return line; // 保留空行
      
      let prefix = '';
      let suffix = '';
      
      if (addType === 'static') {
        prefix = position === 'prefix' || position === 'both' ? staticPrefix : '';
        suffix = position === 'suffix' || position === 'both' ? staticSuffix : '';
      } else {
        const value = generateValue(index);
        prefix = position === 'prefix' || position === 'both' ? value + separator : '';
        suffix = position === 'suffix' || position === 'both' ? separator + value : '';
      }
      
      return prefix + line + suffix;
    });
    
    setOutput(result.join('\n'));
  };

  // 删除前后缀
  const handleRemove = () => {
    if (!input.trim()) {
      setOutput('');
      return;
    }

    const lines = input.split('\n');
    const result = lines.map(line => {
      if (!line.trim()) return line;
      
      let processed = line;
      
      switch (removeType) {
        case 'chars': {
          if (removeChars > 0) {
            if (position === 'prefix' || position === 'both') {
              processed = processed.slice(removeChars);
            }
            if (position === 'suffix' || position === 'both') {
              processed = processed.slice(0, -removeChars);
            }
          }
          break;
        }
        case 'regex': {
          try {
            const regex = new RegExp(removeRegex, 'g');
            if (position === 'prefix') {
              processed = processed.replace(new RegExp('^' + removeRegex), '');
            } else if (position === 'suffix') {
              processed = processed.replace(new RegExp(removeRegex + '$'), '');
            } else {
              processed = processed.replace(new RegExp('^' + removeRegex), '').replace(new RegExp(removeRegex + '$'), '');
            }
          } catch (e) {
            // 正则错误时保持原样
          }
          break;
        }
        case 'pattern': {
          if (removePattern) {
            if (position === 'prefix' || position === 'both') {
              if (processed.startsWith(removePattern)) {
                processed = processed.slice(removePattern.length);
              }
            }
            if (position === 'suffix' || position === 'both') {
              if (processed.endsWith(removePattern)) {
                processed = processed.slice(0, -removePattern.length);
              }
            }
          }
          break;
        }
      }
      
      return processed;
    });
    
    setOutput(result.join('\n'));
  };

  // 执行操作
  const handleProcess = () => {
    if (mode === 'add') {
      handleAdd();
    } else {
      handleRemove();
    }
  };

  // 复制结果
  const copyOutput = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      message.success('已复制到剪贴板');
    }
  };

  // 交换输入输出
  const swapInputOutput = () => {
    const temp = input;
    setInput(output);
    setOutput(temp);
  };

  // 统计
  const inputLines = input.split('\n').filter(l => l.trim()).length;
  const outputLines = output.split('\n').filter(l => l.trim()).length;

  return (
    <div>
      {/* 设置区域 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={4}>
            <Text strong>操作模式</Text>
            <Select value={mode} onChange={setMode} style={{ width: '100%', marginTop: 4 }}>
              <Select.Option value="add">添加前后缀</Select.Option>
              <Select.Option value="remove">删除前后缀</Select.Option>
            </Select>
          </Col>
          <Col span={4}>
            <Text strong>位置</Text>
            <Select value={position} onChange={setPosition} style={{ width: '100%', marginTop: 4 }}>
              <Select.Option value="prefix">前缀</Select.Option>
              <Select.Option value="suffix">后缀</Select.Option>
              <Select.Option value="both">前后都加</Select.Option>
            </Select>
          </Col>
          
          {mode === 'add' ? (
            <>
              <Col span={4}>
                <Text strong>添加类型</Text>
                <Select value={addType} onChange={setAddType} style={{ width: '100%', marginTop: 4 }}>
                  <Select.Option value="static">固定内容</Select.Option>
                  <Select.Option value="number">数字递增</Select.Option>
                  <Select.Option value="letter">字母递增</Select.Option>
                  <Select.Option value="weekday">星期</Select.Option>
                  <Select.Option value="custom">自定义序列</Select.Option>
                </Select>
              </Col>
              
              {addType === 'static' && (
                <>
                  {(position === 'prefix' || position === 'both') && (
                    <Col span={4}>
                      <Text strong>前缀内容</Text>
                      <Input
                        value={staticPrefix}
                        onChange={e => setStaticPrefix(e.target.value)}
                        placeholder="前缀"
                        style={{ marginTop: 4 }}
                      />
                    </Col>
                  )}
                  {(position === 'suffix' || position === 'both') && (
                    <Col span={4}>
                      <Text strong>后缀内容</Text>
                      <Input
                        value={staticSuffix}
                        onChange={e => setStaticSuffix(e.target.value)}
                        placeholder="后缀"
                        style={{ marginTop: 4 }}
                      />
                    </Col>
                  )}
                </>
              )}
              
              {addType === 'number' && (
                <>
                  <Col span={3}>
                    <Text strong>起始值</Text>
                    <Input
                      type="number"
                      value={startNumber}
                      onChange={e => setStartNumber(parseInt(e.target.value) || 1)}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={2}>
                    <Text strong>步长</Text>
                    <Input
                      type="number"
                      value={step}
                      onChange={e => setStep(parseInt(e.target.value) || 1)}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={3}>
                    <Text strong>补零位数</Text>
                    <Input
                      type="number"
                      value={numberPadding}
                      onChange={e => setNumberPadding(parseInt(e.target.value) || 0)}
                      min={0}
                      placeholder="0=不补零"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={3}>
                    <Text strong>分隔符</Text>
                    <Input
                      value={separator}
                      onChange={e => setSeparator(e.target.value)}
                      placeholder="如: . 或 -"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                </>
              )}
              
              {addType === 'letter' && (
                <>
                  <Col span={3}>
                    <Text strong>起始字母</Text>
                    <Input
                      value={startLetter}
                      onChange={e => setStartLetter(e.target.value.slice(0, 1) || 'a')}
                      maxLength={1}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={2}>
                    <Text strong>步长</Text>
                    <Input
                      type="number"
                      value={step}
                      onChange={e => setStep(parseInt(e.target.value) || 1)}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={3}>
                    <Text strong>大小写</Text>
                    <Select value={letterCase} onChange={setLetterCase} style={{ width: '100%', marginTop: 4 }}>
                      <Select.Option value="lower">小写</Select.Option>
                      <Select.Option value="upper">大写</Select.Option>
                    </Select>
                  </Col>
                  <Col span={3}>
                    <Text strong>分隔符</Text>
                    <Input
                      value={separator}
                      onChange={e => setSeparator(e.target.value)}
                      placeholder="如: . 或 -"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                </>
              )}
              
              {addType === 'weekday' && (
                <>
                  <Col span={4}>
                    <Text strong>格式</Text>
                    <Select value={weekdayFormat} onChange={setWeekdayFormat} style={{ width: '100%', marginTop: 4 }}>
                      <Select.Option value="cn">周一、周二...</Select.Option>
                      <Select.Option value="cnFull">星期一、星期二...</Select.Option>
                      <Select.Option value="en">Mon、Tue...</Select.Option>
                      <Select.Option value="enFull">Monday、Tuesday...</Select.Option>
                    </Select>
                  </Col>
                  <Col span={3}>
                    <Text strong>分隔符</Text>
                    <Input
                      value={separator}
                      onChange={e => setSeparator(e.target.value)}
                      placeholder="如: . 或 -"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                </>
              )}
              
              {addType === 'custom' && (
                <>
                  <Col span={6}>
                    <Text strong>自定义序列（逗号分隔）</Text>
                    <Input
                      value={customSequence}
                      onChange={e => setCustomSequence(e.target.value)}
                      placeholder="如: 甲,乙,丙,丁 或 ①,②,③"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={3}>
                    <Text strong>分隔符</Text>
                    <Input
                      value={separator}
                      onChange={e => setSeparator(e.target.value)}
                      placeholder="如: . 或 -"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={3}>
                    <div style={{ marginTop: 20 }}>
                      <Checkbox checked={sequenceCycle} onChange={e => setSequenceCycle(e.target.checked)}>
                        循环使用
                      </Checkbox>
                    </div>
                  </Col>
                </>
              )}
            </>
          ) : (
            <>
              <Col span={4}>
                <Text strong>删除方式</Text>
                <Select value={removeType} onChange={setRemoveType} style={{ width: '100%', marginTop: 4 }}>
                  <Select.Option value="chars">按字符数</Select.Option>
                  <Select.Option value="pattern">指定内容</Select.Option>
                  <Select.Option value="regex">正则匹配</Select.Option>
                </Select>
              </Col>
              
              {removeType === 'chars' && (
                <Col span={4}>
                  <Text strong>删除字符数</Text>
                  <Input
                    type="number"
                    value={removeChars}
                    onChange={e => setRemoveChars(parseInt(e.target.value) || 0)}
                    min={0}
                    style={{ marginTop: 4 }}
                  />
                </Col>
              )}
              
              {removeType === 'pattern' && (
                <Col span={6}>
                  <Text strong>要删除的内容</Text>
                  <Input
                    value={removePattern}
                    onChange={e => setRemovePattern(e.target.value)}
                    placeholder="输入要删除的前缀或后缀"
                    style={{ marginTop: 4 }}
                  />
                </Col>
              )}
              
              {removeType === 'regex' && (
                <Col span={6}>
                  <Text strong>正则表达式</Text>
                  <Input
                    value={removeRegex}
                    onChange={e => setRemoveRegex(e.target.value)}
                    placeholder="如: \d+ 或 [a-z]+"
                    style={{ marginTop: 4 }}
                  />
                </Col>
              )}
            </>
          )}
        </Row>
      </Card>

      {/* 输入输出区域 */}
      <Row gutter={16}>
        <Col span={11}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong>输入文本</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{inputLines} 行</Text>
          </div>
          <TextArea
            rows={14}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="输入多行文本，每行将被处理..."
          />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" onClick={handleProcess}>
              {mode === 'add' ? '添加' : '删除'}
            </Button>
            <Button onClick={() => { setInput(''); setOutput(''); }} icon={<ClearOutlined />}>清空</Button>
          </Space>
        </Col>
        <Col span={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Tooltip title="交换输入输出">
            <Button icon={<SwapOutlined />} onClick={swapInputOutput} />
          </Tooltip>
        </Col>
        <Col span={11}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong>输出结果</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{outputLines} 行</Text>
          </div>
          <TextArea
            rows={14}
            value={output}
            readOnly
            style={{ background: '#f5f5f5' }}
            placeholder="处理结果将显示在这里..."
          />
          <Button
            onClick={copyOutput}
            style={{ marginTop: 8 }}
            icon={<CopyOutlined />}
            disabled={!output}
          >
            复制
          </Button>
        </Col>
      </Row>
    </div>
  );
};

// URL 提取工具
const UrlExtractTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  // 文件类型过滤
  const [fileTypes, setFileTypes] = useState<string[]>([]);
  const [customFileType, setCustomFileType] = useState('');
  // 域名过滤
  const [includeDomains, setIncludeDomains] = useState('');
  const [excludeDomains, setExcludeDomains] = useState('');
  // 统计信息
  const [stats, setStats] = useState({ total: 0, unique: 0, filtered: 0 });

  // 预设文件类型
  const presetFileTypes = [
    { label: '图片', value: 'images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'] },
    { label: '视频', value: 'videos', extensions: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv'] },
    { label: '音频', value: 'audios', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
    { label: '文档', value: 'docs', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'] },
    { label: '压缩包', value: 'archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'] },
    { label: '代码', value: 'code', extensions: ['js', 'ts', 'jsx', 'tsx', 'css', 'html', 'json', 'xml', 'py', 'java'] },
  ];

  // 当选择分类变化时，更新扩展名输入框
  const handleFileTypesChange = (values: string[]) => {
    setFileTypes(values);
    // 收集所有选中分类的扩展名
    const extensions: string[] = [];
    values.forEach(type => {
      const preset = presetFileTypes.find(p => p.value === type);
      if (preset) {
        extensions.push(...preset.extensions);
      }
    });
    // 去重并更新到输入框
    setCustomFileType([...new Set(extensions)].join(', '));
  };

  // 提取 URL
  const extractUrls = () => {
    if (!input.trim()) {
      setOutput('');
      setStats({ total: 0, unique: 0, filtered: 0 });
      return;
    }

    // URL 正则表达式
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    const matches = input.match(urlRegex) || [];
    
    // 去重
    const uniqueUrls = [...new Set(matches)];
    
    // 获取过滤条件 - 直接从输入框获取扩展名
    const extensions = customFileType.trim() 
      ? customFileType.split(/[,，\s]+/).filter(Boolean).map(ext => ext.replace(/^\./, '').toLowerCase())
      : [];
    const includeList = includeDomains.split(/[,，\s]+/).filter(Boolean).map(d => d.toLowerCase());
    const excludeList = excludeDomains.split(/[,，\s]+/).filter(Boolean).map(d => d.toLowerCase());

    // 过滤 URL
    let filteredUrls = uniqueUrls.filter(url => {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const pathname = urlObj.pathname.toLowerCase();
        
        // 域名包含过滤
        if (includeList.length > 0) {
          const matchInclude = includeList.some(domain => hostname.includes(domain));
          if (!matchInclude) return false;
        }
        
        // 域名排除过滤
        if (excludeList.length > 0) {
          const matchExclude = excludeList.some(domain => hostname.includes(domain));
          if (matchExclude) return false;
        }
        
        // 文件类型过滤
        if (extensions.length > 0) {
          const matchExt = extensions.some(ext => pathname.endsWith('.' + ext));
          if (!matchExt) return false;
        }
        
        return true;
      } catch {
        return false;
      }
    });

    setStats({
      total: matches.length,
      unique: uniqueUrls.length,
      filtered: filteredUrls.length,
    });
    
    setOutput(filteredUrls.join('\n'));
  };

  const copyOutput = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      message.success('已复制到剪贴板');
    }
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
    setStats({ total: 0, unique: 0, filtered: 0 });
    setFileTypes([]);
    setCustomFileType('');
    setIncludeDomains('');
    setExcludeDomains('');
  };

  return (
    <div>
      {/* 过滤选项 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16}>
          <Col span={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>快速选择文件类型</Text>
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>（点击自动填充扩展名）</Text>
            </div>
            <Checkbox.Group
              value={fileTypes}
              onChange={(values) => handleFileTypesChange(values as string[])}
              style={{ width: '100%' }}
            >
              <Row>
                {presetFileTypes.map(type => (
                  <Col span={8} key={type.value}>
                    <Tooltip title={type.extensions.join(', ')}>
                      <Checkbox value={type.value}>{type.label}</Checkbox>
                    </Tooltip>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>扩展名（可手动编辑，多个用逗号分隔，留空提取所有）：</Text>
              <Input
                placeholder="如: jpg, png, gif, mp4"
                value={customFileType}
                onChange={e => {
                  setCustomFileType(e.target.value);
                  // 清除分类选择，因为用户手动编辑了
                  if (fileTypes.length > 0) {
                    setFileTypes([]);
                  }
                }}
                size="small"
              />
            </div>
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>域名过滤</Text>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>包含域名（多个用逗号分隔）：</Text>
              <Input
                placeholder="如: github.com, google.com"
                value={includeDomains}
                onChange={e => setIncludeDomains(e.target.value)}
                size="small"
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>排除域名（多个用逗号分隔）：</Text>
              <Input
                placeholder="如: ads.com, tracker.com"
                value={excludeDomains}
                onChange={e => setExcludeDomains(e.target.value)}
                size="small"
              />
            </div>
          </Col>
        </Row>
      </Card>

      {/* 输入输出区域 */}
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>输入文本</Text>
          <TextArea
            rows={14}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="粘贴包含 URL 的文本内容..."
          />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" onClick={extractUrls}>提取 URL</Button>
            <Button onClick={clearAll} icon={<ClearOutlined />}>清空</Button>
          </Space>
        </Col>
        <Col span={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>提取结果</Text>
            {stats.filtered > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                共 {stats.total} 个 URL，去重后 {stats.unique} 个，过滤后 {stats.filtered} 个
              </Text>
            )}
          </div>
          <TextArea
            rows={14}
            value={output}
            readOnly
            style={{ background: '#f5f5f5' }}
            placeholder="提取的 URL 将显示在这里..."
          />
          <Button
            onClick={copyOutput}
            style={{ marginTop: 8 }}
            icon={<CopyOutlined />}
            disabled={!output}
          >
            复制
          </Button>
        </Col>
      </Row>
    </div>
  );
};

// Markdown 与 HTML 互转工具 - 增强版
const MdHtmlTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const [mode, setMode] = useState<'md2html' | 'html2md'>('md2html');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [options, setOptions] = useState({
    gfm: true,           // GitHub Flavored Markdown
    breaks: true,        // 换行转 <br>
    headerIds: true,     // 标题添加 ID
    mangle: false,       // 不混淆邮箱
    sanitize: false,     // 不清理 HTML
    tables: true,        // 支持表格
    taskLists: true,     // 支持任务列表
    codeHighlight: true, // 代码高亮
  });

  // MD → HTML 转换
  const convertMdToHtml = async () => {
    if (!input.trim()) {
      setOutput('');
      setPreviewHtml('');
      return;
    }

    try {
      const { marked } = await import('marked');
      
      // 配置 marked
      marked.setOptions({
        gfm: options.gfm,
        breaks: options.breaks,
      });

      let html = await marked.parse(input);
      
      // 代码高亮
      if (options.codeHighlight) {
        try {
          const hljs = (await import('highlight.js')).default;
          html = html.replace(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g, 
            (match, lang, code) => {
              try {
                const decoded = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                const highlighted = hljs.highlight(decoded, { language: lang }).value;
                return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
              } catch {
                return match;
              }
            }
          );
        } catch (e) {
          console.error('Highlight error:', e);
        }
      }

      setOutput(html);
      setPreviewHtml(html);
      message.success('转换成功');
    } catch (err) {
      message.error('转换失败: ' + (err as Error).message);
    }
  };

  // HTML → MD 转换
  const convertHtmlToMd = async () => {
    if (!input.trim()) {
      setOutput('');
      return;
    }

    try {
      const TurndownService = (await import('turndown')).default;
      // @ts-ignore - turndown-plugin-gfm 没有类型定义
      const { gfm } = await import('turndown-plugin-gfm');
      
      const turndown = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '*',
        strongDelimiter: '**',
        linkStyle: 'inlined',
      });

      // 使用官方 GFM 插件（支持表格、删除线、任务列表）
      turndown.use(gfm);

      // 改进的代码块支持
      turndown.addRule('codeBlock', {
        filter: function(node) {
          return node.nodeName === 'PRE' && node.querySelector('code') !== null;
        },
        replacement: function(content, node) {
          const code = (node as HTMLElement).querySelector('code');
          const lang = code?.className?.match(/language-(\w+)/)?.[1] || '';
          const text = code?.textContent || content;
          return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
        }
      });

      // 处理 br 标签
      turndown.addRule('br', {
        filter: 'br',
        replacement: function() {
          return '\n';
        }
      });

      const markdown = turndown.turndown(input);
      setOutput(markdown);
      message.success('转换成功');
    } catch (err) {
      message.error('转换失败: ' + (err as Error).message);
    }
  };

  const handleConvert = () => {
    if (mode === 'md2html') {
      convertMdToHtml();
    } else {
      convertHtmlToMd();
    }
  };

  // 示例内容
  const loadExample = () => {
    if (mode === 'md2html') {
      setInput(`# Markdown 示例

## 文本格式

这是**粗体**，这是*斜体*，这是~~删除线~~。

## 列表

- 无序列表项 1
- 无序列表项 2
  - 嵌套项

1. 有序列表项 1
2. 有序列表项 2

## 任务列表

- [x] 已完成任务
- [ ] 未完成任务

## 代码

行内代码：\`const x = 1;\`

代码块：
\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`

## 表格

| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 25   | 北京 |
| 李四 | 30   | 上海 |

## 引用

> 这是一段引用文字
> 可以有多行

## 链接和图片

[链接文字](https://example.com)

![图片描述](https://via.placeholder.com/150)

## 分割线

---

完成！
`);
    } else {
      setInput(`<h1>HTML 示例</h1>
<h2>文本格式</h2>
<p>这是<strong>粗体</strong>，这是<em>斜体</em>，这是<del>删除线</del>。</p>

<h2>列表</h2>
<ul>
  <li>无序列表项 1</li>
  <li>无序列表项 2
    <ul>
      <li>嵌套项</li>
    </ul>
  </li>
</ul>

<ol>
  <li>有序列表项 1</li>
  <li>有序列表项 2</li>
</ol>

<h2>代码</h2>
<p>行内代码：<code>const x = 1;</code></p>

<pre><code class="language-javascript">function hello() {
  console.log('Hello, World!');
}</code></pre>

<h2>表格</h2>
<table>
  <tr><th>姓名</th><th>年龄</th><th>城市</th></tr>
  <tr><td>张三</td><td>25</td><td>北京</td></tr>
  <tr><td>李四</td><td>30</td><td>上海</td></tr>
</table>

<h2>引用</h2>
<blockquote>
  <p>这是一段引用文字</p>
</blockquote>

<h2>链接</h2>
<p><a href="https://example.com">链接文字</a></p>

<hr>
<p>完成！</p>`);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Select
            value={mode}
            onChange={(v) => { setMode(v); setInput(''); setOutput(''); setPreviewHtml(''); }}
            style={{ width: 160 }}
            options={[
              { value: 'md2html', label: 'Markdown → HTML' },
              { value: 'html2md', label: 'HTML → Markdown' },
            ]}
          />
          <Button onClick={loadExample}>加载示例</Button>
          {mode === 'md2html' && (
            <Checkbox checked={showPreview} onChange={e => setShowPreview(e.target.checked)}>
              显示预览
            </Checkbox>
          )}
        </Space>
        <Space>
          <Button type="primary" onClick={handleConvert}>转换</Button>
          <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(output); message.success('已复制'); }}>复制结果</Button>
          <Button icon={<ClearOutlined />} onClick={() => { setInput(''); setOutput(''); setPreviewHtml(''); }}>清空</Button>
        </Space>
      </div>

      {/* 选项（仅 MD→HTML 模式） */}
      {mode === 'md2html' && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Checkbox checked={options.gfm} onChange={e => setOptions({...options, gfm: e.target.checked})}>
            GFM 模式
          </Checkbox>
          <Checkbox checked={options.breaks} onChange={e => setOptions({...options, breaks: e.target.checked})}>
            换行转 br
          </Checkbox>
          <Checkbox checked={options.codeHighlight} onChange={e => setOptions({...options, codeHighlight: e.target.checked})}>
            代码高亮
          </Checkbox>
        </div>
      )}

      {/* 编辑区域 */}
      <Row gutter={16} style={{ flex: 1, minHeight: 0 }}>
        <Col span={showPreview ? 8 : 12} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Text strong style={{ marginBottom: 8 }}>{mode === 'md2html' ? 'Markdown' : 'HTML'}</Text>
          <TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={mode === 'md2html' ? '输入 Markdown 文本...' : '输入 HTML 代码...'}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, resize: 'none' }}
          />
        </Col>
        <Col span={showPreview ? 8 : 12} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Text strong style={{ marginBottom: 8 }}>{mode === 'md2html' ? 'HTML' : 'Markdown'}</Text>
          <TextArea
            value={output}
            readOnly
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, background: '#f5f5f5', resize: 'none' }}
          />
        </Col>
        {showPreview && mode === 'md2html' && (
          <Col span={8} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Text strong style={{ marginBottom: 8 }}>预览</Text>
            <div
              style={{
                flex: 1,
                padding: 16,
                background: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                overflow: 'auto',
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </Col>
        )}
      </Row>
    </div>
  );
};

// HTML 编辑器工具 - 使用 UEditor Plus
const HtmlEditorTool: React.FC = () => {
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'editor' | 'source' | 'preview'>('editor');
  const [sourceCode, setSourceCode] = useState('');
  const [editorReady, setEditorReady] = useState(false);
  const editorRef = React.useRef<any>(null);
  const editorContainerId = React.useRef(`ueditor-${Date.now()}`);

  // 动态加载 UEditor Plus
  React.useEffect(() => {
    const loadUEditor = async () => {
      try {
        // 检查是否已加载
        if ((window as any).UE) {
          setEditorReady(true);
          return;
        }

        // 获取当前页面的基础 URL（支持 Electron file:// 协议）
        const getBaseUrl = () => {
          const href = window.location.href;
          // 移除文件名，保留目录路径
          const lastSlash = href.lastIndexOf('/');
          return href.substring(0, lastSlash + 1);
        };
        
        const baseUrl = getBaseUrl();
        const ueditorHomeUrl = baseUrl + 'ueditor-plus/';
        
        // 在加载配置文件之前设置全局 UEDITOR_HOME_URL
        // 这对于 Electron 打包后的 file:// 协议至关重要
        (window as any).UEDITOR_HOME_URL = ueditorHomeUrl;
        (window as any).UEDITOR_CORS_URL = ueditorHomeUrl;

        // 加载 UEditor 配置文件
        const configScript = document.createElement('script');
        configScript.src = './ueditor-plus/ueditor.config.js';
        configScript.async = false;
        document.head.appendChild(configScript);

        await new Promise((resolve, reject) => {
          configScript.onload = resolve;
          configScript.onerror = reject;
        });

        // 加载 UEditor 主文件
        const mainScript = document.createElement('script');
        mainScript.src = './ueditor-plus/ueditor.all.js';
        mainScript.async = false;
        document.head.appendChild(mainScript);

        await new Promise((resolve, reject) => {
          mainScript.onload = resolve;
          mainScript.onerror = reject;
        });

        // 加载中文语言包
        const langScript = document.createElement('script');
        langScript.src = './ueditor-plus/lang/zh-cn/zh-cn.js';
        langScript.async = false;
        document.head.appendChild(langScript);

        await new Promise((resolve, reject) => {
          langScript.onload = resolve;
          langScript.onerror = reject;
        });

        setEditorReady(true);
      } catch (err) {
        console.error('Failed to load UEditor Plus:', err);
      }
    };

    loadUEditor();

    return () => {
      // 清理编辑器实例
      if (editorRef.current) {
        try {
          editorRef.current.destroy();
        } catch (e) {
          // ignore
        }
        editorRef.current = null;
      }
    };
  }, []);

  // 初始化编辑器
  React.useEffect(() => {
    if (!editorReady || viewMode !== 'editor') return;

    // 等待 DOM 准备好
    const timer = setTimeout(() => {
      const UE = (window as any).UE;
      if (!UE) return;

      // 销毁旧实例
      if (editorRef.current) {
        try {
          editorRef.current.destroy();
        } catch (e) {
          // ignore
        }
      }

      // 获取当前页面的基础 URL（支持 Electron file:// 协议）
      const getBaseUrl = () => {
        const href = window.location.href;
        const lastSlash = href.lastIndexOf('/');
        return href.substring(0, lastSlash + 1);
      };
      const ueditorHomeUrl = getBaseUrl() + 'ueditor-plus/';

      // 创建新实例
      editorRef.current = UE.getEditor(editorContainerId.current, {
        UEDITOR_HOME_URL: ueditorHomeUrl,
        initialFrameWidth: '100%',
        initialFrameHeight: 500,
        autoHeightEnabled: false,
        lang: 'zh-cn',
        // 禁用服务端功能（纯前端使用）
        serverUrl: '',
        enableAutoSave: false,
        // 工具栏配置
        toolbars: [[
          'fullscreen', 'source', '|', 'undo', 'redo', '|',
          'bold', 'italic', 'underline', 'fontborder', 'strikethrough', 'superscript', 'subscript', 'removeformat', 'formatmatch', 'autotypeset', 'blockquote', 'pasteplain', '|',
          'forecolor', 'backcolor', 'insertorderedlist', 'insertunorderedlist', 'selectall', 'cleardoc', '|',
          'rowspacingtop', 'rowspacingbottom', 'lineheight', '|',
          'customstyle', 'paragraph', 'fontfamily', 'fontsize', '|',
          'directionalityltr', 'directionalityrtl', 'indent', '|',
          'justifyleft', 'justifycenter', 'justifyright', 'justifyjustify', '|',
          'touppercase', 'tolowercase', '|',
          'link', 'unlink', 'anchor', '|',
          'imagenone', 'imageleft', 'imageright', 'imagecenter', '|',
          'simpleupload', 'insertimage', 'emotion', 'scrawl', 'insertvideo', 'attachment', 'map', 'insertframe', 'insertcode', 'pagebreak', 'template', 'background', '|',
          'horizontal', 'date', 'time', 'spechars', '|',
          'inserttable', 'deletetable', 'insertparagraphbeforetable', 'insertrow', 'deleterow', 'insertcol', 'deletecol', 'mergecells', 'mergeright', 'mergedown', 'splittocells', 'splittorows', 'splittocols', '|',
          'print', 'preview', 'searchreplace', 'help'
        ]],
      });

      // 监听内容变化
      editorRef.current.ready(() => {
        if (content) {
          editorRef.current.setContent(content);
        }
        editorRef.current.addListener('contentChange', () => {
          const html = editorRef.current.getContent();
          setContent(html);
          setSourceCode(html);
        });
      });
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [editorReady, viewMode]);

  // 同步源代码到编辑器
  const applySourceCode = () => {
    setContent(sourceCode);
    if (editorRef.current && viewMode === 'editor') {
      editorRef.current.setContent(sourceCode);
    }
    message.success('已应用源代码');
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSourceCode(e.target.value);
  };

  const formatHtml = () => {
    try {
      let formatted = sourceCode
        .replace(/></g, '>\n<')
        .replace(/(<[^/][^>]*>)/g, '\n$1')
        .replace(/(<\/[^>]+>)/g, '$1\n')
        .split('\n')
        .filter(line => line.trim())
        .join('\n');

      let indent = 0;
      formatted = formatted.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('</')) {
          indent = Math.max(0, indent - 1);
        }
        const result = '  '.repeat(indent) + trimmed;
        if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
          indent++;
        }
        return result;
      }).join('\n');

      setSourceCode(formatted);
      message.success('已格式化');
    } catch {
      message.error('格式化失败');
    }
  };

  const copyContent = () => {
    const textToCopy = viewMode === 'source' ? sourceCode : content;
    navigator.clipboard.writeText(textToCopy);
    message.success('已复制');
  };

  const clearContent = () => {
    setContent('');
    setSourceCode('');
    if (editorRef.current) {
      editorRef.current.setContent('');
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button
            type={viewMode === 'editor' ? 'primary' : 'default'}
            onClick={() => setViewMode('editor')}
          >
            可视化编辑
          </Button>
          <Button
            type={viewMode === 'source' ? 'primary' : 'default'}
            onClick={() => setViewMode('source')}
          >
            源代码
          </Button>
          <Button
            type={viewMode === 'preview' ? 'primary' : 'default'}
            onClick={() => setViewMode('preview')}
          >
            预览
          </Button>
        </Space>
        <Space>
          {viewMode === 'source' && (
            <>
              <Button onClick={formatHtml}>格式化</Button>
              <Button type="primary" onClick={applySourceCode}>应用</Button>
            </>
          )}
          <Button icon={<CopyOutlined />} onClick={copyContent}>复制</Button>
          <Button icon={<ClearOutlined />} onClick={clearContent}>清空</Button>
        </Space>
      </div>

      {/* 编辑区域 */}
      <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
        {viewMode === 'editor' && (
          <div style={{ height: '100%', display: editorReady ? 'block' : 'none' }}>
            <div id={editorContainerId.current} style={{ width: '100%', height: '100%' }}></div>
          </div>
        )}
        {viewMode === 'editor' && !editorReady && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text type="secondary">加载 UEditor Plus 中...</Text>
          </div>
        )}
        {viewMode === 'source' && (
          <TextArea
            value={sourceCode}
            onChange={handleSourceChange}
            style={{
              height: '100%',
              fontFamily: 'monospace',
              fontSize: 13,
              border: 'none',
              borderRadius: 0,
              resize: 'none',
            }}
            placeholder="在这里编辑 HTML 源代码..."
          />
        )}
        {viewMode === 'preview' && (
          <div
            style={{
              height: '100%',
              padding: 16,
              overflow: 'auto',
              background: '#fff',
            }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  );
};

// 文本对比工具 - 支持多种格式对比，差异高亮显示
// 字符级别差异结果类型
interface CharDiff {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

const TextCompareTool: React.FC = () => {
  // 左右文本
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  
  // 对比结果
  const [diffResult, setDiffResult] = useState<{
    left: Array<{ type: 'equal' | 'removed' | 'modified'; text: string; lineNum: number; charDiffs?: CharDiff[] }>;
    right: Array<{ type: 'equal' | 'added' | 'modified'; text: string; lineNum: number; charDiffs?: CharDiff[] }>;
    stats: { added: number; removed: number; modified: number; unchanged: number };
  } | null>(null);
  
  // 设置
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreEmptyLines, setIgnoreEmptyLines] = useState(true);
  const [compareMode, setCompareMode] = useState<'line' | 'word' | 'char'>('char');
  const [textFormat, setTextFormat] = useState<'plain' | 'json' | 'xml' | 'csv'>('plain');
  
  // 同步滚动
  const [syncScroll, setSyncScroll] = useState(true);
  const leftRef = React.useRef<HTMLDivElement>(null);
  const rightRef = React.useRef<HTMLDivElement>(null);
  const diffRef = React.useRef<HTMLDivElement>(null);
  const isScrolling = React.useRef(false);

  // 预处理文本
  const preprocessText = (text: string): string => {
    let processed = text;
    
    // 格式化 JSON
    if (textFormat === 'json') {
      try {
        const obj = JSON.parse(text);
        processed = JSON.stringify(obj, null, 2);
      } catch {
        // 保持原样
      }
    }
    
    // 格式化 XML
    if (textFormat === 'xml') {
      try {
        processed = text
          .replace(/></g, '>\n<')
          .replace(/(<[^/][^>]*>)/g, '\n$1')
          .replace(/(<\/[^>]+>)/g, '$1\n')
          .split('\n')
          .filter(line => line.trim())
          .join('\n');
      } catch {
        // 保持原样
      }
    }
    
    if (ignoreCase) {
      processed = processed.toLowerCase();
    }
    
    if (ignoreWhitespace) {
      processed = processed.replace(/\s+/g, ' ').trim();
    }
    
    return processed;
  };

  // 字符级别 LCS 算法
  const computeCharLCS = (a: string, b: string): string => {
    const m = a.length;
    const n = b.length;
    
    // 优化：如果字符串太长，使用简化算法
    if (m * n > 100000) {
      return '';
    }
    
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    // 回溯找出 LCS
    let lcs = '';
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        lcs = a[i - 1] + lcs;
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    
    return lcs;
  };

  // 计算字符级别差异
  const computeCharDiffs = (leftStr: string, rightStr: string): { leftDiffs: CharDiff[]; rightDiffs: CharDiff[] } => {
    const lcs = computeCharLCS(leftStr, rightStr);
    
    const leftDiffs: CharDiff[] = [];
    const rightDiffs: CharDiff[] = [];
    
    let li = 0, ri = 0, lcsIdx = 0;
    
    while (li < leftStr.length || ri < rightStr.length) {
      // 收集左侧删除的字符
      let removedChars = '';
      while (li < leftStr.length && (lcsIdx >= lcs.length || leftStr[li] !== lcs[lcsIdx])) {
        removedChars += leftStr[li];
        li++;
      }
      if (removedChars) {
        leftDiffs.push({ type: 'removed', text: removedChars });
      }
      
      // 收集右侧新增的字符
      let addedChars = '';
      while (ri < rightStr.length && (lcsIdx >= lcs.length || rightStr[ri] !== lcs[lcsIdx])) {
        addedChars += rightStr[ri];
        ri++;
      }
      if (addedChars) {
        rightDiffs.push({ type: 'added', text: addedChars });
      }
      
      // 收集相同的字符
      let equalChars = '';
      while (lcsIdx < lcs.length && li < leftStr.length && ri < rightStr.length &&
             leftStr[li] === lcs[lcsIdx] && rightStr[ri] === lcs[lcsIdx]) {
        equalChars += leftStr[li];
        li++;
        ri++;
        lcsIdx++;
      }
      if (equalChars) {
        leftDiffs.push({ type: 'equal', text: equalChars });
        rightDiffs.push({ type: 'equal', text: equalChars });
      }
    }
    
    return { leftDiffs, rightDiffs };
  };

  // 执行对比
  const performCompare = () => {
    if (!leftText && !rightText) {
      setDiffResult(null);
      return;
    }

    const processedLeft = preprocessText(leftText);
    const processedRight = preprocessText(rightText);
    
    let leftLines = processedLeft.split('\n');
    let rightLines = processedRight.split('\n');
    
    if (ignoreEmptyLines) {
      leftLines = leftLines.filter(l => l.trim());
      rightLines = rightLines.filter(l => l.trim());
    }

    // 使用 LCS (最长公共子序列) 算法进行对比
    const lcs = computeLCS(leftLines, rightLines);
    
    const leftResult: Array<{ type: 'equal' | 'removed' | 'modified'; text: string; lineNum: number; charDiffs?: CharDiff[] }> = [];
    const rightResult: Array<{ type: 'equal' | 'added' | 'modified'; text: string; lineNum: number; charDiffs?: CharDiff[] }> = [];
    
    let leftIdx = 0;
    let rightIdx = 0;
    let lcsIdx = 0;
    let leftLineNum = 1;
    let rightLineNum = 1;
    
    let stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };

    while (leftIdx < leftLines.length || rightIdx < rightLines.length) {
      if (lcsIdx < lcs.length && leftIdx < leftLines.length && leftLines[leftIdx] === lcs[lcsIdx] &&
          rightIdx < rightLines.length && rightLines[rightIdx] === lcs[lcsIdx]) {
        // 相同行
        leftResult.push({ type: 'equal', text: leftLines[leftIdx], lineNum: leftLineNum++ });
        rightResult.push({ type: 'equal', text: rightLines[rightIdx], lineNum: rightLineNum++ });
        leftIdx++;
        rightIdx++;
        lcsIdx++;
        stats.unchanged++;
      } else if (leftIdx < leftLines.length && (lcsIdx >= lcs.length || leftLines[leftIdx] !== lcs[lcsIdx])) {
        // 左侧有删除的行
        leftResult.push({ type: 'removed', text: leftLines[leftIdx], lineNum: leftLineNum++ });
        leftIdx++;
        stats.removed++;
      } else if (rightIdx < rightLines.length && (lcsIdx >= lcs.length || rightLines[rightIdx] !== lcs[lcsIdx])) {
        // 右侧有新增的行
        rightResult.push({ type: 'added', text: rightLines[rightIdx], lineNum: rightLineNum++ });
        rightIdx++;
        stats.added++;
      }
    }

    // 对齐左右结果，并计算字符级别差异
    const alignedLeft: typeof leftResult = [];
    const alignedRight: typeof rightResult = [];
    
    let li = 0, ri = 0;
    while (li < leftResult.length || ri < rightResult.length) {
      const leftItem = leftResult[li];
      const rightItem = rightResult[ri];
      
      if (leftItem?.type === 'equal' && rightItem?.type === 'equal') {
        alignedLeft.push(leftItem);
        alignedRight.push(rightItem);
        li++;
        ri++;
      } else if (leftItem?.type === 'removed' && rightItem?.type === 'added') {
        // 同时有删除和新增，计算字符级别差异
        if (compareMode === 'char' || compareMode === 'word') {
          const { leftDiffs, rightDiffs } = computeCharDiffs(leftItem.text, rightItem.text);
          alignedLeft.push({ ...leftItem, type: 'modified', charDiffs: leftDiffs });
          alignedRight.push({ ...rightItem, type: 'modified', charDiffs: rightDiffs });
        } else {
          alignedLeft.push(leftItem);
          alignedRight.push(rightItem);
        }
        li++;
        ri++;
      } else if (leftItem?.type === 'removed') {
        alignedLeft.push(leftItem);
        alignedRight.push({ type: 'added', text: '', lineNum: -1 }); // 占位
        li++;
      } else if (rightItem?.type === 'added') {
        alignedLeft.push({ type: 'removed', text: '', lineNum: -1 }); // 占位
        alignedRight.push(rightItem);
        ri++;
      } else {
        if (leftItem) {
          alignedLeft.push(leftItem);
          li++;
        }
        if (rightItem) {
          alignedRight.push(rightItem);
          ri++;
        }
      }
    }

    setDiffResult({
      left: alignedLeft,
      right: alignedRight,
      stats,
    });
  };

  // LCS 算法
  const computeLCS = (a: string[], b: string[]): string[] => {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    // 回溯找出 LCS
    const lcs: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        lcs.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    
    return lcs;
  };

  // 同步滚动处理
  const handleScroll = (source: 'left' | 'right' | 'diff') => {
    if (!syncScroll || isScrolling.current) return;
    
    isScrolling.current = true;
    
    const sourceRef = source === 'left' ? leftRef : source === 'right' ? rightRef : diffRef;
    const scrollTop = sourceRef.current?.scrollTop || 0;
    
    if (source !== 'left' && leftRef.current) {
      leftRef.current.scrollTop = scrollTop;
    }
    if (source !== 'right' && rightRef.current) {
      rightRef.current.scrollTop = scrollTop;
    }
    if (source !== 'diff' && diffRef.current) {
      diffRef.current.scrollTop = scrollTop;
    }
    
    setTimeout(() => {
      isScrolling.current = false;
    }, 50);
  };

  // 渲染字符级别差异
  const renderCharDiffs = (diffs: CharDiff[], side: 'left' | 'right') => {
    return diffs.map((diff, idx) => {
      let style: React.CSSProperties = {};
      
      if (diff.type === 'removed') {
        style = { 
          backgroundColor: '#ffc0c0', 
          color: '#a00',
          textDecoration: side === 'left' ? 'line-through' : 'none',
        };
      } else if (diff.type === 'added') {
        style = { 
          backgroundColor: '#c0ffc0', 
          color: '#080',
          fontWeight: 500,
        };
      }
      
      return (
        <span key={idx} style={style}>
          {diff.text}
        </span>
      );
    });
  };

  // 渲染差异行
  const renderDiffLine = (item: { type: string; text: string; lineNum: number; charDiffs?: CharDiff[] }, side: 'left' | 'right') => {
    const bgColors: Record<string, string> = {
      equal: 'transparent',
      removed: '#ffebe9',
      added: '#e6ffec',
      modified: '#fffbdd',
    };
    
    const textColors: Record<string, string> = {
      equal: 'inherit',
      removed: '#cf222e',
      added: '#1a7f37',
      modified: 'inherit',
    };

    // 占位行（空行）使用更浅的背景
    const isPlaceholder = item.lineNum < 0;
    const actualBgColor = isPlaceholder ? '#f8f8f8' : bgColors[item.type];

    const lineNumStyle: React.CSSProperties = {
      width: 40,
      minWidth: 40,
      textAlign: 'right',
      paddingRight: 8,
      color: '#6e7781',
      fontSize: 12,
      userSelect: 'none',
      borderRight: '1px solid #d0d7de',
      background: isPlaceholder ? '#f8f8f8' : (item.type === 'equal' ? '#f6f8fa' : actualBgColor),
    };

    const contentStyle: React.CSSProperties = {
      flex: 1,
      padding: '2px 8px',
      background: actualBgColor,
      color: item.charDiffs ? 'inherit' : textColors[item.type],
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      fontFamily: 'monospace',
      fontSize: 13,
      minHeight: 22,
    };

    return (
      <div style={{ display: 'flex', borderBottom: '1px solid #eaecef' }}>
        <div style={lineNumStyle}>
          {item.lineNum > 0 ? item.lineNum : ''}
        </div>
        <div style={contentStyle}>
          {item.charDiffs ? (
            renderCharDiffs(item.charDiffs, side)
          ) : (
            item.text || '\u00A0'
          )}
        </div>
      </div>
    );
  };

  // 清空
  const clearAll = () => {
    setLeftText('');
    setRightText('');
    setDiffResult(null);
  };

  // 交换左右
  const swapTexts = () => {
    const temp = leftText;
    setLeftText(rightText);
    setRightText(temp);
    setDiffResult(null);
  };

  // 复制差异报告
  const copyDiffReport = () => {
    if (!diffResult) return;
    
    let report = '=== 文本对比报告 ===\n\n';
    report += `统计: 新增 ${diffResult.stats.added} 行, 删除 ${diffResult.stats.removed} 行, 未变 ${diffResult.stats.unchanged} 行\n\n`;
    report += '--- 左侧文本 ---\n';
    diffResult.left.forEach(item => {
      if (item.lineNum > 0) {
        const prefix = item.type === 'removed' ? '- ' : item.type === 'modified' ? '~ ' : '  ';
        report += `${prefix}${item.lineNum}: ${item.text}\n`;
      }
    });
    report += '\n+++ 右侧文本 +++\n';
    diffResult.right.forEach(item => {
      if (item.lineNum > 0) {
        const prefix = item.type === 'added' ? '+ ' : item.type === 'modified' ? '~ ' : '  ';
        report += `${prefix}${item.lineNum}: ${item.text}\n`;
      }
    });
    
    navigator.clipboard.writeText(report);
    message.success('差异报告已复制');
  };

  return (
    <div style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={3}>
            <Text strong>文本格式</Text>
            <Select
              value={textFormat}
              onChange={setTextFormat}
              style={{ width: '100%', marginTop: 4 }}
              size="small"
            >
              <Select.Option value="plain">纯文本</Select.Option>
              <Select.Option value="json">JSON</Select.Option>
              <Select.Option value="xml">XML/HTML</Select.Option>
              <Select.Option value="csv">CSV</Select.Option>
            </Select>
          </Col>
          <Col span={3}>
            <Text strong>对比模式</Text>
            <Select
              value={compareMode}
              onChange={setCompareMode}
              style={{ width: '100%', marginTop: 4 }}
              size="small"
            >
              <Select.Option value="line">按行对比</Select.Option>
              <Select.Option value="word">按词对比</Select.Option>
              <Select.Option value="char">按字符对比</Select.Option>
            </Select>
          </Col>
          <Col span={10}>
            <div style={{ marginTop: 20 }}>
              <Space wrap>
                <Checkbox checked={ignoreCase} onChange={e => setIgnoreCase(e.target.checked)}>
                  忽略大小写
                </Checkbox>
                <Checkbox checked={ignoreWhitespace} onChange={e => setIgnoreWhitespace(e.target.checked)}>
                  忽略空白
                </Checkbox>
                <Checkbox checked={ignoreEmptyLines} onChange={e => setIgnoreEmptyLines(e.target.checked)}>
                  忽略空行
                </Checkbox>
                <Checkbox checked={syncScroll} onChange={e => setSyncScroll(e.target.checked)}>
                  同步滚动
                </Checkbox>
              </Space>
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Space>
              <Button type="primary" onClick={performCompare} icon={<DiffOutlined />}>
                开始对比
              </Button>
              <Button onClick={swapTexts} icon={<SwapOutlined />}>
                交换
              </Button>
              <Button onClick={clearAll} icon={<ClearOutlined />}>
                清空
              </Button>
              {diffResult && (
                <Button onClick={copyDiffReport} icon={<CopyOutlined />}>
                  复制报告
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 统计信息 */}
      {diffResult && (
        <div style={{ marginBottom: 8, padding: '8px 12px', background: '#f6f8fa', borderRadius: 4 }}>
          <Space size="large">
            <Text>
              <span style={{ color: '#1a7f37' }}>● 新增: {diffResult.stats.added} 行</span>
            </Text>
            <Text>
              <span style={{ color: '#cf222e' }}>● 删除: {diffResult.stats.removed} 行</span>
            </Text>
            <Text>
              <span style={{ color: '#6e7781' }}>● 未变: {diffResult.stats.unchanged} 行</span>
            </Text>
          </Space>
        </div>
      )}

      {/* 三栏布局：左侧输入 | 差异视图 | 右侧输入 */}
      <div style={{ flex: 1, display: 'flex', gap: 8, minHeight: 0 }}>
        {/* 左侧文本输入 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong>原始文本 (左)</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {leftText.split('\n').length} 行
            </Text>
          </div>
          {!diffResult ? (
            <TextArea
              value={leftText}
              onChange={e => setLeftText(e.target.value)}
              placeholder="粘贴或输入原始文本..."
              style={{ 
                flex: 1, 
                fontFamily: 'monospace', 
                fontSize: 13,
                resize: 'none',
              }}
            />
          ) : (
            <div
              ref={leftRef}
              onScroll={() => handleScroll('left')}
              style={{
                flex: 1,
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                overflow: 'auto',
                background: '#fff',
              }}
            >
              {diffResult.left.map((item, idx) => (
                <div key={idx}>{renderDiffLine(item, 'left')}</div>
              ))}
            </div>
          )}
        </div>

        {/* 中间差异视图 */}
        {diffResult && (
          <div style={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Text strong style={{ marginBottom: 4, fontSize: 12 }}>差异</Text>
            <div
              ref={diffRef}
              onScroll={() => handleScroll('diff')}
              style={{
                flex: 1,
                width: '100%',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                overflow: 'auto',
                background: '#f6f8fa',
              }}
            >
              {diffResult.left.map((leftItem, idx) => {
                const rightItem = diffResult.right[idx];
                let indicator = '';
                let color = '#6e7781';
                
                // 只有当左右两边都有实际内容时才显示指示器
                const leftHasContent = leftItem.lineNum > 0;
                const rightHasContent = rightItem?.lineNum > 0;
                
                if (leftItem.type === 'modified' || rightItem?.type === 'modified') {
                  indicator = '≠';
                  color = '#9a6700';
                } else if (leftItem.type === 'removed' && leftHasContent) {
                  indicator = '◀';
                  color = '#cf222e';
                } else if (rightItem?.type === 'added' && rightHasContent) {
                  indicator = '▶';
                  color = '#1a7f37';
                } else if (leftItem.type === 'equal' && leftHasContent) {
                  indicator = '';
                }
                
                return (
                  <div
                    key={idx}
                    style={{
                      height: 25,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottom: '1px solid #eaecef',
                      color,
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {indicator}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 右侧文本输入 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong>修改文本 (右)</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {rightText.split('\n').length} 行
            </Text>
          </div>
          {!diffResult ? (
            <TextArea
              value={rightText}
              onChange={e => setRightText(e.target.value)}
              placeholder="粘贴或输入修改后的文本..."
              style={{ 
                flex: 1, 
                fontFamily: 'monospace', 
                fontSize: 13,
                resize: 'none',
              }}
            />
          ) : (
            <div
              ref={rightRef}
              onScroll={() => handleScroll('right')}
              style={{
                flex: 1,
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                overflow: 'auto',
                background: '#fff',
              }}
            >
              {diffResult.right.map((item, idx) => (
                <div key={idx}>{renderDiffLine(item, 'right')}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 返回编辑按钮 */}
      {diffResult && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Button onClick={() => setDiffResult(null)}>
            返回编辑
          </Button>
        </div>
      )}
    </div>
  );
};

// 网址批量打开工具
const BatchUrlTool: React.FC = () => {
  const [urls, setUrls] = useState('');
  const [delay, setDelay] = useState(500);
  const [opening, setOpening] = useState(false);

  const parseUrls = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(url => {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return 'https://' + url;
        }
        return url;
      });
  };

  const urlList = parseUrls(urls);

  const openUrls = async () => {
    if (urlList.length === 0) {
      message.warning('请输入至少一个网址');
      return;
    }
    setOpening(true);
    for (let i = 0; i < urlList.length; i++) {
      window.open(urlList[i], '_blank');
      if (i < urlList.length - 1 && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    setOpening(false);
    message.success(`已打开 ${urlList.length} 个网址`);
  };

  const exampleUrls = `https://www.google.com
https://www.github.com
https://www.stackoverflow.com
baidu.com
bing.com`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text type="secondary">打开间隔:</Text>
        <Select value={delay} onChange={setDelay} style={{ width: 120 }} options={[
          { value: 0, label: '无延迟' },
          { value: 200, label: '200ms' },
          { value: 500, label: '500ms' },
          { value: 1000, label: '1秒' },
          { value: 2000, label: '2秒' },
        ]} />
        <Button type="primary" icon={<GlobalOutlined />} onClick={openUrls} loading={opening} disabled={urlList.length === 0}>
          批量打开 ({urlList.length})
        </Button>
        <Button onClick={() => setUrls(exampleUrls)}>加载示例</Button>
        <Button onClick={() => setUrls('')} icon={<ClearOutlined />}>清空</Button>
      </div>
      <Row gutter={16} style={{ flex: 1 }}>
        <Col span={12} style={{ display: 'flex', flexDirection: 'column' }}>
          <Text strong>输入网址（每行一个）</Text>
          <TextArea
            value={urls}
            onChange={e => setUrls(e.target.value)}
            placeholder={`输入网址，每行一个，例如：\nhttps://www.google.com\nwww.github.com\nbaidu.com`}
            style={{ flex: 1, fontFamily: 'monospace', marginTop: 8 }}
          />
        </Col>
        <Col span={12} style={{ display: 'flex', flexDirection: 'column' }}>
          <Text strong>解析结果预览 ({urlList.length} 个)</Text>
          <div style={{ flex: 1, marginTop: 8, border: '1px solid #d9d9d9', borderRadius: 6, padding: 12, overflow: 'auto', background: '#fafafa' }}>
            {urlList.length === 0 ? (
              <Text type="secondary">暂无网址</Text>
            ) : (
              urlList.map((url, idx) => (
                <div key={idx} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="blue">{idx + 1}</Tag>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>{url}</a>
                </div>
              ))
            )}
          </div>
        </Col>
      </Row>
      <div style={{ marginTop: 12, color: '#999', fontSize: 12 }}>
        提示：自动补全 https:// 前缀 | 浏览器可能会阻止弹窗，请允许本站弹窗权限
      </div>
    </div>
  );
};

// 单位换算数据
const unitCategories = {
  length: {
    name: '长度',
    units: [
      { id: 'km', name: '千米', factor: 1000 },
      { id: 'm', name: '米', factor: 1 },
      { id: 'dm', name: '分米', factor: 0.1 },
      { id: 'cm', name: '厘米', factor: 0.01 },
      { id: 'mm', name: '毫米', factor: 0.001 },
      { id: 'um', name: '微米', factor: 0.000001 },
      { id: 'nm', name: '纳米', factor: 0.000000001 },
      { id: 'mi', name: '英里', factor: 1609.344 },
      { id: 'yd', name: '码', factor: 0.9144 },
      { id: 'ft', name: '英尺', factor: 0.3048 },
      { id: 'in', name: '英寸', factor: 0.0254 },
      { id: 'nmi', name: '海里', factor: 1852 },
      { id: 'li', name: '里', factor: 500 },
      { id: 'zhang', name: '丈', factor: 3.33333 },
      { id: 'chi', name: '尺', factor: 0.33333 },
      { id: 'cun', name: '寸', factor: 0.03333 },
    ],
  },
  weight: {
    name: '重量',
    units: [
      { id: 't', name: '吨', factor: 1000000 },
      { id: 'kg', name: '千克', factor: 1000 },
      { id: 'g', name: '克', factor: 1 },
      { id: 'mg', name: '毫克', factor: 0.001 },
      { id: 'ug', name: '微克', factor: 0.000001 },
      { id: 'lb', name: '磅', factor: 453.59237 },
      { id: 'oz', name: '盎司', factor: 28.349523 },
      { id: 'ct', name: '克拉', factor: 0.2 },
      { id: 'jin', name: '斤', factor: 500 },
      { id: 'liang', name: '两', factor: 50 },
      { id: 'qian', name: '钱', factor: 5 },
    ],
  },
  area: {
    name: '面积',
    units: [
      { id: 'km2', name: '平方千米', factor: 1000000 },
      { id: 'ha', name: '公顷', factor: 10000 },
      { id: 'm2', name: '平方米', factor: 1 },
      { id: 'dm2', name: '平方分米', factor: 0.01 },
      { id: 'cm2', name: '平方厘米', factor: 0.0001 },
      { id: 'mm2', name: '平方毫米', factor: 0.000001 },
      { id: 'mi2', name: '平方英里', factor: 2589988.11 },
      { id: 'ac', name: '英亩', factor: 4046.8564 },
      { id: 'ft2', name: '平方英尺', factor: 0.092903 },
      { id: 'in2', name: '平方英寸', factor: 0.00064516 },
      { id: 'mu', name: '亩', factor: 666.6667 },
      { id: 'qing', name: '顷', factor: 66666.67 },
    ],
  },
  volume: {
    name: '体积',
    units: [
      { id: 'm3', name: '立方米', factor: 1000 },
      { id: 'dm3', name: '立方分米', factor: 1 },
      { id: 'cm3', name: '立方厘米', factor: 0.001 },
      { id: 'mm3', name: '立方毫米', factor: 0.000001 },
      { id: 'l', name: '升', factor: 1 },
      { id: 'ml', name: '毫升', factor: 0.001 },
      { id: 'gal', name: '加仑(美)', factor: 3.78541 },
      { id: 'qt', name: '夸脱(美)', factor: 0.946353 },
      { id: 'pt', name: '品脱(美)', factor: 0.473176 },
      { id: 'floz', name: '液体盎司(美)', factor: 0.0295735 },
      { id: 'ft3', name: '立方英尺', factor: 28.3168 },
      { id: 'in3', name: '立方英寸', factor: 0.0163871 },
    ],
  },
  temperature: {
    name: '温度',
    units: [
      { id: 'c', name: '摄氏度 °C', factor: 1 },
      { id: 'f', name: '华氏度 °F', factor: 1 },
      { id: 'k', name: '开尔文 K', factor: 1 },
    ],
  },
  speed: {
    name: '速度',
    units: [
      { id: 'mps', name: '米/秒', factor: 1 },
      { id: 'kmph', name: '千米/时', factor: 0.277778 },
      { id: 'mph', name: '英里/时', factor: 0.44704 },
      { id: 'kn', name: '节', factor: 0.514444 },
      { id: 'mach', name: '马赫', factor: 340.29 },
      { id: 'c', name: '光速', factor: 299792458 },
    ],
  },
  time: {
    name: '时间',
    units: [
      { id: 'y', name: '年', factor: 31536000 },
      { id: 'mo', name: '月(30天)', factor: 2592000 },
      { id: 'w', name: '周', factor: 604800 },
      { id: 'd', name: '天', factor: 86400 },
      { id: 'h', name: '小时', factor: 3600 },
      { id: 'min', name: '分钟', factor: 60 },
      { id: 's', name: '秒', factor: 1 },
      { id: 'ms', name: '毫秒', factor: 0.001 },
      { id: 'us', name: '微秒', factor: 0.000001 },
      { id: 'ns', name: '纳秒', factor: 0.000000001 },
    ],
  },
  storage: {
    name: '存储',
    units: [
      { id: 'bit', name: '比特', factor: 1 },
      { id: 'b', name: '字节', factor: 8 },
      { id: 'kb', name: 'KB', factor: 8 * 1024 },
      { id: 'mb', name: 'MB', factor: 8 * 1024 * 1024 },
      { id: 'gb', name: 'GB', factor: 8 * 1024 * 1024 * 1024 },
      { id: 'tb', name: 'TB', factor: 8 * 1024 * 1024 * 1024 * 1024 },
      { id: 'pb', name: 'PB', factor: 8 * 1024 * 1024 * 1024 * 1024 * 1024 },
      { id: 'kib', name: 'KiB (1024)', factor: 8 * 1024 },
      { id: 'mib', name: 'MiB (1024)', factor: 8 * 1048576 },
      { id: 'gib', name: 'GiB (1024)', factor: 8 * 1073741824 },
    ],
  },
};

// 单位换算工具
const UnitConvertTool: React.FC = () => {
  const [category, setCategory] = useState<keyof typeof unitCategories>('length');
  const [fromUnit, setFromUnit] = useState('in');
  const [toUnit, setToUnit] = useState('cm');
  const [inputValue, setInputValue] = useState('1');
  const [precision, setPrecision] = useState(6);

  // 每个分类的默认单位
  const defaultUnits: Record<string, { from: string; to: string }> = {
    length: { from: 'in', to: 'cm' },
    weight: { from: 'lb', to: 'g' },
    area: { from: 'm2', to: 'ft2' },
    volume: { from: 'l', to: 'ml' },
    temperature: { from: 'c', to: 'f' },
    speed: { from: 'kmph', to: 'mph' },
    time: { from: 'h', to: 'min' },
    storage: { from: 'mb', to: 'gb' },
  };

  const currentCategory = unitCategories[category];
  const units = currentCategory.units;

  // 温度特殊处理
  const convertTemperature = (value: number, from: string, to: string): number => {
    let celsius: number;
    if (from === 'c') celsius = value;
    else if (from === 'f') celsius = (value - 32) * 5 / 9;
    else celsius = value - 273.15; // kelvin
    
    if (to === 'c') return celsius;
    if (to === 'f') return celsius * 9 / 5 + 32;
    return celsius + 273.15; // kelvin
  };

  const convert = (value: number, from: string, to: string): number => {
    if (category === 'temperature') {
      return convertTemperature(value, from, to);
    }
    const fromFactor = units.find(u => u.id === from)?.factor || 1;
    const toFactor = units.find(u => u.id === to)?.factor || 1;
    return (value * fromFactor) / toFactor;
  };

  const numValue = parseFloat(inputValue) || 0;
  const result = convert(numValue, fromUnit, toUnit);

  // 计算所有单位的换算结果
  const allResults = units.map(unit => ({
    ...unit,
    value: convert(numValue, fromUnit, unit.id),
  }));

  // 切换分类时重置单位
  React.useEffect(() => {
    const defaults = defaultUnits[category];
    if (defaults) {
      setFromUnit(defaults.from);
      setToUnit(defaults.to);
    } else {
      const newUnits = unitCategories[category].units;
      setFromUnit(newUnits[0]?.id || '');
      setToUnit(newUnits[1]?.id || newUnits[0]?.id || '');
    }
  }, [category]);

  const swapUnits = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  const formatNumber = (num: number): string => {
    if (Math.abs(num) < 0.000001 || Math.abs(num) > 999999999) {
      return num.toExponential(precision);
    }
    return parseFloat(num.toPrecision(precision + 2)).toString();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 分类选择 */}
      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          {Object.entries(unitCategories).map(([key, cat]) => (
            <Button
              key={key}
              type={category === key ? 'primary' : 'default'}
              onClick={() => setCategory(key as keyof typeof unitCategories)}
            >
              {cat.name}
            </Button>
          ))}
        </Space>
      </div>

      {/* 换算器 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Input
              size="large"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              type="number"
              addonAfter={
                <Select value={fromUnit} onChange={setFromUnit} style={{ width: 120 }}>
                  {units.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
                </Select>
              }
            />
          </Col>
          <Col span={2} style={{ textAlign: 'center' }}>
            <Button icon={<SwapOutlined />} onClick={swapUnits} />
          </Col>
          <Col span={8}>
            <Input
              size="large"
              value={formatNumber(result)}
              readOnly
              style={{ background: '#f5f5f5' }}
              addonAfter={
                <Select value={toUnit} onChange={setToUnit} style={{ width: 120 }}>
                  {units.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
                </Select>
              }
            />
          </Col>
          <Col span={6}>
            <Space>
              <Text type="secondary">精度:</Text>
              <Select value={precision} onChange={setPrecision} style={{ width: 70 }}>
                {[2, 4, 6, 8, 10].map(p => <Select.Option key={p} value={p}>{p}位</Select.Option>)}
              </Select>
              <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(formatNumber(result)); message.success('已复制'); }}>
                复制
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 所有单位换算结果 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Text strong>所有单位换算结果</Text>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {allResults.map(item => (
            <Card
              key={item.id}
              size="small"
              style={{ cursor: 'pointer' }}
              onClick={() => { navigator.clipboard.writeText(formatNumber(item.value)); message.success(`已复制 ${item.name}`); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">{item.name}</Text>
                <Text strong style={{ fontFamily: 'monospace' }}>{formatNumber(item.value)}</Text>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, color: '#999', fontSize: 12 }}>
        点击卡片可复制对应数值
      </div>
    </div>
  );
};

// OpenMoji Emoji 数据类型
interface OpenMojiEmoji {
  emoji: string;
  hexcode: string;
  group: string;
  subgroups: string;
  annotation: string;
  tags: string;
  openmoji_tags: string;
  skintone: string;
  skintone_base_hexcode: string;
}

// Emoji 分类映射（中英文）
const emojiCategories: Record<string, { name: string; icon: string }> = {
  'smileys-emotion': { name: '表情', icon: '😀' },
  'people-body': { name: '人物', icon: '👤' },
  'animals-nature': { name: '动物自然', icon: '🐱' },
  'food-drink': { name: '食物饮料', icon: '🍔' },
  'travel-places': { name: '旅行地点', icon: '✈️' },
  'activities': { name: '活动', icon: '⚽' },
  'objects': { name: '物品', icon: '💡' },
  'symbols': { name: '符号', icon: '❤️' },
  'flags': { name: '旗帜', icon: '🏳️' },
  'extras-openmoji': { name: 'OpenMoji扩展', icon: '🎨' },
  'extras-unicode': { name: 'Unicode扩展', icon: '🔣' },
};

// 肤色选项
const skinTones = [
  { value: '', label: '默认', color: '#FCEA2B' },
  { value: '1F3FB', label: '浅肤色', color: '#FADCBC' },
  { value: '1F3FC', label: '中浅肤色', color: '#E0BB95' },
  { value: '1F3FD', label: '中等肤色', color: '#BF8F68' },
  { value: '1F3FE', label: '中深肤色', color: '#9B643D' },
  { value: '1F3FF', label: '深肤色', color: '#594539' },
];

// Emoji 工具组件
const EmojiTool: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('emoji-favorites') || '[]'); } catch { return []; }
  });
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('emoji-recent') || '[]'); } catch { return []; }
  });
  const [imageStyle, setImageStyle] = useState<'color' | 'black'>('color');
  const [viewSize, setViewSize] = useState<number>(48);
  const [activeTab, setActiveTab] = useState<'browse' | 'favorites' | 'recent' | 'editor'>('browse');
  const [selectedEmoji, setSelectedEmoji] = useState<OpenMojiEmoji | null>(null);
  const [selectedSkinTone, setSelectedSkinTone] = useState<string>('');
  
  // 编辑器状态
  const [editorEmojis, setEditorEmojis] = useState<Array<{ emoji: OpenMojiEmoji; x: number; y: number; scale: number; rotation: number; }>>([]);
  const [editorBgColor, setEditorBgColor] = useState('#ffffff');
  const [editorSize, setEditorSize] = useState(256);

  const allEmojis: OpenMojiEmoji[] = openmojiData as OpenMojiEmoji[];

  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    allEmojis.forEach(e => cats.add(e.group));
    return Array.from(cats);
  }, [allEmojis]);

  const getSkintoneVariant = (emoji: OpenMojiEmoji, skinTone: string): string => {
    if (!skinTone || !emoji.skintone_base_hexcode) return emoji.hexcode;
    const variant = allEmojis.find(e => e.skintone_base_hexcode === emoji.hexcode && e.skintone === skinTone);
    return variant ? variant.hexcode : emoji.hexcode;
  };

  const filteredEmojis = React.useMemo(() => {
    let result = allEmojis.filter(e => !e.skintone);
    if (selectedCategory !== 'all') result = result.filter(e => e.group === selectedCategory);
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      result = result.filter(e => 
        e.emoji.includes(search) || e.annotation.toLowerCase().includes(search) ||
        e.tags.toLowerCase().includes(search) || e.openmoji_tags.toLowerCase().includes(search) ||
        e.hexcode.toLowerCase().includes(search)
      );
    }
    return result;
  }, [allEmojis, selectedCategory, searchText]);

  const favoriteEmojis = React.useMemo(() => allEmojis.filter(e => favorites.includes(e.hexcode) && !e.skintone), [allEmojis, favorites]);
  const recentEmojiList = React.useMemo(() => recentEmojis.map(hex => allEmojis.find(e => e.hexcode === hex)).filter(Boolean) as OpenMojiEmoji[], [allEmojis, recentEmojis]);
  const hasSkinToneVariants = (emoji: OpenMojiEmoji): boolean => allEmojis.some(e => e.skintone_base_hexcode === emoji.hexcode);
  const getEmojiSvgUrl = (hexcode: string): string => `./openmoji/${imageStyle}/${hexcode}.svg`;

  const saveFavorites = (newFavorites: string[]) => {
    setFavorites(newFavorites);
    localStorage.setItem('emoji-favorites', JSON.stringify(newFavorites));
  };

  const saveRecent = (hexcode: string) => {
    const newRecent = [hexcode, ...recentEmojis.filter(h => h !== hexcode)].slice(0, 50);
    setRecentEmojis(newRecent);
    localStorage.setItem('emoji-recent', JSON.stringify(newRecent));
  };

  const toggleFavorite = (hexcode: string) => {
    saveFavorites(favorites.includes(hexcode) ? favorites.filter(h => h !== hexcode) : [...favorites, hexcode]);
  };

  const copyEmoji = (emoji: OpenMojiEmoji) => {
    navigator.clipboard.writeText(emoji.emoji);
    message.success(`已复制 ${emoji.emoji}`);
    saveRecent(emoji.hexcode);
  };

  const downloadSvg = async (emoji: OpenMojiEmoji) => {
    const hexcode = getSkintoneVariant(emoji, selectedSkinTone);
    try {
      const response = await fetch(getEmojiSvgUrl(hexcode));
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${hexcode}.svg`;
      link.click();
      URL.revokeObjectURL(link.href);
      message.success('下载成功');
      saveRecent(emoji.hexcode);
    } catch { message.error('下载失败'); }
  };

  const downloadPng = async (emoji: OpenMojiEmoji, size: number = 512) => {
    const hexcode = getSkintoneVariant(emoji, selectedSkinTone);
    try {
      const response = await fetch(getEmojiSvgUrl(hexcode));
      const svgText = await response.text();
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      const img = new Image();
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      const svgUrl = URL.createObjectURL(svgBlob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => { ctx.drawImage(img, 0, 0, size, size); URL.revokeObjectURL(svgUrl); resolve(); };
        img.onerror = reject;
        img.src = svgUrl;
      });
      canvas.toBlob(blob => {
        if (blob) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${hexcode}.png`;
          link.click();
          URL.revokeObjectURL(link.href);
          message.success('下载成功');
        }
      }, 'image/png');
      saveRecent(emoji.hexcode);
    } catch { message.error('下载失败'); }
  };

  const addToEditor = (emoji: OpenMojiEmoji) => {
    setEditorEmojis(prev => [...prev, { emoji, x: editorSize / 2, y: editorSize / 2, scale: 1, rotation: 0 }]);
    setActiveTab('editor');
    message.success('已添加到编辑器');
  };

  const exportEditorAsPng = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = editorSize; canvas.height = editorSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = editorBgColor;
    ctx.fillRect(0, 0, editorSize, editorSize);
    for (const item of editorEmojis) {
      const hexcode = getSkintoneVariant(item.emoji, selectedSkinTone);
      try {
        const response = await fetch(getEmojiSvgUrl(hexcode));
        const svgText = await response.text();
        const img = new Image();
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
        const svgUrl = URL.createObjectURL(svgBlob);
        await new Promise<void>((resolve) => {
          img.onload = () => {
            ctx.save();
            ctx.translate(item.x, item.y);
            ctx.rotate((item.rotation * Math.PI) / 180);
            ctx.scale(item.scale, item.scale);
            ctx.drawImage(img, -32, -32, 64, 64);
            ctx.restore();
            URL.revokeObjectURL(svgUrl);
            resolve();
          };
          img.src = svgUrl;
        });
      } catch { /* ignore */ }
    }
    canvas.toBlob(blob => {
      if (blob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `emoji-composition-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(link.href);
        message.success('导出成功');
      }
    }, 'image/png');
  };

  const renderEmoji = (emoji: OpenMojiEmoji) => {
    const isFavorite = favorites.includes(emoji.hexcode);
    const hexcode = getSkintoneVariant(emoji, selectedSkinTone);
    const imgUrl = getEmojiSvgUrl(hexcode);
    const supportsSkinTone = hasSkinToneVariants(emoji);
    return (
      <Tooltip key={emoji.hexcode} title={<div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 500 }}>{emoji.annotation}</div><div style={{ fontSize: 12, color: '#999' }}>{emoji.hexcode}</div>{supportsSkinTone && <div style={{ fontSize: 11, color: '#52c41a' }}>支持肤色</div>}</div>}>
        <div style={{ width: viewSize + 16, height: viewSize + 16, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', position: 'relative', transition: 'all 0.2s', border: supportsSkinTone ? '2px solid #52c41a33' : '1px solid transparent' }} className="emoji-item" onClick={() => setSelectedEmoji(emoji)} onDoubleClick={() => copyEmoji(emoji)}>
          <img src={imgUrl} alt={emoji.annotation} style={{ width: viewSize, height: viewSize }} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          {isFavorite && <HeartFilled style={{ position: 'absolute', top: 2, right: 2, color: '#ff4d4f', fontSize: 12 }} />}
        </div>
      </Tooltip>
    );
  };

  const renderDetailPanel = () => {
    if (!selectedEmoji) return null;
    const hexcode = getSkintoneVariant(selectedEmoji, selectedSkinTone);
    const imgUrl = getEmojiSvgUrl(hexcode);
    const supportsSkinTone = hasSkinToneVariants(selectedEmoji);
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <img src={imgUrl} alt={selectedEmoji.annotation} style={{ width: 80, height: 80 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{selectedEmoji.annotation}</div>
            <div style={{ color: '#666', marginTop: 4 }}>
              <Tag>{hexcode}</Tag>
              <Tag color="blue">{emojiCategories[selectedEmoji.group]?.name || selectedEmoji.group}</Tag>
              {supportsSkinTone && <Tag color="green">支持肤色</Tag>}
            </div>
            {supportsSkinTone && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>肤色: </Text>
                <Space size={4}>
                  {skinTones.map(tone => (
                    <Tooltip key={tone.value} title={tone.label}>
                      <div onClick={() => setSelectedSkinTone(tone.value)} style={{ width: 24, height: 24, borderRadius: '50%', background: tone.color, cursor: 'pointer', border: selectedSkinTone === tone.value ? '2px solid #1890ff' : '1px solid #d9d9d9' }} />
                    </Tooltip>
                  ))}
                </Space>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Space wrap size="small">
                <Button size="small" icon={<CopyOutlined />} onClick={() => copyEmoji(selectedEmoji)}>复制字符</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadSvg(selectedEmoji)}>SVG</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadPng(selectedEmoji, 256)}>PNG</Button>
                <Button size="small" icon={<PlusOutlined />} onClick={() => addToEditor(selectedEmoji)}>添加到编辑器</Button>
                <Button size="small" icon={favorites.includes(selectedEmoji.hexcode) ? <HeartFilled style={{ color: '#ff4d4f' }} /> : <HeartOutlined />} onClick={() => toggleFavorite(selectedEmoji.hexcode)}>
                  {favorites.includes(selectedEmoji.hexcode) ? '取消收藏' : '收藏'}
                </Button>
              </Space>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderEditor = () => (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text type="secondary">背景色:</Text>
          <input type="color" value={editorBgColor} onChange={e => setEditorBgColor(e.target.value)} style={{ width: 32, height: 24, cursor: 'pointer' }} />
          <Text type="secondary">画布大小:</Text>
          <Select value={editorSize} onChange={setEditorSize} style={{ width: 100 }} options={[{ value: 128, label: '128px' }, { value: 256, label: '256px' }, { value: 512, label: '512px' }, { value: 1024, label: '1024px' }]} />
          <Button icon={<DownloadOutlined />} onClick={exportEditorAsPng} disabled={editorEmojis.length === 0}>导出 PNG</Button>
          <Button icon={<DeleteOutlined />} onClick={() => setEditorEmojis([])} disabled={editorEmojis.length === 0}>清空</Button>
        </div>
        <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
          <div style={{ width: editorSize, height: editorSize, background: editorBgColor, position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            {editorEmojis.map((item, idx) => {
              const hexcode = getSkintoneVariant(item.emoji, selectedSkinTone);
              return (
                <div key={idx} style={{ position: 'absolute', left: item.x - 32 * item.scale, top: item.y - 32 * item.scale, transform: `rotate(${item.rotation}deg) scale(${item.scale})`, cursor: 'move' }}
                  draggable onDragEnd={(e) => { const rect = e.currentTarget.parentElement?.getBoundingClientRect(); if (rect) setEditorEmojis(prev => prev.map((em, i) => i === idx ? { ...em, x: e.clientX - rect.left, y: e.clientY - rect.top } : em)); }}>
                  <img src={getEmojiSvgUrl(hexcode)} alt={item.emoji.annotation} style={{ width: 64, height: 64 }} />
                  <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => setEditorEmojis(prev => prev.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: -8, right: -8, padding: 0, minWidth: 16, height: 16, fontSize: 10 }} />
                </div>
              );
            })}
            {editorEmojis.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>从左侧选择 emoji 添加到画布</div>}
          </div>
        </div>
      </div>
      <div style={{ width: 200, borderLeft: '1px solid #f0f0f0', paddingLeft: 16 }}>
        <Text strong>已添加的 Emoji</Text>
        <div style={{ marginTop: 8, maxHeight: 400, overflow: 'auto' }}>
          {editorEmojis.map((item, idx) => (
            <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={getEmojiSvgUrl(getSkintoneVariant(item.emoji, selectedSkinTone))} alt={item.emoji.annotation} style={{ width: 32, height: 32 }} />
                <div style={{ flex: 1, fontSize: 12 }}>{item.emoji.annotation}</div>
              </div>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>缩放:</Text>
                <Slider value={item.scale} onChange={v => setEditorEmojis(prev => prev.map((em, i) => i === idx ? { ...em, scale: v } : em))} min={0.5} max={3} step={0.1} />
                <Text type="secondary" style={{ fontSize: 11 }}>旋转:</Text>
                <Slider value={item.rotation} onChange={v => setEditorEmojis(prev => prev.map((em, i) => i === idx ? { ...em, rotation: v } : em))} min={0} max={360} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const displayEmojis = activeTab === 'favorites' ? favoriteEmojis : activeTab === 'recent' ? recentEmojiList : filteredEmojis;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{`.emoji-item:hover { background: #f5f5f5; border-color: #d9d9d9 !important; }`}</style>
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input placeholder="搜索 emoji（支持英文、hexcode）" prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 260 }} allowClear />
        <Select value={selectedCategory} onChange={setSelectedCategory} style={{ width: 140 }} options={[{ value: 'all', label: '全部分类' }, ...categories.map(cat => ({ value: cat, label: `${emojiCategories[cat]?.icon || ''} ${emojiCategories[cat]?.name || cat}` }))]} />
        <Select value={imageStyle} onChange={setImageStyle} style={{ width: 90 }} options={[{ value: 'color', label: '🎨 彩色' }, { value: 'black', label: '⬛ 黑白' }]} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text type="secondary">大小:</Text>
          <Slider value={viewSize} onChange={setViewSize} min={32} max={72} step={8} style={{ width: 80 }} />
        </div>
      </div>
      {selectedEmoji && activeTab !== 'editor' && renderDetailPanel()}
      <Tabs activeKey={activeTab} onChange={key => setActiveTab(key as 'browse' | 'favorites' | 'recent' | 'editor')} size="small" items={[
        { key: 'browse', label: <span><SmileOutlined /> 浏览 ({filteredEmojis.length})</span> },
        { key: 'favorites', label: <span><HeartOutlined /> 收藏 ({favoriteEmojis.length})</span> },
        { key: 'recent', label: <span><ClockCircleOutlined /> 最近 ({recentEmojiList.length})</span> },
        { key: 'editor', label: <span><EditOutlined /> 编辑器 ({editorEmojis.length})</span> },
      ]} />
      {activeTab === 'editor' ? renderEditor() : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'flex-start', padding: 8, background: '#fafafa', borderRadius: 8 }}>
          {displayEmojis.length === 0 ? (
            <div style={{ width: '100%', textAlign: 'center', padding: 40, color: '#999' }}>
              {activeTab === 'favorites' ? '暂无收藏的 emoji' : activeTab === 'recent' ? '暂无最近使用的 emoji' : '未找到匹配的 emoji'}
            </div>
          ) : displayEmojis.slice(0, 500).map(emoji => renderEmoji(emoji))}
          {displayEmojis.length > 500 && <div style={{ width: '100%', textAlign: 'center', padding: 16, color: '#999' }}>显示前 500 个结果，请使用搜索缩小范围</div>}
        </div>
      )}
      <div style={{ marginTop: 8, color: '#999', fontSize: 12, textAlign: 'center' }}>
        单击选中查看详情，双击复制字符 | 数据来源: <a href="https://openmoji.org" target="_blank" rel="noopener noreferrer">OpenMoji</a> (CC BY-SA 4.0)
      </div>
    </div>
  );
};

export default ToolboxPanel;
