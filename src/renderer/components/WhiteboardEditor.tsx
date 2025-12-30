import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Button, Space, Tooltip, message, Slider, Popover, ColorPicker, Dropdown, Select, InputNumber } from 'antd';
import { 
  SaveOutlined, 
  DownloadOutlined, 
  EditOutlined,
  HighlightOutlined,
  BorderOutlined,
  MinusOutlined,
  UndoOutlined,
  RedoOutlined,
  ClearOutlined,
  DragOutlined,
  FontSizeOutlined,
  BorderlessTableOutlined,
  FileImageOutlined,
  FileOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  AimOutlined,
} from '@ant-design/icons';

interface WhiteboardEditorProps {
  data: string;
  onSave: (data: string) => void;
}

interface DrawingPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  tool: 'pen' | 'highlighter' | 'eraser';
}

interface TextItem {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

interface ShapeItem {
  id: string;
  type: 'rect' | 'circle' | 'line' | 'arrow' | 'triangle' | 'star';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  fill?: string;
}

interface WhiteboardData {
  paths: DrawingPath[];
  texts: TextItem[];
  shapes: ShapeItem[];
  background: string;
}

const DEFAULT_DATA: WhiteboardData = {
  paths: [],
  texts: [],
  shapes: [],
  background: '#ffffff',
};

const COLORS = [
  '#000000', '#ff0000', '#00ff00', '#0000ff', 
  '#ffff00', '#ff00ff', '#00ffff', '#ffffff',
  '#ff6600', '#9900ff', '#00cc99', '#ff3366',
];

// 预设图形库
const SHAPE_LIBRARY = [
  { type: 'rect', label: '矩形', icon: '▭' },
  { type: 'circle', label: '圆形', icon: '○' },
  { type: 'triangle', label: '三角形', icon: '△' },
  { type: 'line', label: '直线', icon: '─' },
  { type: 'arrow', label: '箭头', icon: '→' },
  { type: 'star', label: '五角星', icon: '☆' },
];

const WhiteboardEditor: React.FC<WhiteboardEditorProps> = ({ data, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [undoStack, setUndoStack] = useState<WhiteboardData[]>([]);
  const [redoStack, setRedoStack] = useState<WhiteboardData[]>([]);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'select' | 'text' | 'shape'>('pen');
  const [shapeType, setShapeType] = useState<'rect' | 'circle' | 'line' | 'arrow' | 'triangle' | 'star'>('rect');
  const [color, setColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('transparent');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(16);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [background, setBackground] = useState('#ffffff');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
  const [currentShape, setCurrentShape] = useState<ShapeItem | null>(null);
  const [draggedShape, setDraggedShape] = useState<string | null>(null);

  // 初始化数据
  useEffect(() => {
    try {
      if (data && data !== '{}') {
        const parsed = JSON.parse(data) as WhiteboardData;
        setPaths(parsed.paths || []);
        setTexts(parsed.texts || []);
        setShapes(parsed.shapes || []);
        setBackground(parsed.background || '#ffffff');
      }
    } catch {
      console.warn('Invalid whiteboard data');
    }
  }, []);

  // 调整画布大小
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // 减去左侧图形面板的宽度
        setCanvasSize({ width: rect.width - 80, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // 绘制五角星
  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, outerRadius: number, innerRadius: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const outerAngle = (Math.PI / 2) + (i * 2 * Math.PI / 5);
      const innerAngle = outerAngle + Math.PI / 5;
      if (i === 0) {
        ctx.moveTo(cx + outerRadius * Math.cos(outerAngle), cy - outerRadius * Math.sin(outerAngle));
      } else {
        ctx.lineTo(cx + outerRadius * Math.cos(outerAngle), cy - outerRadius * Math.sin(outerAngle));
      }
      ctx.lineTo(cx + innerRadius * Math.cos(innerAngle), cy - innerRadius * Math.sin(innerAngle));
    }
    ctx.closePath();
  };

  // 绘制形状
  const drawShape = (ctx: CanvasRenderingContext2D, shape: ShapeItem, isDashed = false) => {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.strokeWidth;
    if (isDashed) ctx.setLineDash([5, 5]);
    
    const x = shape.x;
    const y = shape.y;
    const w = shape.width;
    const h = shape.height;
    
    ctx.beginPath();
    
    switch (shape.type) {
      case 'rect':
        if (shape.fill && shape.fill !== 'transparent') {
          ctx.fillStyle = shape.fill;
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
        break;
      case 'circle':
        const radius = Math.sqrt(w ** 2 + h ** 2) / 2;
        ctx.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2);
        if (shape.fill && shape.fill !== 'transparent') {
          ctx.fillStyle = shape.fill;
          ctx.fill();
        }
        ctx.stroke();
        break;
      case 'triangle':
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        if (shape.fill && shape.fill !== 'transparent') {
          ctx.fillStyle = shape.fill;
          ctx.fill();
        }
        ctx.stroke();
        break;
      case 'line':
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
        break;
      case 'arrow':
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
        // 箭头
        const angle = Math.atan2(h, w);
        const arrowLen = 15;
        ctx.moveTo(x + w, y + h);
        ctx.lineTo(x + w - arrowLen * Math.cos(angle - Math.PI / 6), y + h - arrowLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x + w, y + h);
        ctx.lineTo(x + w - arrowLen * Math.cos(angle + Math.PI / 6), y + h - arrowLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
      case 'star':
        const outerR = Math.min(Math.abs(w), Math.abs(h)) / 2;
        const innerR = outerR * 0.4;
        drawStar(ctx, x + w / 2, y + h / 2, outerR, innerR);
        if (shape.fill && shape.fill !== 'transparent') {
          ctx.fillStyle = shape.fill;
          ctx.fill();
        }
        ctx.stroke();
        break;
    }
    
    if (isDashed) ctx.setLineDash([]);
  };

  // 重绘画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 绘制所有形状
    shapes.forEach(shape => drawShape(ctx, shape));

    // 绘制当前形状
    if (currentShape) {
      drawShape(ctx, currentShape, true);
    }

    // 绘制所有路径
    paths.forEach(path => {
      if (path.points.length < 2) return;
      
      ctx.beginPath();
      ctx.strokeStyle = path.tool === 'highlighter' ? `${path.color}80` : path.color;
      ctx.lineWidth = path.tool === 'highlighter' ? path.width * 3 : path.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (path.tool === 'eraser') {
        ctx.strokeStyle = background;
        ctx.lineWidth = path.width * 5;
      }

      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });

    // 绘制当前路径
    if (currentPath.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = tool === 'highlighter' ? `${color}80` : tool === 'eraser' ? background : color;
      ctx.lineWidth = tool === 'highlighter' ? strokeWidth * 3 : tool === 'eraser' ? strokeWidth * 5 : strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }

    // 绘制文本
    texts.forEach(textItem => {
      ctx.font = `${textItem.fontSize}px Arial`;
      ctx.fillStyle = textItem.color;
      ctx.fillText(textItem.text, textItem.x, textItem.y);
    });

    ctx.restore();
  }, [paths, currentPath, color, strokeWidth, tool, canvasSize, background, zoom, pan, shapes, currentShape, texts]);

  // 自动保存
  useEffect(() => {
    const timer = setTimeout(() => {
      const whiteboardData: WhiteboardData = { paths, texts, shapes, background };
      onSave(JSON.stringify(whiteboardData));
    }, 1000);
    return () => clearTimeout(timer);
  }, [paths, texts, shapes, background, onSave]);

  const saveState = useCallback(() => {
    setUndoStack(prev => [...prev, { paths, texts, shapes, background }]);
    setRedoStack([]);
  }, [paths, texts, shapes, background]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  // 处理从图形库拖拽
  const handleShapeDrop = useCallback((e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const shapeTypeData = e.dataTransfer.getData('shapeType');
    if (!shapeTypeData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;

    saveState();
    const newShape: ShapeItem = {
      id: `shape_${Date.now()}`,
      type: shapeTypeData as ShapeItem['type'],
      x: x - 40,
      y: y - 40,
      width: 80,
      height: 80,
      color,
      strokeWidth,
      fill: fillColor,
    };
    setShapes(prev => [...prev, newShape]);
    message.success('已添加图形');
  }, [pan, zoom, color, strokeWidth, fillColor, saveState]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (tool === 'select') return;
    
    const pos = getMousePos(e);
    
    if (tool === 'shape') {
      setShapeStart(pos);
      setCurrentShape({
        id: `shape_${Date.now()}`,
        type: shapeType,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        color,
        strokeWidth,
        fill: fillColor,
      });
      return;
    }

    if (tool === 'text') {
      const text = prompt('请输入文本:');
      if (text) {
        saveState();
        setTexts(prev => [...prev, {
          id: `text_${Date.now()}`,
          x: pos.x,
          y: pos.y,
          text,
          color,
          fontSize,
        }]);
      }
      return;
    }

    setIsDrawing(true);
    setCurrentPath([pos]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    const pos = getMousePos(e);

    if (tool === 'shape' && shapeStart && currentShape) {
      setCurrentShape({
        ...currentShape,
        width: pos.x - shapeStart.x,
        height: pos.y - shapeStart.y,
      });
      return;
    }

    if (!isDrawing || tool === 'select' || tool === 'text') return;
    setCurrentPath(prev => [...prev, pos]);
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (tool === 'shape' && currentShape && shapeStart) {
      if (Math.abs(currentShape.width) > 5 || Math.abs(currentShape.height) > 5) {
        saveState();
        setShapes(prev => [...prev, currentShape]);
      }
      setCurrentShape(null);
      setShapeStart(null);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentPath.length > 1) {
      const newPath: DrawingPath = {
        id: `path_${Date.now()}`,
        points: currentPath,
        color,
        width: strokeWidth,
        tool: tool as 'pen' | 'highlighter' | 'eraser',
      };
      
      saveState();
      setPaths(prev => [...prev, newPath]);
    }
    setCurrentPath([]);
  };

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevState = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, { paths, texts, shapes, background }]);
    setPaths(prevState.paths);
    setTexts(prevState.texts);
    setShapes(prevState.shapes);
    setBackground(prevState.background);
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack, paths, texts, shapes, background]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, { paths, texts, shapes, background }]);
    setPaths(nextState.paths);
    setTexts(nextState.texts);
    setShapes(nextState.shapes);
    setBackground(nextState.background);
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack, paths, texts, shapes, background]);

  const handleClear = useCallback(() => {
    saveState();
    setPaths([]);
    setTexts([]);
    setShapes([]);
  }, [saveState]);

  const handleSave = useCallback(() => {
    const whiteboardData: WhiteboardData = { paths, texts, shapes, background };
    onSave(JSON.stringify(whiteboardData));
    message.success('已保存');
  }, [paths, texts, shapes, background, onSave]);

  const handleExport = useCallback(async (type: 'png' | 'svg' | 'json') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (type === 'json') {
      const whiteboardData: WhiteboardData = { paths, texts, shapes, background };
      const blob = new Blob([JSON.stringify(whiteboardData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whiteboard_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
      return;
    }

    if (type === 'svg') {
      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">`;
      svgContent += `<rect width="100%" height="100%" fill="${background}"/>`;
      
      paths.forEach(path => {
        if (path.points.length < 2) return;
        const d = path.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const strokeColor = path.tool === 'eraser' ? background : path.color;
        const opacity = path.tool === 'highlighter' ? '0.5' : '1';
        const width = path.tool === 'highlighter' ? path.width * 3 : path.tool === 'eraser' ? path.width * 5 : path.width;
        svgContent += `<path d="${d}" stroke="${strokeColor}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
      });
      
      svgContent += '</svg>';
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whiteboard_${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `whiteboard_${Date.now()}.png`;
    a.click();
    message.success('导出成功');
  }, [paths, texts, shapes, background]);

  const handleZoomIn = useCallback(() => setZoom(prev => Math.min(prev * 1.2, 5)), []);
  const handleZoomOut = useCallback(() => setZoom(prev => Math.max(prev / 1.2, 0.2)), []);
  const handleResetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const exportMenu = {
    items: [
      { key: 'png', label: <><FileImageOutlined /> 导出 PNG</>, onClick: () => handleExport('png') },
      { key: 'svg', label: <><FileImageOutlined /> 导出 SVG</>, onClick: () => handleExport('svg') },
      { key: 'json', label: <><FileOutlined /> 导出 JSON</>, onClick: () => handleExport('json') },
    ],
  };

  const shapeMenu = {
    items: SHAPE_LIBRARY.map(s => ({
      key: s.type,
      label: `${s.icon} ${s.label}`,
      onClick: () => { setTool('shape'); setShapeType(s.type as any); },
    })),
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ 
        padding: '8px 12px', 
        borderBottom: '1px solid #f0f0f0',
        background: '#fafafa',
        zIndex: 100,
      }}>
        {/* 第一行：绘图工具 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space size="small">
            <Tooltip title="画笔 (P)">
              <Button type={tool === 'pen' ? 'primary' : 'default'} icon={<EditOutlined />} size="small" onClick={() => setTool('pen')} />
            </Tooltip>
            <Tooltip title="荧光笔 (H)">
              <Button type={tool === 'highlighter' ? 'primary' : 'default'} icon={<HighlightOutlined />} size="small" onClick={() => setTool('highlighter')} />
            </Tooltip>
            <Tooltip title="橡皮擦 (E)">
              <Button type={tool === 'eraser' ? 'primary' : 'default'} icon={<BorderOutlined />} size="small" onClick={() => setTool('eraser')} />
            </Tooltip>
            <Tooltip title="选择 (V)">
              <Button type={tool === 'select' ? 'primary' : 'default'} icon={<DragOutlined />} size="small" onClick={() => setTool('select')} />
            </Tooltip>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Tooltip title="文本 (T)">
              <Button type={tool === 'text' ? 'primary' : 'default'} icon={<FontSizeOutlined />} size="small" onClick={() => setTool('text')} />
            </Tooltip>
            <Dropdown menu={shapeMenu}>
              <Tooltip title="形状">
                <Button type={tool === 'shape' ? 'primary' : 'default'} icon={<BorderlessTableOutlined />} size="small" />
              </Tooltip>
            </Dropdown>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Tooltip title="撤销 (Ctrl+Z)">
              <Button icon={<UndoOutlined />} size="small" onClick={handleUndo} disabled={undoStack.length === 0} />
            </Tooltip>
            <Tooltip title="重做 (Ctrl+Y)">
              <Button icon={<RedoOutlined />} size="small" onClick={handleRedo} disabled={redoStack.length === 0} />
            </Tooltip>
            <Tooltip title="清空">
              <Button icon={<ClearOutlined />} size="small" onClick={handleClear} danger />
            </Tooltip>
          </Space>
          <Space size="small">
            <Tooltip title="放大">
              <Button icon={<ZoomInOutlined />} size="small" onClick={handleZoomIn} />
            </Tooltip>
            <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <Tooltip title="缩小">
              <Button icon={<ZoomOutOutlined />} size="small" onClick={handleZoomOut} />
            </Tooltip>
            <Tooltip title="重置视图">
              <Button icon={<AimOutlined />} size="small" onClick={handleResetView} />
            </Tooltip>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Dropdown menu={exportMenu}>
              <Button icon={<DownloadOutlined />} size="small">导出</Button>
            </Dropdown>
            <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave}>保存</Button>
          </Space>
        </div>
        {/* 第二行：颜色和线条 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Space size="small">
            <span style={{ fontSize: 12, color: '#666' }}>描边:</span>
            <ColorPicker value={color} onChange={(c) => setColor(c.toHexString())} presets={[{ label: '常用', colors: COLORS }]} size="small" />
          </Space>
          <Space size="small">
            <span style={{ fontSize: 12, color: '#666' }}>填充:</span>
            <ColorPicker value={fillColor} onChange={(c) => setFillColor(c.toHexString())} presets={[{ label: '常用', colors: ['transparent', ...COLORS] }]} size="small" />
          </Space>
          <Space size="small">
            <span style={{ fontSize: 12, color: '#666' }}>线宽:</span>
            <Popover content={<div style={{ width: 150 }}><Slider min={1} max={20} value={strokeWidth} onChange={setStrokeWidth} /></div>} title="线条粗细" trigger="click">
              <Button size="small" icon={<MinusOutlined />}>{strokeWidth}px</Button>
            </Popover>
          </Space>
          {tool === 'text' && (
            <Space size="small">
              <span style={{ fontSize: 12, color: '#666' }}>字号:</span>
              <InputNumber size="small" min={8} max={72} value={fontSize} onChange={(v) => setFontSize(v || 16)} style={{ width: 60 }} />
            </Space>
          )}
          <Space size="small">
            <span style={{ fontSize: 12, color: '#666' }}>背景:</span>
            <ColorPicker value={background} onChange={(c) => setBackground(c.toHexString())} presets={[{ label: '常用', colors: ['#ffffff', '#f5f5f5', '#e8e8e8', '#000000', '#fffbe6', '#e6f7ff'] }]} size="small" />
          </Space>
          {tool === 'shape' && (
            <Space size="small">
              <span style={{ fontSize: 12, color: '#666' }}>形状:</span>
              <Select size="small" value={shapeType} onChange={setShapeType} style={{ width: 90 }} options={SHAPE_LIBRARY.map(s => ({ value: s.type, label: `${s.icon} ${s.label}` }))} />
            </Space>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧图形库面板 */}
        <div style={{ 
          width: 80, 
          background: '#fafafa', 
          borderRight: '1px solid #f0f0f0',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 4 }}>图形库</div>
          {SHAPE_LIBRARY.map(shape => (
            <div
              key={shape.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('shapeType', shape.type);
                setDraggedShape(shape.type);
              }}
              onDragEnd={() => setDraggedShape(null)}
              style={{
                width: 60,
                height: 50,
                border: `2px solid ${draggedShape === shape.type ? '#1890ff' : '#d9d9d9'}`,
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                background: '#fff',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1890ff')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = draggedShape === shape.type ? '#1890ff' : '#d9d9d9')}
            >
              <span style={{ fontSize: 20 }}>{shape.icon}</span>
              <span style={{ fontSize: 10, color: '#666' }}>{shape.label}</span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#999', textAlign: 'center', marginTop: 8 }}>
            拖拽到画布
          </div>
        </div>

        {/* 画布容器 */}
        <div 
          ref={containerRef}
          style={{ 
            flex: 1, 
            overflow: 'hidden',
            background: '#e8e8e8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              background: background,
              cursor: tool === 'eraser' ? 'crosshair' : tool === 'text' ? 'text' : tool === 'select' ? 'default' : tool === 'shape' ? 'crosshair' : 'crosshair',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDrop={handleShapeDrop}
            onDragOver={handleDragOver}
          />
        </div>
      </div>

      {/* 操作提示 */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 96,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: 4,
        fontSize: 11,
        zIndex: 10,
      }}>
        从左侧拖拽图形 | 拖拽绘制 | Alt+拖拽 平移 | Ctrl+Z 撤销
      </div>
    </div>
  );
};

export default WhiteboardEditor;
