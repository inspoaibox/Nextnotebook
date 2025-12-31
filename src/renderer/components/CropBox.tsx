/**
 * CropBox - 可视化裁剪框组件
 * 支持拖拽移动和调整大小
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// 裁剪框状态
export interface CropBoxState {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 组件属性
interface CropBoxProps {
  // 图片尺寸
  imageWidth: number;
  imageHeight: number;
  // 裁剪框状态
  cropState: CropBoxState;
  // 状态变化回调
  onChange: (state: CropBoxState) => void;
  // 容器尺寸（用于计算缩放比例）
  containerWidth?: number;
  containerHeight?: number;
  // 是否禁用
  disabled?: boolean;
  // 最小裁剪尺寸
  minWidth?: number;
  minHeight?: number;
}

// 拖拽类型
type DragType = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

const CropBox: React.FC<CropBoxProps> = ({
  imageWidth,
  imageHeight,
  cropState,
  onChange,
  containerWidth = 400,
  containerHeight = 300,
  disabled = false,
  minWidth = 10,
  minHeight = 10,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragType, setDragType] = useState<DragType>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialState, setInitialState] = useState<CropBoxState>(cropState);

  // 计算缩放比例
  const scale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight
  );

  // 实际显示尺寸
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  // 裁剪框在显示坐标系中的位置
  const displayCrop = {
    left: cropState.left * scale,
    top: cropState.top * scale,
    width: cropState.width * scale,
    height: cropState.height * scale,
  };

  // 约束裁剪框在图片边界内
  const constrainCrop = useCallback((state: CropBoxState): CropBoxState => {
    let { left, top, width, height } = state;

    // 确保尺寸不小于最小值
    width = Math.max(minWidth, width);
    height = Math.max(minHeight, height);

    // 确保尺寸不超过图片
    width = Math.min(width, imageWidth);
    height = Math.min(height, imageHeight);

    // 确保位置在边界内
    left = Math.max(0, Math.min(left, imageWidth - width));
    top = Math.max(0, Math.min(top, imageHeight - height));

    return { left, top, width, height };
  }, [imageWidth, imageHeight, minWidth, minHeight]);

  // 开始拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent, type: DragType) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    setDragType(type);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialState(cropState);
  }, [disabled, cropState]);

  // 拖拽中
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragType) return;

    const deltaX = (e.clientX - dragStart.x) / scale;
    const deltaY = (e.clientY - dragStart.y) / scale;

    let newState = { ...initialState };

    switch (dragType) {
      case 'move':
        newState.left = initialState.left + deltaX;
        newState.top = initialState.top + deltaY;
        break;
      case 'n':
        newState.top = initialState.top + deltaY;
        newState.height = initialState.height - deltaY;
        break;
      case 's':
        newState.height = initialState.height + deltaY;
        break;
      case 'e':
        newState.width = initialState.width + deltaX;
        break;
      case 'w':
        newState.left = initialState.left + deltaX;
        newState.width = initialState.width - deltaX;
        break;
      case 'ne':
        newState.top = initialState.top + deltaY;
        newState.height = initialState.height - deltaY;
        newState.width = initialState.width + deltaX;
        break;
      case 'nw':
        newState.top = initialState.top + deltaY;
        newState.height = initialState.height - deltaY;
        newState.left = initialState.left + deltaX;
        newState.width = initialState.width - deltaX;
        break;
      case 'se':
        newState.height = initialState.height + deltaY;
        newState.width = initialState.width + deltaX;
        break;
      case 'sw':
        newState.height = initialState.height + deltaY;
        newState.left = initialState.left + deltaX;
        newState.width = initialState.width - deltaX;
        break;
    }

    onChange(constrainCrop(newState));
  }, [dragType, dragStart, initialState, scale, onChange, constrainCrop]);

  // 结束拖拽
  const handleMouseUp = useCallback(() => {
    setDragType(null);
  }, []);

  // 绑定全局鼠标事件
  useEffect(() => {
    if (dragType) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragType, handleMouseMove, handleMouseUp]);

  // 手柄样式
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#1890ff',
    border: '1px solid #fff',
    borderRadius: 2,
  };

  // 边缘手柄样式
  const edgeHandleStyle: React.CSSProperties = {
    position: 'absolute',
    background: 'transparent',
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
    >
      {/* 遮罩层 - 上 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: displayCrop.top,
          background: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* 遮罩层 - 下 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: displayCrop.top + displayCrop.height,
          width: '100%',
          height: `calc(100% - ${displayCrop.top + displayCrop.height}px)`,
          background: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* 遮罩层 - 左 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: displayCrop.top,
          width: displayCrop.left,
          height: displayCrop.height,
          background: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* 遮罩层 - 右 */}
      <div
        style={{
          position: 'absolute',
          left: displayCrop.left + displayCrop.width,
          top: displayCrop.top,
          width: `calc(100% - ${displayCrop.left + displayCrop.width}px)`,
          height: displayCrop.height,
          background: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />

      {/* 裁剪框 */}
      <div
        style={{
          position: 'absolute',
          left: displayCrop.left,
          top: displayCrop.top,
          width: displayCrop.width,
          height: displayCrop.height,
          border: '2px dashed #1890ff',
          boxSizing: 'border-box',
          cursor: disabled ? 'default' : 'move',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {/* 尺寸标签 */}
        <div
          style={{
            position: 'absolute',
            bottom: -24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          {Math.round(cropState.width)} × {Math.round(cropState.height)}
        </div>

        {!disabled && (
          <>
            {/* 角落手柄 */}
            <div
              style={{ ...handleStyle, left: -5, top: -5, cursor: 'nw-resize' }}
              onMouseDown={(e) => handleMouseDown(e, 'nw')}
            />
            <div
              style={{ ...handleStyle, right: -5, top: -5, cursor: 'ne-resize' }}
              onMouseDown={(e) => handleMouseDown(e, 'ne')}
            />
            <div
              style={{ ...handleStyle, left: -5, bottom: -5, cursor: 'sw-resize' }}
              onMouseDown={(e) => handleMouseDown(e, 'sw')}
            />
            <div
              style={{ ...handleStyle, right: -5, bottom: -5, cursor: 'se-resize' }}
              onMouseDown={(e) => handleMouseDown(e, 'se')}
            />

            {/* 边缘手柄 */}
            <div
              style={{
                ...edgeHandleStyle,
                left: '50%',
                top: -5,
                width: 20,
                height: 10,
                marginLeft: -10,
                cursor: 'n-resize',
              }}
              onMouseDown={(e) => handleMouseDown(e, 'n')}
            >
              <div style={{ ...handleStyle, left: 5, top: 0 }} />
            </div>
            <div
              style={{
                ...edgeHandleStyle,
                left: '50%',
                bottom: -5,
                width: 20,
                height: 10,
                marginLeft: -10,
                cursor: 's-resize',
              }}
              onMouseDown={(e) => handleMouseDown(e, 's')}
            >
              <div style={{ ...handleStyle, left: 5, top: 0 }} />
            </div>
            <div
              style={{
                ...edgeHandleStyle,
                left: -5,
                top: '50%',
                width: 10,
                height: 20,
                marginTop: -10,
                cursor: 'w-resize',
              }}
              onMouseDown={(e) => handleMouseDown(e, 'w')}
            >
              <div style={{ ...handleStyle, left: 0, top: 5 }} />
            </div>
            <div
              style={{
                ...edgeHandleStyle,
                right: -5,
                top: '50%',
                width: 10,
                height: 20,
                marginTop: -10,
                cursor: 'e-resize',
              }}
              onMouseDown={(e) => handleMouseDown(e, 'e')}
            >
              <div style={{ ...handleStyle, left: 0, top: 5 }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CropBox;
