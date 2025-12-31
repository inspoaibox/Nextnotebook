/**
 * ToImageTool - PDF 转图片工具组件
 * 采用上下布局：上方为参数设置区，下方为页面缩略图选择和转换结果预览
 * 支持两种渲染模式：
 * - 标准模式：使用 pdfjs 在前端渲染，速度快
 * - 高质量模式：使用 Ghostscript 在后端渲染，质量更高
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, Row, Col, Typography, Upload, Button, Space, message, Select, Radio, Image, Tooltip, Tag } from 'antd';
import { UploadOutlined, InboxOutlined, DownloadOutlined, FileImageOutlined, ThunderboltOutlined, CrownOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';
import PDFThumbnails from './PDFThumbnails';
import { downloadFilesSequentially, dataURLtoBlob } from './utils';
import { pdfApi } from '../../services/pdfApi';

// 设置本地 worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';

// 配置标准字体和 CMap 路径（用于正确渲染文字和中文）
const STANDARD_FONT_DATA_URL = './pdfjs/standard_fonts/';
const CMAP_URL = './pdfjs/cmaps/';
const CMAP_PACKED = true;

const { Text } = Typography;
const { Dragger } = Upload;

// ============ 类型定义 ============

type RenderMode = 'standard' | 'hq'; // standard = pdfjs, hq = Ghostscript

interface PDFFile {
  name: string;
  data: ArrayBuffer;
  pageCount: number;
}

interface ConvertedImage {
  pageNum: number;
  data: string; // base64 data URL
}

// ============ ToImageTool 组件 ============

const ToImageTool: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [scale, setScale] = useState<number>(2); // 缩放比例，2 = 144 DPI
  const [dpi, setDpi] = useState<number>(150); // Ghostscript DPI
  const [renderMode, setRenderMode] = useState<RenderMode>('standard');
  const [gsAvailable, setGsAvailable] = useState<boolean>(false);
  const [processing, setProcessing] = useState(false);
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([]);

  // 检查 Ghostscript 可用性
  useEffect(() => {
    pdfApi.checkGhostscript().then(status => {
      setGsAvailable(status.available);
    }).catch(() => {
      setGsAvailable(false);
    });
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
      
      const header = new Uint8Array(bufferCopy.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      // 使用 pdfjs 获取页数，配置字体和 CMap
      const pdf = await pdfjsLib.getDocument({ 
        data: bufferCopy.slice(0),
        standardFontDataUrl: STANDARD_FONT_DATA_URL,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
      }).promise;
      
      setPdfFile({
        name: file.name,
        data: bufferCopy,
        pageCount: pdf.numPages,
      });
      
      // 默认选择所有页面
      setSelectedPages(Array.from({ length: pdf.numPages }, (_, i) => i + 1));
      setConvertedImages([]);
      
      message.success(`已加载: ${file.name} (${pdf.numPages} 页)`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);

  // 使用 pdfjs 渲染页面为图片
  const renderPageToImage = useCallback(async (
    pdf: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    scale: number,
    format: 'png' | 'jpg'
  ): Promise<string> => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context');
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // 白色背景（对于 JPG 格式）
    if (format === 'jpg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    await page.render({
      canvas: canvas,
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'jpg' ? 0.92 : undefined;
    return canvas.toDataURL(mimeType, quality);
  }, []);

  // 执行转换
  const handleConvert = useCallback(async () => {
    if (!pdfFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (selectedPages.length === 0) {
      message.warning('请选择要转换的页面');
      return;
    }

    setProcessing(true);
    setConvertedImages([]);

    try {
      if (renderMode === 'hq' && gsAvailable) {
        // 高质量模式：使用 Ghostscript
        const results = await pdfApi.toImage({
          file: pdfFile.data.slice(0),
          pages: selectedPages,
          format,
          dpi,
        });

        const images: ConvertedImage[] = results.map((buffer, index) => {
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
          return {
            pageNum: selectedPages[index],
            data: `data:${mimeType};base64,${base64}`,
          };
        });

        setConvertedImages(images);
        message.success(`高质量转换完成，生成 ${images.length} 张图片`);
      } else {
        // 标准模式：使用 pdfjs
        const pdf = await pdfjsLib.getDocument({ 
          data: pdfFile.data.slice(0),
          standardFontDataUrl: STANDARD_FONT_DATA_URL,
          cMapUrl: CMAP_URL,
          cMapPacked: CMAP_PACKED,
        }).promise;
        const images: ConvertedImage[] = [];
        
        for (const pageNum of selectedPages) {
          const dataUrl = await renderPageToImage(pdf, pageNum, scale, format);
          images.push({
            pageNum,
            data: dataUrl,
          });
        }

        setConvertedImages(images);
        message.success(`转换完成，生成 ${images.length} 张图片`);
      }
    } catch (error) {
      console.error('Convert failed:', error);
      message.error('转换失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [pdfFile, selectedPages, format, scale, dpi, renderMode, gsAvailable, renderPageToImage]);

  // 下载单张图片
  const handleDownloadImage = useCallback((image: ConvertedImage) => {
    const link = document.createElement('a');
    link.href = image.data;
    link.download = `${pdfFile?.name.replace('.pdf', '')}_page${image.pageNum}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfFile, format]);

  // 下载所有图片
  const handleDownloadAll = useCallback(async () => {
    if (!pdfFile) return;
    const files = convertedImages.map((image) => ({
      data: dataURLtoBlob(image.data),
      filename: `${pdfFile.name.replace('.pdf', '')}_page${image.pageNum}.${format}`,
      mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
    }));
    await downloadFilesSequentially(files);
  }, [convertedImages, pdfFile, format]);

  // 未上传文件时显示上传区域
  if (!pdfFile) {
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
          <p className="ant-upload-hint">将 PDF 页面转换为 PNG 或 JPG 图片</p>
        </Dragger>
      </div>
    );
  }

  return (
    <div>
      {/* 上方：参数设置区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 8]} align="middle">
          <Col span={5}>
            <Space>
              <Upload accept=".pdf" showUploadList={false} beforeUpload={handleFileUpload}>
                <Button icon={<UploadOutlined />} size="small">更换文件</Button>
              </Upload>
              <Text ellipsis style={{ maxWidth: 100 }}>{pdfFile.name}</Text>
            </Space>
          </Col>
          <Col span={5}>
            <Text type="secondary" style={{ fontSize: 12 }}>模式：</Text>
            <Radio.Group 
              value={renderMode} 
              onChange={(e) => setRenderMode(e.target.value)} 
              size="small"
            >
              <Tooltip title="使用浏览器渲染，速度快">
                <Radio.Button value="standard">
                  <ThunderboltOutlined /> 标准
                </Radio.Button>
              </Tooltip>
              <Tooltip title={gsAvailable ? "使用 Ghostscript 渲染，质量更高" : "Ghostscript 不可用"}>
                <Radio.Button value="hq" disabled={!gsAvailable}>
                  <CrownOutlined /> 高质量
                </Radio.Button>
              </Tooltip>
            </Radio.Group>
          </Col>
          <Col span={3}>
            <Text type="secondary" style={{ fontSize: 12 }}>格式：</Text>
            <Radio.Group value={format} onChange={(e) => setFormat(e.target.value)} size="small">
              <Radio.Button value="png">PNG</Radio.Button>
              <Radio.Button value="jpg">JPG</Radio.Button>
            </Radio.Group>
          </Col>
          <Col span={4}>
            {renderMode === 'standard' ? (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>质量：</Text>
                <Select value={scale} onChange={setScale} size="small" style={{ width: 70 }}>
                  <Select.Option value={1}>标准</Select.Option>
                  <Select.Option value={1.5}>良好</Select.Option>
                  <Select.Option value={2}>高清</Select.Option>
                  <Select.Option value={3}>超清</Select.Option>
                </Select>
              </>
            ) : (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>DPI：</Text>
                <Select value={dpi} onChange={setDpi} size="small" style={{ width: 70 }}>
                  <Select.Option value={72}>72</Select.Option>
                  <Select.Option value={150}>150</Select.Option>
                  <Select.Option value={300}>300</Select.Option>
                  <Select.Option value={600}>600</Select.Option>
                </Select>
              </>
            )}
          </Col>
          <Col span={3}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已选 {selectedPages.length}/{pdfFile.pageCount} 页
            </Text>
          </Col>
          <Col span={4} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<FileImageOutlined />}
              onClick={handleConvert}
              loading={processing}
              disabled={selectedPages.length === 0}
            >
              转换
            </Button>
          </Col>
        </Row>
        {renderMode === 'hq' && (
          <div style={{ marginTop: 8 }}>
            <Tag color="gold">高质量模式</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              使用 Ghostscript 渲染，支持更高 DPI，适合打印和专业用途
            </Text>
          </div>
        )}
      </Card>

      {/* 下方：页面选择和结果预览 */}
      <Row gutter={16}>
        {/* 左侧：页面选择 */}
        <Col span={12}>
          <Card size="small" title="选择页面">
            <PDFThumbnails
              pdfData={pdfFile.data}
              selectedPages={selectedPages}
              onPageSelect={setSelectedPages}
              multiSelect={true}
              thumbnailWidth={80}
              style={{ maxHeight: 400 }}
            />
          </Card>
        </Col>

        {/* 右侧：转换结果 */}
        <Col span={12}>
          <Card 
            size="small" 
            title="转换结果"
            extra={
              convertedImages.length > 0 && (
                <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadAll}>
                  下载全部
                </Button>
              )
            }
          >
            {convertedImages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                选择页面后点击"转换"按钮
              </div>
            ) : (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 12,
                maxHeight: 400,
                overflowY: 'auto',
              }}>
                <Image.PreviewGroup>
                  {convertedImages.map((image) => (
                    <div key={image.pageNum} style={{ textAlign: 'center' }}>
                      <Image
                        src={image.data}
                        alt={`Page ${image.pageNum}`}
                        style={{ maxWidth: '100%', maxHeight: 150, cursor: 'pointer' }}
                      />
                      <div style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 12 }}>第 {image.pageNum} 页</Text>
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownloadImage(image)}
                        />
                      </div>
                    </div>
                  ))}
                </Image.PreviewGroup>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ToImageTool;
