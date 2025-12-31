/**
 * PDFPreview - PDF 预览组件
 * 基于 PDF.js 实现单页渲染、缩放控制和页面导航
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Spin, Space, Button, InputNumber, Select, Input, message } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  LeftOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';

// 设置本地 worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';

// 配置标准字体和 CMap 路径（用于正确渲染文字和中文）
const STANDARD_FONT_DATA_URL = './pdfjs/standard_fonts/';
const CMAP_URL = './pdfjs/cmaps/';
const CMAP_PACKED = true;

// ============ 类型定义 ============

export interface PDFPreviewProps {
  pdfData: ArrayBuffer | string | null;
  currentPage?: number;
  zoom?: number;
  showControls?: boolean;
  showSearch?: boolean;
  onPageChange?: (page: number) => void;
  onTotalPagesChange?: (total: number) => void;
  onZoomChange?: (zoom: number) => void;
  style?: React.CSSProperties;
}

type ZoomMode = 'custom' | 'fit-width' | 'fit-page';

// ============ PDFPreview 组件 ============

const PDFPreview: React.FC<PDFPreviewProps> = ({
  pdfData,
  currentPage: externalPage,
  zoom: externalZoom,
  showControls = true,
  showSearch = true,
  onPageChange,
  onTotalPagesChange,
  onZoomChange,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(externalPage || 1);
  const [zoom, setZoom] = useState(externalZoom || 100);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('custom');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [rendering, setRendering] = useState(false);

  // 用于触发渲染的状态
  const [pdfLoaded, setPdfLoaded] = useState(0);

  // 加载 PDF 文档
  useEffect(() => {
    console.log('PDFPreview: pdfData changed', { 
      hasData: !!pdfData, 
      dataType: pdfData ? (typeof pdfData === 'string' ? 'string' : 'ArrayBuffer') : 'null',
      dataSize: pdfData ? (typeof pdfData === 'string' ? pdfData.length : pdfData.byteLength) : 0
    });
    
    if (!pdfData) {
      pdfDocRef.current = null;
      setTotalPages(0);
      setPdfLoaded(0);
      return;
    }

    const loadPDF = async () => {
      setLoading(true);
      setRendering(false); // 重置渲染状态
      
      try {
        // 先清理旧的 PDF 文档
        if (pdfDocRef.current) {
          pdfDocRef.current.destroy();
          pdfDocRef.current = null;
        }

        let loadingTask: pdfjsLib.PDFDocumentLoadingTask;
        
        if (typeof pdfData === 'string') {
          // URL 或 Base64
          if (pdfData.startsWith('data:')) {
            const base64 = pdfData.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            loadingTask = pdfjsLib.getDocument({ 
              data: bytes,
              standardFontDataUrl: STANDARD_FONT_DATA_URL,
              cMapUrl: CMAP_URL,
              cMapPacked: CMAP_PACKED,
            });
          } else {
            loadingTask = pdfjsLib.getDocument({
              url: pdfData,
              standardFontDataUrl: STANDARD_FONT_DATA_URL,
              cMapUrl: CMAP_URL,
              cMapPacked: CMAP_PACKED,
            });
          }
        } else {
          // ArrayBuffer - 复制以避免 detached 问题
          // pdfjs 会 transfer ArrayBuffer，导致原始 buffer 被 detached
          const bufferCopy = pdfData.slice(0);
          console.log('PDFPreview: Loading ArrayBuffer', { size: bufferCopy.byteLength });
          loadingTask = pdfjsLib.getDocument({ 
            data: bufferCopy,
            standardFontDataUrl: STANDARD_FONT_DATA_URL,
            cMapUrl: CMAP_URL,
            cMapPacked: CMAP_PACKED,
          });
        }

        const pdf = await loadingTask.promise;
        console.log('PDFPreview: PDF loaded', { numPages: pdf.numPages });
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        onTotalPagesChange?.(pdf.numPages);
        
        // 重置到第一页或保持当前页
        const newPage = currentPage > pdf.numPages ? 1 : currentPage;
        if (newPage !== currentPage) {
          setCurrentPage(newPage);
          onPageChange?.(newPage);
        }
        
        // 加载完成
        setLoading(false);
        // 触发渲染
        const loadedTime = Date.now();
        console.log('PDFPreview: Setting pdfLoaded to', loadedTime);
        setPdfLoaded(loadedTime);
      } catch (error) {
        console.error('PDFPreview: Failed to load PDF:', error);
        message.error('PDF 加载失败');
        setLoading(false);
      }
    };

    loadPDF();

    return () => {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, [pdfData]);

  // 渲染当前页面
  const renderPage = useCallback(async () => {
    console.log('PDFPreview: renderPage called', { 
      hasPdfDoc: !!pdfDocRef.current, 
      hasCanvas: !!canvasRef.current,
      currentPage,
      rendering 
    });
    
    if (!pdfDocRef.current || !canvasRef.current) {
      console.log('PDFPreview: Missing pdfDoc or canvas');
      return;
    }

    setRendering(true);
    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) {
        console.log('PDFPreview: Failed to get canvas context');
        setRendering(false);
        return;
      }

      // 计算缩放比例
      let scale = zoom / 100;
      
      if (zoomMode === 'fit-width' && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 40;
        const viewport = page.getViewport({ scale: 1 });
        scale = containerWidth / viewport.width;
        const newZoom = Math.round(scale * 100);
        if (newZoom !== zoom) {
          setZoom(newZoom);
          onZoomChange?.(newZoom);
        }
      } else if (zoomMode === 'fit-page' && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 40;
        const containerHeight = containerRef.current.clientHeight - 40;
        const viewport = page.getViewport({ scale: 1 });
        const scaleX = containerWidth / viewport.width;
        const scaleY = containerHeight / viewport.height;
        scale = Math.min(scaleX, scaleY);
        const newZoom = Math.round(scale * 100);
        if (newZoom !== zoom) {
          setZoom(newZoom);
          onZoomChange?.(newZoom);
        }
      }

      const viewport = page.getViewport({ scale });
      
      // 设置 canvas 尺寸
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      console.log('PDFPreview: Rendering page', { 
        page: currentPage, 
        scale, 
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasStyleWidth: canvas.style.width,
        canvasStyleHeight: canvas.style.height,
        containerWidth: containerRef.current?.clientWidth,
        containerHeight: containerRef.current?.clientHeight,
      });

      // 清除之前的内容
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.scale(outputScale, outputScale);
      
      // 渲染页面
      await page.render({
        canvasContext: context,
        viewport,
      } as any).promise;
      
      console.log('PDFPreview: Page rendered successfully');
    } catch (error) {
      console.error('PDFPreview: Failed to render page:', error);
    } finally {
      setRendering(false);
    }
  }, [currentPage, zoom, zoomMode, onZoomChange]);

  // 当页面或缩放变化时重新渲染
  useEffect(() => {
    console.log('PDFPreview: Render effect triggered', { pdfLoaded, loading, hasPdfDoc: !!pdfDocRef.current });
    if (pdfLoaded > 0 && pdfDocRef.current && !loading) {
      // 使用 setTimeout 确保状态已更新
      const timer = setTimeout(() => {
        renderPage();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentPage, zoom, zoomMode, pdfLoaded, loading]);

  // 同步外部页码
  useEffect(() => {
    if (externalPage && externalPage !== currentPage && externalPage >= 1 && externalPage <= totalPages) {
      setCurrentPage(externalPage);
    }
  }, [externalPage, totalPages]);

  // 同步外部缩放
  useEffect(() => {
    if (externalZoom && externalZoom !== zoom) {
      setZoom(externalZoom);
      setZoomMode('custom');
    }
  }, [externalZoom]);

  // 页面导航
  const goToPage = (page: number) => {
    const newPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(newPage);
    onPageChange?.(newPage);
  };

  const prevPage = () => goToPage(currentPage - 1);
  const nextPage = () => goToPage(currentPage + 1);

  // 缩放控制
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 25, 400);
    setZoom(newZoom);
    setZoomMode('custom');
    onZoomChange?.(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 25, 25);
    setZoom(newZoom);
    setZoomMode('custom');
    onZoomChange?.(newZoom);
  };

  const handleZoomChange = (value: number | null) => {
    if (value) {
      setZoom(value);
      setZoomMode('custom');
      onZoomChange?.(value);
    }
  };

  const handleZoomModeChange = (mode: ZoomMode) => {
    setZoomMode(mode);
    if (mode === 'custom') {
      setZoom(100);
      onZoomChange?.(100);
    }
  };

  // 搜索功能
  const handleSearch = async () => {
    if (!searchText || !pdfDocRef.current) return;

    const results: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDocRef.current.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      if (text.toLowerCase().includes(searchText.toLowerCase())) {
        results.push(i);
      }
    }

    setSearchResults(results);
    setCurrentSearchIndex(0);
    
    if (results.length > 0) {
      goToPage(results[0]);
      message.success(`找到 ${results.length} 个结果`);
    } else {
      message.info('未找到匹配内容');
    }
  };

  const nextSearchResult = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    goToPage(searchResults[nextIndex]);
  };

  const prevSearchResult = () => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    goToPage(searchResults[prevIndex]);
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          prevPage();
          break;
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          nextPage();
          break;
        case 'Home':
          e.preventDefault();
          goToPage(1);
          break;
        case 'End':
          e.preventDefault();
          goToPage(totalPages);
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomOut();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, zoom]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, ...style }}>
      {/* 控制栏 */}
      {showControls && (
        <div style={{ 
          padding: '8px 12px', 
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          {/* 页面导航 */}
          <Space size={4}>
            <Button icon={<LeftOutlined />} size="small" onClick={prevPage} disabled={currentPage <= 1} />
            <InputNumber
              size="small"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(v) => v && goToPage(v)}
              style={{ width: 60 }}
            />
            <span style={{ color: '#666' }}>/ {totalPages}</span>
            <Button icon={<RightOutlined />} size="small" onClick={nextPage} disabled={currentPage >= totalPages} />
          </Space>

          <div style={{ width: 1, height: 20, background: '#e8e8e8' }} />

          {/* 缩放控制 */}
          <Space size={4}>
            <Button icon={<ZoomOutOutlined />} size="small" onClick={handleZoomOut} />
            <InputNumber
              size="small"
              min={25}
              max={400}
              value={zoom}
              onChange={handleZoomChange}
              formatter={(v) => `${v}%`}
              parser={(v) => parseInt(v?.replace('%', '') || '100')}
              style={{ width: 70 }}
            />
            <Button icon={<ZoomInOutlined />} size="small" onClick={handleZoomIn} />
            <Select
              size="small"
              value={zoomMode}
              onChange={handleZoomModeChange}
              style={{ width: 100 }}
              options={[
                { value: 'custom', label: '自定义' },
                { value: 'fit-width', label: '适应宽度' },
                { value: 'fit-page', label: '适应页面' },
              ]}
            />
          </Space>

          {/* 搜索 */}
          {showSearch && (
            <>
              <div style={{ width: 1, height: 20, background: '#e8e8e8' }} />
              <Space size={4}>
                <Input
                  size="small"
                  placeholder="搜索..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onPressEnter={handleSearch}
                  style={{ width: 120 }}
                  suffix={<SearchOutlined onClick={handleSearch} style={{ cursor: 'pointer' }} />}
                />
                {searchResults.length > 0 && (
                  <>
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {currentSearchIndex + 1}/{searchResults.length}
                    </span>
                    <Button size="small" onClick={prevSearchResult}>上一个</Button>
                    <Button size="small" onClick={nextSearchResult}>下一个</Button>
                  </>
                )}
              </Space>
            </>
          )}
        </div>
      )}

      {/* PDF 渲染区域 */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 20,
          background: '#f5f5f5',
        }}
      >
        {loading ? (
          <Spin tip="加载中..." />
        ) : pdfData ? (
          <canvas
            ref={canvasRef}
            style={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              background: '#fff',
            }}
          />
        ) : (
          <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>
            请上传 PDF 文件
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFPreview;
