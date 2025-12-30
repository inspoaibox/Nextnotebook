import React, { useState } from 'react';
import { Layout, Menu, Card, Input, Button, Space, Typography, message, Tabs, Row, Col, Tooltip, Select, Checkbox } from 'antd';
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
} from '@ant-design/icons';
import { pinyin } from 'pinyin-pro';

const { Content, Sider } = Layout;
const { TextArea } = Input;
const { Text, Title } = Typography;

// 工具分类
type ToolCategory = 'text' | 'code' | 'convert' | 'other';

// 分类图标
const categoryIcons: Record<ToolCategory, React.ReactNode> = {
  text: <FontSizeOutlined />,
  code: <CodeOutlined />,
  convert: <SwapOutlined />,
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
  // 编程工具
  { id: 'json-format', name: 'JSON格式化', icon: <CodeOutlined />, category: 'code' },
  { id: 'base64', name: 'Base64编解码', icon: <LockOutlined />, category: 'code' },
  { id: 'url-encode', name: 'URL编解码', icon: <LinkOutlined />, category: 'code' },
  { id: 'timestamp', name: '时间戳转换', icon: <FieldTimeOutlined />, category: 'code' },
  { id: 'hash', name: 'Hash计算', icon: <KeyOutlined />, category: 'code' },
  { id: 'uuid', name: 'UUID生成', icon: <KeyOutlined />, category: 'code' },
  // 格式转换
  { id: 'md-html', name: 'MD转HTML', icon: <FileTextOutlined />, category: 'convert' },
  // 其他工具
  { id: 'qrcode', name: '二维码生成', icon: <QrcodeOutlined />, category: 'other' },
  { id: 'color', name: '颜色转换', icon: <BgColorsOutlined />, category: 'other' },
];

const categoryNames: Record<ToolCategory, string> = {
  text: '文字处理',
  code: '编程工具',
  convert: '格式转换',
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
      case 'md-html':
        return <MdHtmlTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
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

// 二维码生成工具
const QrcodeTool: React.FC<{ input: string; setInput: (v: string) => void }> = ({ input, setInput }) => {
  const [qrUrl, setQrUrl] = useState('');

  const generate = () => {
    if (!input.trim()) {
      message.warning('请输入内容');
      return;
    }
    // 使用 QR Server API 生成二维码
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(input)}`;
    setQrUrl(url);
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>输入内容</Text>
        <TextArea rows={6} value={input} onChange={e => setInput(e.target.value)} placeholder="输入要生成二维码的文本或链接..." />
        <Button type="primary" onClick={generate} style={{ marginTop: 8 }}>生成二维码</Button>
      </Col>
      <Col span={12}>
        <Text strong>二维码</Text>
        <div style={{ marginTop: 8, padding: 16, background: '#f5f5f5', borderRadius: 8, textAlign: 'center', minHeight: 232 }}>
          {qrUrl ? (
            <img src={qrUrl} alt="QR Code" style={{ maxWidth: '100%' }} />
          ) : (
            <Text type="secondary">点击生成按钮生成二维码</Text>
          )}
        </div>
      </Col>
    </Row>
  );
};

// 颜色转换工具
const ColorTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const [color, setColor] = useState('#1890ff');

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
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

  const convert = () => {
    const rgb = hexToRgb(color);
    if (rgb) {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      setOutput(`HEX: ${color.toUpperCase()}
RGB: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})
RGBA: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)
HSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`);
    }
  };

  React.useEffect(() => {
    convert();
  }, [color]);

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>选择颜色</Text>
        <div style={{ marginTop: 8 }}>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 100, height: 40, cursor: 'pointer' }} />
          <Input value={color} onChange={e => setColor(e.target.value)} style={{ width: 120, marginLeft: 8 }} />
        </div>
        <div style={{ marginTop: 16, width: 200, height: 100, background: color, borderRadius: 8, border: '1px solid #d9d9d9' }} />
      </Col>
      <Col span={12}>
        <Text strong>颜色值</Text>
        <TextArea rows={6} value={output} readOnly style={{ background: '#f5f5f5', fontFamily: 'monospace', marginTop: 8 }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
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

// Markdown 转 HTML 工具
const MdHtmlTool: React.FC<ToolProps> = ({ input, setInput, output, setOutput }) => {
  const convert = () => {
    // 简单的 Markdown 转换
    let html = input
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/!\[(.*?)\]\((.*?)\)/gim, '<img alt="$1" src="$2" />')
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
      .replace(/`(.*?)`/gim, '<code>$1</code>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/\n/gim, '<br />');
    setOutput(html);
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Text strong>Markdown</Text>
        <TextArea rows={14} value={input} onChange={e => setInput(e.target.value)} placeholder="输入 Markdown 文本..." style={{ fontFamily: 'monospace' }} />
        <Button type="primary" onClick={convert} style={{ marginTop: 8 }}>转换</Button>
      </Col>
      <Col span={12}>
        <Text strong>HTML</Text>
        <TextArea rows={14} value={output} readOnly style={{ background: '#f5f5f5', fontFamily: 'monospace' }} />
        <Button onClick={() => navigator.clipboard.writeText(output)} style={{ marginTop: 8 }} icon={<CopyOutlined />}>复制</Button>
      </Col>
    </Row>
  );
};

export default ToolboxPanel;
