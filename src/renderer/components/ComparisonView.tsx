/**
 * ComparisonView - 处理前后对比视图组件
 * 支持滑块分割视图，水平和垂直对比模式
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Radio, Typography } from 'antd';

const { Text } = Typography;

// 对比模式
export type ComparisonMode = 'horizontal' | 'vertical' | 'side-by-side';

// 组件属性
interface ComparisonViewProps {
  // 原始图片 URL
  originalUrl: string;
  // 处理后图片 URL
  processedUrl: string;
  // 对比模式
  mode?: ComparisonMode;
  // 模式变化回调
  onModeChange?: (mode: ComparisonMode) => void;
  // 容器宽度
  width?: number;
  // 容器高度
  height?: number;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({
  originalUrl,
  processedUrl,
  mode = 'horizontal',
  onModeChange,
  width = 400,
  height = 300,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPosition, setSliderPosition] = useState(50); // 百分比
  const [isDragging, setIsDragging] = useState(false);

  // 处理滑块拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    
    if (mode === 'horizontal') {
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    } else if (mode === 'vertical') {
      const y = e.clientY - rect.top;
      const percentage = Math.max(0, Math.min(100, (y / rect.height) * 100));
      setSliderPosition(percentage);
    }
  }, [isDragging, mode]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 绑定全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 渲染滑块对比视图
  const renderSliderView = () => {
    const isHorizontal = mode === 'horizontal';
    
    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width,
          height,
          overflow: 'hidden',
          cursor: isDragging ? (isHorizontal ? 'ew-resize' : 'ns-resize') : 'default',
          userSelect: 'none',
        }}
      >
        {/* 处理后图片（底层） */}
        <img
          src={processedUrl}
          alt="处理后"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />

        {/* 原始图片（裁剪层） */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: isHorizontal ? `${sliderPosition}%` : '100%',
            height: isHorizontal ? '100%' : `${sliderPosition}%`,
            overflow: 'hidden',
          }}
        >
          <img
            src={originalUrl}
            alt="原始"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: containerRef.current?.offsetWidth || width,
              height: containerRef.current?.offsetHeight || height,
              objectFit: 'contain',
            }}
          />
        </div>

        {/* 滑块 */}
        <div
          style={{
            position: 'absolute',
            ...(isHorizontal
              ? {
                  left: `${sliderPosition}%`,
                  top: 0,
                  width: 4,
                  height: '100%',
                  transform: 'translateX(-50%)',
                  cursor: 'ew-resize',
                }
              : {
                  top: `${sliderPosition}%`,
                  left: 0,
                  width: '100%',
                  height: 4,
                  transform: 'translateY(-50%)',
                  cursor: 'ns-resize',
                }),
            background: '#1890ff',
            zIndex: 10,
          }}
          onMouseDown={handleMouseDown}
        >
          {/* 滑块手柄 */}
          <div
            style={{
              position: 'absolute',
              ...(isHorizontal
                ? {
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 24,
                    height: 24,
                  }
                : {
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 24,
                    height: 24,
                  }),
              background: '#1890ff',
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#fff', fontSize: 12 }}>
              {isHorizontal ? '⟷' : '⟵⟶'}
            </span>
          </div>
        </div>

        {/* 标签 */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          原图
        </div>
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          处理后
        </div>

        {/* 比例显示 */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {Math.round(sliderPosition)}%
        </div>
      </div>
    );
  };

  // 渲染并排对比视图
  const renderSideBySideView = () => (
    <div style={{ display: 'flex', gap: 8, width }}>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>原图</Text>
        <img
          src={originalUrl}
          alt="原始"
          style={{
            maxWidth: '100%',
            maxHeight: height - 24,
            objectFit: 'contain',
          }}
        />
      </div>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>处理后</Text>
        <img
          src={processedUrl}
          alt="处理后"
          style={{
            maxWidth: '100%',
            maxHeight: height - 24,
            objectFit: 'contain',
          }}
        />
      </div>
    </div>
  );

  return (
    <div>
      {/* 模式选择 */}
      <div style={{ marginBottom: 8, textAlign: 'center' }}>
        <Radio.Group
          value={mode}
          onChange={(e) => onModeChange?.(e.target.value)}
          size="small"
        >
          <Radio.Button value="horizontal">水平对比</Radio.Button>
          <Radio.Button value="vertical">垂直对比</Radio.Button>
          <Radio.Button value="side-by-side">并排对比</Radio.Button>
        </Radio.Group>
      </div>

      {/* 对比视图 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {mode === 'side-by-side' ? renderSideBySideView() : renderSliderView()}
      </div>
    </div>
  );
};

export default ComparisonView;
