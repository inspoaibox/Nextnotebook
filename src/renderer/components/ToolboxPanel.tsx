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
  { id: 'url-extract', name: 'URL提取', icon: <LinkOutlined />, category: 'text' },
  // 编程工具
  { id: 'json-format', name: 'JSON格式化', icon: <CodeOutlined />, category: 'code' },
  { id: 'base64', name: 'Base64编解码', icon: <LockOutlined />, category: 'code' },
  { id: 'url-encode', name: 'URL编解码', icon: <LinkOutlined />, category: 'code' },
  { id: 'timestamp', name: '时间戳转换', icon: <FieldTimeOutlined />, category: 'code' },
  { id: 'hash', name: 'Hash计算', icon: <KeyOutlined />, category: 'code' },
  { id: 'uuid', name: 'UUID生成', icon: <KeyOutlined />, category: 'code' },
  { id: 'html-editor', name: 'HTML编辑器', icon: <CodeOutlined />, category: 'code' },
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
      case 'url-extract':
        return <UrlExtractTool input={input} setInput={setInput} output={output} setOutput={setOutput} />;
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
      case 'html-editor':
        return <HtmlEditorTool />;
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

// HTML 编辑器工具 - 使用 TinyMCE（本地部署，不使用 CDN）
const HtmlEditorTool: React.FC = () => {
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'editor' | 'source' | 'preview'>('editor');
  const [sourceCode, setSourceCode] = useState('');
  const [TinyMCEEditor, setTinyMCEEditor] = useState<any>(null);
  const [tinymceReady, setTinymceReady] = useState(false);

  // 动态加载 TinyMCE
  React.useEffect(() => {
    const loadTinyMCE = async () => {
      try {
        // 加载 TinyMCE 核心（包含所有必要模块）
        const tinymce = await import('tinymce');
        
        // 设置 TinyMCE 基础路径（用于加载皮肤等资源）
        // 在 Electron 环境中，使用相对路径
        if (tinymce.default) {
          (tinymce.default as any).baseURL = './tinymce';
        }
        
        setTinymceReady(true);
        
        // 加载 React 组件
        const mod = await import('@tinymce/tinymce-react');
        setTinyMCEEditor(() => mod.Editor);
      } catch (err) {
        console.error('Failed to load TinyMCE:', err);
      }
    };
    
    loadTinyMCE();
  }, []);

  // 同步源代码和编辑器内容
  const handleEditorChange = (newContent: string) => {
    setContent(newContent);
    setSourceCode(newContent);
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSourceCode(e.target.value);
  };

  const applySourceCode = () => {
    setContent(sourceCode);
    message.success('已应用源代码');
  };

  const formatHtml = () => {
    try {
      // 简单的 HTML 格式化
      let formatted = sourceCode
        .replace(/></g, '>\n<')
        .replace(/(<[^/][^>]*>)/g, '\n$1')
        .replace(/(<\/[^>]+>)/g, '$1\n')
        .split('\n')
        .filter(line => line.trim())
        .join('\n');
      
      // 添加缩进
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
    navigator.clipboard.writeText(viewMode === 'source' ? sourceCode : content);
    message.success('已复制');
  };

  const clearContent = () => {
    setContent('');
    setSourceCode('');
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
        {viewMode === 'editor' && TinyMCEEditor && tinymceReady && (
          <TinyMCEEditor
            value={content}
            onEditorChange={handleEditorChange}
            init={{
              height: '100%',
              menubar: true,
              plugins: [
                'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                'insertdatetime', 'media', 'table', 'help', 'wordcount'
              ],
              toolbar: 'undo redo | blocks | ' +
                'bold italic forecolor | alignleft aligncenter ' +
                'alignright alignjustify | bullist numlist outdent indent | ' +
                'removeformat | code | help',
              content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; }',
              // 本地部署配置
              base_url: './tinymce',
              suffix: '.min',
              language: 'zh_CN', // 中文界面
              promotion: false,
              branding: false,
              license_key: 'gpl', // 使用 GPL 开源许可
              highlight_on_focus: false, // 禁用焦点高亮
              statusbar: true,
            }}
          />
        )}
        {viewMode === 'editor' && (!TinyMCEEditor || !tinymceReady) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text type="secondary">加载编辑器中...</Text>
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

export default ToolboxPanel;
