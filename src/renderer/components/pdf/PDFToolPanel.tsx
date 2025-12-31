/**
 * PDFToolPanel - PDF 工具面板主组件
 * 管理所有 PDF 工具的切换和状态
 */

import React, { useState, useCallback } from 'react';
import {
  Layout,
  Menu,
  Button,
  Space,
  Typography,
  message,
  Spin,
  Upload,
} from 'antd';
import {
  FileSearchOutlined,
  MergeCellsOutlined,
  FileImageOutlined,
  CompressOutlined,
  FontColorsOutlined,
  RotateRightOutlined,
  SwapOutlined,
  DeleteOutlined,
  ScissorOutlined,
  EditOutlined,
  FormOutlined,
  LockOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  DiffOutlined,
  UploadOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { formatFileSize } from './utils';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

export type PDFToolType =
  | 'preview'        // PDF 预览
  | 'merge-split'    // 合并拆分
  | 'to-image'       // 转图片
  | 'compress'       // 压缩
  | 'convert'        // 转换（灰度、PDF/A、修复、版本、线性化）
  | 'watermark'      // 加水印
  | 'rotate'         // 旋转调整
  | 'reorder'        // 页面重排
  | 'delete-pages'   // 页面删除
  | 'extract-pages'  // 页面提取
  | 'rename'         // 批量重命名
  | 'form-fill'      // 表单填写
  | 'security'       // 安全加密
  | 'metadata'       // 元数据编辑
  | 'image-to-pdf'   // 图片转PDF
  | 'compare';       // PDF对比

interface PDFTool {
  id: PDFToolType;
  name: string;
  icon: React.ReactNode;
}

export const pdfTools: PDFTool[] = [
  { id: 'preview', name: 'PDF 预览', icon: <FileSearchOutlined /> },
  { id: 'merge-split', name: '合并拆分', icon: <MergeCellsOutlined /> },
  { id: 'to-image', name: '转图片', icon: <FileImageOutlined /> },
  { id: 'compress', name: '压缩', icon: <CompressOutlined /> },
  { id: 'convert', name: '转换', icon: <SwapOutlined /> },
  { id: 'watermark', name: '加水印', icon: <FontColorsOutlined /> },
  { id: 'rotate', name: '旋转调整', icon: <RotateRightOutlined /> },
  { id: 'reorder', name: '页面重排', icon: <SwapOutlined /> },
  { id: 'delete-pages', name: '页面删除', icon: <DeleteOutlined /> },
  { id: 'extract-pages', name: '页面提取', icon: <ScissorOutlined /> },
  { id: 'rename', name: '批量重命名', icon: <EditOutlined /> },
  { id: 'form-fill', name: '表单填写', icon: <FormOutlined /> },
  { id: 'security', name: '安全加密', icon: <LockOutlined /> },
  { id: 'metadata', name: '元数据', icon: <InfoCircleOutlined /> },
  { id: 'image-to-pdf', name: '图片转PDF', icon: <PictureOutlined /> },
  { id: 'compare', name: 'PDF 对比', icon: <DiffOutlined /> },
];

// ============ 工具组件 Props ============

export interface PDFToolProps {
  pdfData: ArrayBuffer | null;
  pdfInfo: PDFInfo | null;
  processing: boolean;
  onFileUpload: (file: File) => Promise<boolean>;
  onSave: (data: ArrayBuffer, filename: string) => Promise<void>;
}

export interface PDFInfo {
  pageCount: number;
  title?: string;
  author?: string;
  fileSize: number;
  fileName: string;
}

// ============ 主组件 ============

interface PDFToolPanelProps {
  defaultTool?: PDFToolType;
  hideSidebar?: boolean;
}

const PDFToolPanel: React.FC<PDFToolPanelProps> = ({ 
  defaultTool = 'preview', 
  hideSidebar = true 
}) => {
  const [selectedTool, setSelectedTool] = useState<PDFToolType>(defaultTool);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PDFInfo | null>(null);
  const [processing, setProcessing] = useState(false);

  // 当 defaultTool 变化时同步更新 selectedTool
  React.useEffect(() => {
    setSelectedTool(defaultTool);
  }, [defaultTool]);

  // 文件上传处理
  const handleFileUpload = useCallback(async (file: File): Promise<boolean> => {
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_FILE_SIZE) {
      message.error('文件大小超过 100MB 限制');
      return false;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      setProcessing(true);
      const arrayBuffer = await file.arrayBuffer();
      
      // 验证 PDF magic bytes
      const header = new Uint8Array(arrayBuffer.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      setPdfData(arrayBuffer);
      
      // 获取基本信息（页数等将在预览组件中获取）
      setPdfInfo({
        pageCount: 0, // 将由预览组件更新
        fileSize: file.size,
        fileName: file.name,
      });

      message.success('PDF 加载成功');
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    } finally {
      setProcessing(false);
    }
  }, []);

  // 保存文件
  const handleSave = useCallback(async (data: ArrayBuffer, filename: string) => {
    try {
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('保存成功');
    } catch (error) {
      console.error('Failed to save:', error);
      message.error('保存失败');
    }
  }, []);

  // 更新页数信息
  const handleTotalPagesChange = useCallback((total: number) => {
    setPdfInfo(prev => prev ? { ...prev, pageCount: total } : null);
  }, []);

  // 工具组件 Props
  const toolProps: PDFToolProps = {
    pdfData,
    pdfInfo,
    processing,
    onFileUpload: handleFileUpload,
    onSave: handleSave,
  };

  // 渲染工具内容
  const renderToolContent = () => {
    // 这些工具有自己的文件上传逻辑，不需要 PDFToolPanel 的统一上传
    const noUploadRequired = [
      'image-to-pdf', 'rename', 'compare',
      'merge-split', 'to-image', 'compress', 'convert',
      'watermark', 'rotate', 'reorder', 'delete-pages',
      'extract-pages', 'form-fill', 'security', 'metadata'
    ];
    
    if (!pdfData && !noUploadRequired.includes(selectedTool)) {
      return (
        <div style={{ padding: 24 }}>
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
            <p className="ant-upload-hint">支持单个 PDF 文件，最大 100MB</p>
          </Dragger>
        </div>
      );
    }

    // 根据选中的工具渲染对应组件
    switch (selectedTool) {
      case 'preview':
        return <PreviewTool {...toolProps} onTotalPagesChange={handleTotalPagesChange} />;
      case 'merge-split':
        return <MergeSplitTool />;
      case 'to-image':
        return <ToImageTool />;
      case 'compress':
        return <CompressTool />;
      case 'convert':
        return <ConvertTool />;
      case 'watermark':
        return <WatermarkTool />;
      case 'rotate':
        return <RotateTool />;
      case 'reorder':
        return <ReorderTool />;
      case 'delete-pages':
        return <DeletePagesTool />;
      case 'extract-pages':
        return <ExtractPagesTool />;
      case 'rename':
        return <RenameTool />;
      case 'form-fill':
        return <FormFillTool />;
      case 'security':
        return <SecurityTool />;
      case 'metadata':
        return <MetadataTool />;
      case 'image-to-pdf':
        return <ImageToPdfTool />;
      case 'compare':
        return <CompareTool />;
      default:
        return <div>请选择工具</div>;
    }
  };

  const currentTool = pdfTools.find(t => t.id === selectedTool);
  const menuItems = pdfTools.map(tool => ({
    key: tool.id,
    icon: tool.icon,
    label: tool.name,
  }));

  // 当隐藏侧边栏时，直接渲染工具内容
  if (hideSidebar) {
    return (
      <div style={{ height: '100%' }}>
        <Spin spinning={processing}>
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
          onClick={({ key }) => setSelectedTool(key as PDFToolType)}
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
            {pdfData && (
              <Space>
                <Upload accept=".pdf" showUploadList={false} beforeUpload={handleFileUpload}>
                  <Button icon={<UploadOutlined />}>更换文件</Button>
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

// ============ 预览工具组件 ============

import PreviewToolComponent from './PreviewTool';
import MergeSplitTool from './MergeSplitTool';
import ToImageTool from './ToImageTool';
import CompressTool from './CompressTool';
import ConvertTool from './ConvertTool';
import WatermarkTool from './WatermarkTool';
import RotateTool from './RotateTool';
import ReorderTool from './ReorderTool';
import DeletePagesTool from './DeletePagesTool';
import ExtractPagesTool from './ExtractPagesTool';
import RenameTool from './RenameTool';
import FormFillTool from './FormFillTool';
import SecurityTool from './SecurityTool';
import MetadataTool from './MetadataTool';
import ImageToPdfTool from './ImageToPdfTool';
import CompareTool from './CompareTool';

interface PreviewToolProps extends PDFToolProps {
  onTotalPagesChange: (total: number) => void;
}

const PreviewTool: React.FC<PreviewToolProps> = ({ 
  pdfData, 
  pdfInfo, 
  onFileUpload,
  onTotalPagesChange,
}) => {
  return (
    <PreviewToolComponent
      pdfData={pdfData}
      pdfInfo={pdfInfo}
      onFileUpload={onFileUpload}
      onTotalPagesChange={onTotalPagesChange}
    />
  );
};

// ============ 占位工具组件 ============

interface PlaceholderToolProps extends PDFToolProps {
  name: string;
}

const PlaceholderTool: React.FC<PlaceholderToolProps> = ({ name, pdfInfo }) => {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <Title level={4} type="secondary">{name}</Title>
      <Text type="secondary">此功能正在开发中...</Text>
      {pdfInfo && (
        <div style={{ marginTop: 16 }}>
          <Text>当前文件：{pdfInfo.fileName}</Text>
        </div>
      )}
    </div>
  );
};

export default PDFToolPanel;

export { PreviewTool, PlaceholderTool };
