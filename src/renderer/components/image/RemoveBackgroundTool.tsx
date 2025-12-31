/**
 * RemoveBackgroundTool - 图片去背景工具
 * 使用 @imgly/background-removal 实现 AI 去背景
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  message,
  Upload,
  Progress,
  Row,
  Col,
  Spin,
  Alert,
} from 'antd';
import {
  UploadOutlined,
  DownloadOutlined,
  InboxOutlined,
  ReloadOutlined,
  ScissorOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { Dragger } = Upload;

// 进度阶段映射
const stageNames: Record<string, string> = {
  loading: '加载模型',
  computing: '处理中',
  downloading: '下载模型',
  fetch: '获取资源',
};

const RemoveBackgroundTool: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  
  const workerRef = useRef<Worker | null>(null);

  // 初始化 Worker
  useEffect(() => {
    // 使用内联 Worker 方式，避免 import.meta 问题
    // Worker 代码将在运行时动态加载 @imgly/background-removal
    const workerCode = `
      let removeBackground = null;
      
      // 动态导入 background-removal 库
      async function loadLibrary() {
        if (!removeBackground) {
          const module = await import('@imgly/background-removal');
          removeBackground = module.removeBackground;
        }
        return removeBackground;
      }
      
      self.onmessage = async (e) => {
        const { type, imageData } = e.data;
        
        if (type !== 'process') return;
        
        try {
          self.postMessage({ type: 'progress', stage: 'loading', progress: 0 });
          
          const removeBg = await loadLibrary();
          const blob = new Blob([imageData], { type: 'image/png' });
          
          const result = await removeBg(blob, {
            progress: (key, current, total) => {
              const progress = total > 0 ? Math.round((current / total) * 100) : 0;
              self.postMessage({ type: 'progress', stage: key, progress });
            },
          });
          
          const buffer = await result.arrayBuffer();
          self.postMessage({ type: 'result', data: buffer }, [buffer]);
        } catch (error) {
          self.postMessage({ type: 'error', message: error.message || 'Unknown error' });
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl, { type: 'module' });

    // 监听 Worker 消息
    workerRef.current.onmessage = (e) => {
      const { type, stage: msgStage, progress: msgProgress, data, message: errorMsg } = e.data;
      
      switch (type) {
        case 'progress':
          setStage(stageNames[msgStage] || msgStage);
          setProgress(msgProgress);
          break;
        case 'result':
          // 将 ArrayBuffer 转换为 Data URL
          const blob = new Blob([data], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          setResultImage(url);
          setProcessing(false);
          setProgress(100);
          message.success('背景移除成功！');
          break;
        case 'error':
          setError(errorMsg);
          setProcessing(false);
          message.error('处理失败: ' + errorMsg);
          break;
      }
    };

    workerRef.current.onerror = (e) => {
      setError(e.message);
      setProcessing(false);
      message.error('Worker 错误: ' + e.message);
    };

    return () => {
      workerRef.current?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    };
  }, []);

  // 处理文件上传
  const handleUpload = useCallback(async (file: File) => {
    // 验证文件类型
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      message.error('请上传 PNG、JPG 或 WebP 格式的图片');
      return false;
    }

    // 验证文件大小 (最大 20MB)
    if (file.size > 20 * 1024 * 1024) {
      message.error('图片大小不能超过 20MB');
      return false;
    }

    try {
      setError(null);
      setResultImage(null);
      setFileName(file.name);
      
      // 读取文件为 Data URL 用于预览
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      
    } catch (err) {
      message.error('图片加载失败');
    }
    
    return false;
  }, []);

  // 执行去背景
  const handleRemoveBackground = useCallback(async () => {
    if (!originalImage || !workerRef.current) {
      message.warning('请先上传图片');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setStage('准备中');
    setError(null);
    setResultImage(null);

    try {
      // 将 Data URL 转换为 ArrayBuffer
      const response = await fetch(originalImage);
      const arrayBuffer = await response.arrayBuffer();
      
      // 发送到 Worker 处理
      workerRef.current.postMessage({
        type: 'process',
        imageData: arrayBuffer,
      }, [arrayBuffer]);
    } catch (err) {
      setError('处理失败');
      setProcessing(false);
      message.error('处理失败');
    }
  }, [originalImage]);

  // 下载结果
  const handleDownload = useCallback(() => {
    if (!resultImage) return;
    
    const link = document.createElement('a');
    link.href = resultImage;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    link.download = `${baseName}_no_bg.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [resultImage, fileName]);

  // 重置
  const handleReset = useCallback(() => {
    setOriginalImage(null);
    setResultImage(null);
    setProgress(0);
    setStage('');
    setError(null);
    setFileName('');
  }, []);

  // 未上传图片时显示上传区域
  if (!originalImage) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message="AI 智能去背景"
          description="上传图片后，AI 将自动识别并移除背景，输出透明 PNG 图片。首次使用需要下载模型（约 40MB），请耐心等待。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Dragger
          accept=".png,.jpg,.jpeg,.webp"
          showUploadList={false}
          beforeUpload={handleUpload}
          style={{ padding: 40 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽图片到此处</p>
          <p className="ant-upload-hint">支持 PNG、JPG、WebP 格式，最大 20MB</p>
        </Dragger>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* 操作栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Upload
                accept=".png,.jpg,.jpeg,.webp"
                showUploadList={false}
                beforeUpload={handleUpload}
              >
                <Button icon={<UploadOutlined />}>更换图片</Button>
              </Upload>
              <Text type="secondary">{fileName}</Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<ScissorOutlined />}
                onClick={handleRemoveBackground}
                loading={processing}
                disabled={!originalImage}
              >
                {processing ? '处理中...' : '去除背景'}
              </Button>
              {resultImage && (
                <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                  下载结果
                </Button>
              )}
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Col>
        </Row>
        
        {/* 进度条 */}
        {processing && (
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{stage}</Text>
            <Progress percent={progress} status="active" />
          </div>
        )}
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert
          message="处理失败"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setError(null)}
        />
      )}

      {/* 图片预览 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card
            size="small"
            title="原图"
            style={{ height: 'calc(100vh - 320px)' }}
            styles={{ body: { height: 'calc(100% - 40px)', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' } }}
          >
            <img
              src={originalImage}
              alt="原图"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card
            size="small"
            title="去背景结果"
            style={{ height: 'calc(100vh - 320px)' }}
            styles={{ 
              body: { 
                height: 'calc(100% - 40px)', 
                overflow: 'auto', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                // 棋盘格背景显示透明区域
                background: `
                  linear-gradient(45deg, #ccc 25%, transparent 25%),
                  linear-gradient(-45deg, #ccc 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #ccc 75%),
                  linear-gradient(-45deg, transparent 75%, #ccc 75%)
                `,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              } 
            }}
          >
            {processing ? (
              <Spin tip="AI 正在处理中..." size="large" />
            ) : resultImage ? (
              <img
                src={resultImage}
                alt="去背景结果"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Text type="secondary">点击"去除背景"开始处理</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RemoveBackgroundTool;
