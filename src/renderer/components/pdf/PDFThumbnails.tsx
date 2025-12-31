/**
 * PDFThumbnails - PDF 缩略图网格组件
 * 实现缩略图渲染、懒加载、页面选择和拖拽排序
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Spin, Checkbox, Button, Tooltip } from 'antd';
import { DeleteOutlined, DragOutlined, RotateLeftOutlined, RotateRightOutlined, SwapOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';

// 设置本地 worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';

// 配置标准字体和 CMap 路径（用于正确渲染文字和中文）
const STANDARD_FONT_DATA_URL = './pdfjs/standard_fonts/';
const CMAP_URL = './pdfjs/cmaps/';
const CMAP_PACKED = true;

// ============ 类型定义 ============

type RotationType = 'cw' | 'ccw' | 'flip-h' | 'flip-v';

export interface PDFThumbnailsProps {
  pdfData: ArrayBuffer | string | null;
  selectedPages: number[];
  onPageSelect: (pages: number[]) => void;
  onPageReorder?: (newOrder: number[]) => void;
  draggable?: boolean;
  showDeleteButton?: boolean;
  onPageDelete?: (page: number) => void;
  showRotateButtons?: boolean;
  onPageRotate?: (page: number, type: RotationType) => void;
  multiSelect?: boolean;
  thumbnailWidth?: number;
  style?: React.CSSProperties;
}

interface ThumbnailState {
  page: number;
  imageUrl: string | null;
  loading: boolean;
}

// ============ PDFThumbnails 组件 ============

const PDFThumbnails: React.FC<PDFThumbnailsProps> = ({
  pdfData,
  selectedPages,
  onPageSelect,
  onPageReorder,
  draggable = false,
  showDeleteButton = false,
  onPageDelete,
  showRotateButtons = false,
  onPageRotate,
  multiSelect = true,
  thumbnailWidth = 120,
  style,
}) => {
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [thumbnails, setThumbnails] = useState<ThumbnailState[]>([]);
  const [loading, setLoading] = useState(false);
  const [draggedPage, setDraggedPage] = useState<number | null>(null);
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);
  const [pageOrder, setPageOrder] = useState<number[]>([]);

  // 加载 PDF 文档
  useEffect(() => {
    if (!pdfData) {
      pdfDocRef.current = null;
      setTotalPages(0);
      setThumbnails([]);
      setPageOrder([]);
      return;
    }

    const loadPDF = async () => {
      setLoading(true);
      try {
        let loadingTask: pdfjsLib.PDFDocumentLoadingTask;
        
        if (typeof pdfData === 'string') {
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
          // 复制 ArrayBuffer 以避免 detached 问题
          // pdfjs 会 transfer ArrayBuffer，导致原始 buffer 被 detached
          const bufferCopy = pdfData.slice(0);
          loadingTask = pdfjsLib.getDocument({ 
            data: bufferCopy,
            standardFontDataUrl: STANDARD_FONT_DATA_URL,
            cMapUrl: CMAP_URL,
            cMapPacked: CMAP_PACKED,
          });
        }

        const pdf = await loadingTask.promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        
        // 初始化页面顺序
        const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
        setPageOrder(order);
        
        // 初始化缩略图状态
        const initialThumbnails: ThumbnailState[] = order.map(page => ({
          page,
          imageUrl: null,
          loading: false,
        }));
        setThumbnails(initialThumbnails);
      } catch (error) {
        console.error('Failed to load PDF:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPDF();

    return () => {
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [pdfData]);

  // 渲染单个缩略图
  const renderThumbnail = useCallback(async (pageNum: number): Promise<string | null> => {
    if (!pdfDocRef.current) return null;

    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const scale = thumbnailWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return null;

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({
        canvas: canvas,
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error(`Failed to render thumbnail for page ${pageNum}:`, error);
      return null;
    }
  }, [thumbnailWidth]);

  // 懒加载：使用 IntersectionObserver 监测可见性
  useEffect(() => {
    if (!containerRef.current || thumbnails.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
            if (pageNum > 0) {
              const thumbnail = thumbnails.find(t => t.page === pageNum);
              if (thumbnail && !thumbnail.imageUrl && !thumbnail.loading) {
                // 标记为加载中
                setThumbnails(prev => prev.map(t => 
                  t.page === pageNum ? { ...t, loading: true } : t
                ));
                
                const imageUrl = await renderThumbnail(pageNum);
                
                setThumbnails(prev => prev.map(t => 
                  t.page === pageNum ? { ...t, imageUrl, loading: false } : t
                ));
              }
            }
          }
        });
      },
      { root: containerRef.current, rootMargin: '100px', threshold: 0.1 }
    );

    // 观察所有缩略图容器
    const thumbnailElements = containerRef.current.querySelectorAll('[data-page]');
    thumbnailElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [thumbnails, renderThumbnail]);

  // 页面选择处理
  const handlePageClick = useCallback((page: number, event: React.MouseEvent) => {
    if (multiSelect) {
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + 点击：切换选择
        if (selectedPages.includes(page)) {
          onPageSelect(selectedPages.filter(p => p !== page));
        } else {
          onPageSelect([...selectedPages, page]);
        }
      } else if (event.shiftKey && selectedPages.length > 0) {
        // Shift + 点击：范围选择
        const lastSelected = selectedPages[selectedPages.length - 1];
        const start = Math.min(lastSelected, page);
        const end = Math.max(lastSelected, page);
        const range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        const newSelection = [...new Set([...selectedPages, ...range])];
        onPageSelect(newSelection);
      } else {
        // 普通点击：单选
        onPageSelect([page]);
      }
    } else {
      onPageSelect([page]);
    }
  }, [multiSelect, selectedPages, onPageSelect]);

  // 复选框选择处理
  const handleCheckboxChange = useCallback((page: number, checked: boolean) => {
    if (checked) {
      onPageSelect([...selectedPages, page]);
    } else {
      onPageSelect(selectedPages.filter(p => p !== page));
    }
  }, [selectedPages, onPageSelect]);

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    if (selectedPages.length === totalPages) {
      onPageSelect([]);
    } else {
      onPageSelect(pageOrder);
    }
  }, [selectedPages, totalPages, pageOrder, onPageSelect]);

  // 拖拽处理
  const handleDragStart = useCallback((page: number, event: React.DragEvent) => {
    if (!draggable) return;
    setDraggedPage(page);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(page));
  }, [draggable]);

  const handleDragOver = useCallback((page: number, event: React.DragEvent) => {
    if (!draggable || draggedPage === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (page !== draggedPage) {
      setDragOverPage(page);
    }
  }, [draggable, draggedPage]);

  const handleDragLeave = useCallback(() => {
    setDragOverPage(null);
  }, []);

  const handleDrop = useCallback((targetPage: number, event: React.DragEvent) => {
    event.preventDefault();
    if (!draggable || draggedPage === null || draggedPage === targetPage) {
      setDraggedPage(null);
      setDragOverPage(null);
      return;
    }

    // 重新排序
    const newOrder = [...pageOrder];
    const draggedIndex = newOrder.indexOf(draggedPage);
    const targetIndex = newOrder.indexOf(targetPage);
    
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedPage);
    
    setPageOrder(newOrder);
    onPageReorder?.(newOrder);
    
    setDraggedPage(null);
    setDragOverPage(null);
  }, [draggable, draggedPage, pageOrder, onPageReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggedPage(null);
    setDragOverPage(null);
  }, []);

  // 删除页面
  const handleDelete = useCallback((page: number, event: React.MouseEvent) => {
    event.stopPropagation();
    onPageDelete?.(page);
  }, [onPageDelete]);

  // 旋转页面
  const handleRotate = useCallback((page: number, type: RotationType, event: React.MouseEvent) => {
    event.stopPropagation();
    onPageRotate?.(page, type);
  }, [onPageRotate]);

  // 按当前顺序排列的缩略图
  const orderedThumbnails = useMemo(() => {
    return pageOrder.map(page => thumbnails.find(t => t.page === page)).filter(Boolean) as ThumbnailState[];
  }, [pageOrder, thumbnails]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (!pdfData || totalPages === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
        请上传 PDF 文件
      </div>
    );
  }

  return (
    <div style={{ ...style }}>
      {/* 工具栏 */}
      {multiSelect && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button size="small" onClick={handleSelectAll}>
            {selectedPages.length === totalPages ? '取消全选' : '全选'}
          </Button>
          <span style={{ color: '#666', fontSize: 12 }}>
            已选择 {selectedPages.length} / {totalPages} 页
          </span>
        </div>
      )}

      {/* 缩略图网格 */}
      <div
        ref={containerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailWidth + 20}px, 1fr))`,
          gap: 12,
          maxHeight: 400,
          overflowY: 'auto',
          padding: 8,
        }}
      >
        {orderedThumbnails.map((thumbnail, index) => {
          const isSelected = selectedPages.includes(thumbnail.page);
          const isDragging = draggedPage === thumbnail.page;
          const isDragOver = dragOverPage === thumbnail.page;

          return (
            <div
              key={thumbnail.page}
              data-page={thumbnail.page}
              draggable={draggable}
              onDragStart={(e) => handleDragStart(thumbnail.page, e)}
              onDragOver={(e) => handleDragOver(thumbnail.page, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(thumbnail.page, e)}
              onDragEnd={handleDragEnd}
              onClick={(e) => handlePageClick(thumbnail.page, e)}
              style={{
                position: 'relative',
                padding: 8,
                border: `2px solid ${isSelected ? '#1890ff' : isDragOver ? '#52c41a' : '#e8e8e8'}`,
                borderRadius: 4,
                background: isSelected ? '#e6f7ff' : isDragOver ? '#f6ffed' : '#fff',
                cursor: draggable ? 'grab' : 'pointer',
                opacity: isDragging ? 0.5 : 1,
                transition: 'all 0.2s',
                userSelect: 'none',
              }}
            >
              {/* 拖拽手柄 */}
              {draggable && (
                <div style={{ position: 'absolute', top: 4, left: 4, color: '#999' }}>
                  <DragOutlined />
                </div>
              )}

              {/* 复选框 */}
              {multiSelect && (
                <div style={{ position: 'absolute', top: 4, right: 4 }}>
                  <Checkbox
                    checked={isSelected}
                    onChange={(e) => handleCheckboxChange(thumbnail.page, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              {/* 缩略图 */}
              <div style={{ 
                width: thumbnailWidth, 
                minHeight: thumbnailWidth * 1.4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f5f5f5',
              }}>
                {thumbnail.loading ? (
                  <Spin size="small" />
                ) : thumbnail.imageUrl ? (
                  <img
                    src={thumbnail.imageUrl}
                    alt={`Page ${thumbnail.page}`}
                    style={{ maxWidth: '100%', maxHeight: '100%', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                  />
                ) : (
                  <div style={{ color: '#999', fontSize: 12 }}>加载中...</div>
                )}
              </div>

              {/* 页码 */}
              <div style={{ 
                textAlign: 'center', 
                marginTop: 4, 
                fontSize: 12,
                color: isSelected ? '#1890ff' : '#666',
                fontWeight: isSelected ? 'bold' : 'normal',
              }}>
                {draggable ? `${index + 1}` : thumbnail.page}
                {draggable && thumbnail.page !== index + 1 && (
                  <span style={{ color: '#999', marginLeft: 4 }}>(原{thumbnail.page})</span>
                )}
              </div>

              {/* 删除按钮 */}
              {showDeleteButton && (
                <Tooltip title="删除此页">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => handleDelete(thumbnail.page, e)}
                    style={{ position: 'absolute', bottom: 4, right: 4 }}
                  />
                </Tooltip>
              )}

              {/* 旋转按钮组 */}
              {showRotateButtons && (
                <div style={{ 
                  position: 'absolute', 
                  bottom: 4, 
                  left: '50%', 
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: 2,
                  background: 'rgba(255,255,255,0.9)',
                  borderRadius: 4,
                  padding: '2px 4px',
                }}>
                  <Tooltip title="逆时针旋转">
                    <Button
                      type="text"
                      size="small"
                      icon={<RotateLeftOutlined />}
                      onClick={(e) => handleRotate(thumbnail.page, 'ccw', e)}
                      style={{ padding: '0 4px', height: 24 }}
                    />
                  </Tooltip>
                  <Tooltip title="顺时针旋转">
                    <Button
                      type="text"
                      size="small"
                      icon={<RotateRightOutlined />}
                      onClick={(e) => handleRotate(thumbnail.page, 'cw', e)}
                      style={{ padding: '0 4px', height: 24 }}
                    />
                  </Tooltip>
                  <Tooltip title="翻转 180°">
                    <Button
                      type="text"
                      size="small"
                      icon={<SwapOutlined style={{ transform: 'rotate(90deg)' }} />}
                      onClick={(e) => handleRotate(thumbnail.page, 'flip-v', e)}
                      style={{ padding: '0 4px', height: 24 }}
                    />
                  </Tooltip>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PDFThumbnails;
