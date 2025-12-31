/**
 * ImageToPdfTool - 图片转 PDF 工具
 * 支持多图上传、拖拽排序、页面尺寸和放置方式选择
 */

import React, { useState, useCallback, useMemo } from 'react';
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
  Select,
  Image,
  Empty,
  Popconfirm,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ClearOutlined,
  PictureOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';

const { Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

// ============ 类型定义 ============

interface ImageItem {
  id: string;
  file: File;
  preview: string;
  name: string;
}

type PageSize = 'fit' | 'a4' | 'letter';
type Placement = 'center' | 'stretch' | 'fit';

// ============ 主组件 ============

const ImageToPdfTool: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [placement, setPlacement] = useState<Placement>('fit');
  const [processing, setProcessing] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // 处理图片上传
  const handleUpload = useCallback((file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      message.error('仅支持 JPG/PNG 格式图片');
      return false;
    }

    const preview = URL.createObjectURL(file);
    const newItem: ImageItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview,
      name: file.name,
    };

    setImages(prev => [...prev, newItem]);
    return false;
  }, []);

  // 删除图片
  const handleDelete = useCallback((id: string) => {
    setImages(prev => {
      const item = prev.find(img => img.id === id);
      if (item) {
        URL.revokeObjectURL(item.preview);
      }
      return prev.filter(img => img.id !== id);
    });
  }, []);

  // 清空所有图片
  const handleClearAll = useCallback(() => {
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
  }, [images]);

  // 拖拽开始
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  // 拖拽结束
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // 拖拽放置
  const handleDrop = useCallback((targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    setImages(prev => {
      const newImages = [...prev];
      const [draggedItem] = newImages.splice(draggedIndex, 1);
      newImages.splice(targetIndex, 0, draggedItem);
      return newImages;
    });
    setDraggedIndex(null);
  }, [draggedIndex]);

  // 转换为 PDF
  const handleConvert = useCallback(async () => {
    if (images.length === 0) {
      message.warning('请先添加图片');
      return;
    }

    try {
      setProcessing(true);

      // 读取所有图片数据并复制 ArrayBuffer 以避免 detached 问题
      const imageBuffers = await Promise.all(
        images.map(async img => {
          const arrayBuffer = await img.file.arrayBuffer();
          return arrayBuffer.slice(0);
        })
      );

      // 调用 API 转换
      const pdfBuffer = await pdfApi.imagesToPdf({
        images: imageBuffers,
        pageSize,
        placement,
      });

      // 下载 PDF
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'images_to_pdf.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      message.success('PDF 生成成功');
    } catch (error) {
      console.error('Failed to convert images to PDF:', error);
      message.error('转换失败');
    } finally {
      setProcessing(false);
    }
  }, [images, pageSize, placement]);

  return (
    <div style={{ padding: 16 }}>
      <Spin spinning={processing}>
        {/* 参数设置区 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 12]} align="middle">
            <Col span={24}>
              <Dragger
                accept=".jpg,.jpeg,.png"
                multiple
                showUploadList={false}
                beforeUpload={handleUpload}
                style={{ padding: '12px 0' }}
              >
                <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                  <InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} />
                </p>
                <p className="ant-upload-text" style={{ marginBottom: 4 }}>
                  点击或拖拽图片到此处
                </p>
                <p className="ant-upload-hint">支持 JPG/PNG 格式，可多选</p>
              </Dragger>
            </Col>

            <Col xs={12} sm={6}>
              <Text type="secondary" style={{ fontSize: 12 }}>页面尺寸</Text>
              <Select
                value={pageSize}
                onChange={setPageSize}
                style={{ width: '100%' }}
                size="small"
              >
                <Option value="fit">适应图片</Option>
                <Option value="a4">A4</Option>
                <Option value="letter">Letter</Option>
              </Select>
            </Col>

            <Col xs={12} sm={6}>
              <Text type="secondary" style={{ fontSize: 12 }}>放置方式</Text>
              <Select
                value={placement}
                onChange={setPlacement}
                style={{ width: '100%' }}
                size="small"
                disabled={pageSize === 'fit'}
              >
                <Option value="fit">保持比例</Option>
                <Option value="center">居中</Option>
                <Option value="stretch">拉伸填充</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Popconfirm
                  title="确定清空所有图片？"
                  onConfirm={handleClearAll}
                  disabled={images.length === 0}
                >
                  <Button
                    icon={<ClearOutlined />}
                    disabled={images.length === 0}
                  >
                    清空
                  </Button>
                </Popconfirm>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleConvert}
                  disabled={images.length === 0}
                >
                  生成 PDF ({images.length})
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* 图片列表 */}
        {images.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 12,
              maxHeight: 400,
              overflow: 'auto',
              padding: 4,
            }}
          >
            {images.map((img, index) => (
              <div
                key={img.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                style={{
                  position: 'relative',
                  border: draggedIndex === index ? '2px dashed #1890ff' : '1px solid #d9d9d9',
                  borderRadius: 4,
                  padding: 4,
                  background: '#fff',
                  cursor: 'grab',
                  opacity: draggedIndex === index ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 12,
                    zIndex: 1,
                  }}
                >
                  {index + 1}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    zIndex: 1,
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(img.id);
                    }}
                    style={{ background: 'rgba(255,255,255,0.8)' }}
                  />
                </div>
                <Image
                  src={img.preview}
                  alt={img.name}
                  style={{
                    width: '100%',
                    height: 100,
                    objectFit: 'cover',
                    borderRadius: 2,
                  }}
                  preview={false}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: '#666',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 4,
                    textAlign: 'center',
                  }}
                  title={img.name}
                >
                  {img.name}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: '#999',
                  }}
                >
                  <HolderOutlined />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            image={<PictureOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
            description="请上传图片"
          />
        )}

        {images.length > 1 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 12, textAlign: 'center' }}>
            拖拽图片可调整顺序
          </Text>
        )}
      </Spin>
    </div>
  );
};

export default ImageToPdfTool;
