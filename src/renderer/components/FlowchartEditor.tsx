import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Button, Space, Tooltip, message, Dropdown, Input, Modal, Select, Divider } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  DownloadOutlined,
  UndoOutlined,
  RedoOutlined,
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileOutlined,
} from '@ant-design/icons';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  NodeProps,
  Handle,
  Position,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface FlowchartEditorProps {
  data: string;
  onSave: (data: string) => void;
}

// 默认流程图数据
const DEFAULT_FLOW_DATA: { nodes: Node[]; edges: Edge[] } = {
  nodes: [
    {
      id: '1',
      type: 'startNode',
      data: { label: '开始' },
      position: { x: 250, y: 50 },
    },
  ],
  edges: [],
};

let nodeId = 100;
const getNodeId = () => `node_${nodeId++}`;

// 节点类型选项
const NODE_TYPES_OPTIONS = [
  { key: 'startNode', label: '开始节点', color: '#52c41a' },
  { key: 'endNode', label: '结束节点', color: '#ff4d4f' },
  { key: 'processNode', label: '处理节点', color: '#1890ff' },
  { key: 'decisionNode', label: '判断节点', color: '#faad14' },
  { key: 'customNode', label: '普通节点', color: '#722ed1' },
];

// 开始节点（圆角矩形，绿色）
const StartNode: React.FC<NodeProps> = ({ data, selected }) => (
  <div style={{
    padding: '10px 24px',
    borderRadius: 20,
    background: selected ? '#b7eb8f' : '#d9f7be',
    border: `2px solid ${selected ? '#52c41a' : '#95de64'}`,
    minWidth: 80,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 500,
  }}>
    <div>{data.label as string}</div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#52c41a', width: 8, height: 8 }} />
  </div>
);

// 结束节点（圆角矩形，红色）
const EndNode: React.FC<NodeProps> = ({ data, selected }) => (
  <div style={{
    padding: '10px 24px',
    borderRadius: 20,
    background: selected ? '#ffa39e' : '#ffccc7',
    border: `2px solid ${selected ? '#ff4d4f' : '#ff7875'}`,
    minWidth: 80,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 500,
  }}>
    <Handle type="target" position={Position.Top} style={{ background: '#ff4d4f', width: 8, height: 8 }} />
    <div>{data.label as string}</div>
  </div>
);

// 处理节点（矩形，蓝色）
const ProcessNode: React.FC<NodeProps> = ({ data, selected }) => (
  <div style={{
    padding: '12px 24px',
    borderRadius: 4,
    background: selected ? '#bae0ff' : '#e6f4ff',
    border: `2px solid ${selected ? '#1890ff' : '#69b1ff'}`,
    minWidth: 120,
    textAlign: 'center',
    fontSize: 14,
  }}>
    <Handle type="target" position={Position.Top} style={{ background: '#1890ff', width: 8, height: 8 }} />
    <div>{data.label as string}</div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#1890ff', width: 8, height: 8 }} />
  </div>
);

// 判断节点（菱形，黄色）
const DecisionNode: React.FC<NodeProps> = ({ data, selected }) => (
  <div style={{
    width: 100,
    height: 100,
    background: selected ? '#ffe58f' : '#fffbe6',
    border: `2px solid ${selected ? '#faad14' : '#ffc53d'}`,
    transform: 'rotate(45deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  }}>
    <Handle 
      type="target" 
      position={Position.Top} 
      style={{ 
        background: '#faad14', 
        width: 8, 
        height: 8,
        transform: 'rotate(-45deg)',
        top: -4,
        left: '50%',
      }} 
    />
    <div style={{ 
      transform: 'rotate(-45deg)', 
      fontSize: 13, 
      textAlign: 'center', 
      padding: 4,
      maxWidth: 70,
      wordBreak: 'break-word',
    }}>
      {data.label as string}
    </div>
    <Handle 
      type="source" 
      position={Position.Bottom} 
      id="bottom" 
      style={{ 
        background: '#faad14', 
        width: 8, 
        height: 8,
        transform: 'rotate(-45deg)',
        bottom: -4,
        left: '50%',
      }} 
    />
    <Handle 
      type="source" 
      position={Position.Right} 
      id="right" 
      style={{ 
        background: '#faad14', 
        width: 8, 
        height: 8,
        transform: 'rotate(-45deg)',
        right: -4,
        top: '50%',
      }} 
    />
  </div>
);

// 普通节点（紫色）
const CustomNode: React.FC<NodeProps> = ({ data, selected }) => (
  <div style={{
    padding: '12px 24px',
    borderRadius: 8,
    background: selected ? '#d3adf7' : '#f9f0ff',
    border: `2px solid ${selected ? '#722ed1' : '#b37feb'}`,
    minWidth: 100,
    textAlign: 'center',
    fontSize: 14,
  }}>
    <Handle type="target" position={Position.Top} style={{ background: '#722ed1', width: 8, height: 8 }} />
    <div>{data.label as string}</div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#722ed1', width: 8, height: 8 }} />
  </div>
);

const nodeTypes = {
  startNode: StartNode,
  endNode: EndNode,
  processNode: ProcessNode,
  decisionNode: DecisionNode,
  customNode: CustomNode,
};

const FlowchartEditorInner: React.FC<FlowchartEditorProps> = ({ data, onSave }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(DEFAULT_FLOW_DATA.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(DEFAULT_FLOW_DATA.edges);
  const { fitView, zoomIn, zoomOut, getNodes, getEdges, screenToFlowPosition, getViewport, setViewport } = useReactFlow();
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [clipboard, setClipboard] = useState<Node[]>([]);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // 初始化数据
  useEffect(() => {
    try {
      let flowData = DEFAULT_FLOW_DATA;
      if (data && data !== '{}') {
        flowData = JSON.parse(data);
      }
      setNodes(flowData.nodes || DEFAULT_FLOW_DATA.nodes);
      setEdges(flowData.edges || DEFAULT_FLOW_DATA.edges);
      setIsInitialized(true);
      
      // 更新节点 ID 计数器
      const maxId = Math.max(
        ...(flowData.nodes || []).map((n: Node) => {
          const match = n.id.match(/node_(\d+)/);
          return match ? parseInt(match[1]) : 0;
        }),
        0
      );
      nodeId = maxId + 1;
      
      // 初始化历史记录
      setHistory([{ nodes: flowData.nodes || [], edges: flowData.edges || [] }]);
      setHistoryIndex(0);
    } catch {
      console.warn('Invalid flowchart data, using default');
      setNodes(DEFAULT_FLOW_DATA.nodes);
      setEdges(DEFAULT_FLOW_DATA.edges);
      setIsInitialized(true);
    }
  }, [data, setNodes, setEdges]);

  // 保存历史记录
  const saveHistory = useCallback(() => {
    const currentState = { nodes: getNodes(), edges: getEdges() };
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, currentState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [getNodes, getEdges, historyIndex]);

  // 自动保存
  useEffect(() => {
    if (!isInitialized) return;

    const timer = setTimeout(() => {
      const flowData = {
        nodes: getNodes(),
        edges: getEdges(),
      };
      onSave(JSON.stringify(flowData));
    }, 1000);

    return () => clearTimeout(timer);
  }, [nodes, edges, isInitialized, getNodes, getEdges, onSave]);

  // 连接边
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ 
        ...params, 
        animated: true,
        style: { stroke: '#1890ff', strokeWidth: 2 },
      }, eds));
      saveHistory();
    },
    [setEdges, saveHistory]
  );

  // 添加节点
  const handleAddNode = useCallback((type: string = 'customNode') => {
    const labels: Record<string, string> = {
      startNode: '开始',
      endNode: '结束',
      processNode: '处理',
      decisionNode: '判断?',
      customNode: '新节点',
    };
    const newNode: Node = {
      id: getNodeId(),
      type,
      data: { label: labels[type] || '新节点' },
      position: { x: Math.random() * 300 + 100, y: Math.random() * 300 + 100 },
    };
    setNodes((nds) => [...nds, newNode]);
    saveHistory();
  }, [setNodes, saveHistory]);

  // 删除选中的节点和边
  const handleDelete = useCallback(() => {
    const selectedNodes = getNodes().filter(n => n.selected);
    const selectedEdges = getEdges().filter(e => e.selected);
    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      message.warning('请先选中要删除的节点或连线');
      return;
    }
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
    saveHistory();
    message.success('已删除');
  }, [setNodes, setEdges, getNodes, getEdges, saveHistory]);

  // 复制
  const handleCopy = useCallback(() => {
    const selectedNodes = getNodes().filter(n => n.selected);
    if (selectedNodes.length === 0) {
      message.warning('请先选中要复制的节点');
      return;
    }
    setClipboard(selectedNodes);
    message.success(`已复制 ${selectedNodes.length} 个节点`);
  }, [getNodes]);

  // 剪切
  const handleCut = useCallback(() => {
    const selectedNodes = getNodes().filter(n => n.selected);
    if (selectedNodes.length === 0) {
      message.warning('请先选中要剪切的节点');
      return;
    }
    setClipboard(selectedNodes);
    setNodes((nds) => nds.filter((node) => !node.selected));
    saveHistory();
    message.success(`已剪切 ${selectedNodes.length} 个节点`);
  }, [getNodes, setNodes, saveHistory]);

  // 粘贴
  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) {
      message.warning('剪贴板为空');
      return;
    }
    const newNodes = clipboard.map(node => ({
      ...node,
      id: getNodeId(),
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      selected: false,
    }));
    setNodes((nds) => [...nds, ...newNodes]);
    saveHistory();
    message.success(`已粘贴 ${newNodes.length} 个节点`);
  }, [clipboard, setNodes, saveHistory]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) {
      message.warning('没有可撤销的操作');
      return;
    }
    const prevState = history[historyIndex - 1];
    setNodes(prevState.nodes);
    setEdges(prevState.edges);
    setHistoryIndex(prev => prev - 1);
  }, [history, historyIndex, setNodes, setEdges]);

  // 重做
  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) {
      message.warning('没有可重做的操作');
      return;
    }
    const nextState = history[historyIndex + 1];
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    setHistoryIndex(prev => prev + 1);
  }, [history, historyIndex, setNodes, setEdges]);

  // 手动保存
  const handleSave = useCallback(() => {
    const flowData = {
      nodes: getNodes(),
      edges: getEdges(),
    };
    onSave(JSON.stringify(flowData));
    message.success('已保存');
  }, [getNodes, getEdges, onSave]);

  // 双击节点编辑
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setEditingNode(node.id);
    setEditingLabel(node.data.label as string);
  }, []);

  // 保存节点编辑
  const handleSaveNodeLabel = useCallback(() => {
    if (!editingNode) return;
    setNodes((nds) => nds.map((n) => 
      n.id === editingNode ? { ...n, data: { ...n.data, label: editingLabel } } : n
    ));
    setEditingNode(null);
    setEditingLabel('');
    saveHistory();
  }, [editingNode, editingLabel, setNodes, saveHistory]);

  // 右键菜单
  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    if (!reactFlowWrapper.current) return;
    
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    
    const newNode: Node = {
      id: getNodeId(),
      type: 'customNode',
      data: { label: '新节点' },
      position,
    };
    setNodes((nds) => [...nds, newNode]);
    saveHistory();
  }, [screenToFlowPosition, setNodes, saveHistory]);

  // 导出为图片
  const handleExport = useCallback(async (type: 'png' | 'svg' | 'json') => {
    try {
      if (type === 'json') {
        const flowData = { nodes: getNodes(), edges: getEdges() };
        const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flowchart_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('导出成功');
        return;
      }

      // 使用 html2canvas 导出
      const flowContainer = reactFlowWrapper.current?.querySelector('.react-flow') as HTMLElement;
      if (!flowContainer) {
        message.error('无法获取流程图');
        return;
      }

      message.loading({ content: '正在导出...', key: 'export' });

      // 动态导入 html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(flowContainer, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      if (type === 'png') {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `flowchart_${Date.now()}.png`;
        a.click();
        message.success({ content: '导出成功', key: 'export' });
      } else if (type === 'svg') {
        // SVG 导出 - 生成简化的 SVG
        const nodes = getNodes();
        const edges = getEdges();
        const bounds = flowContainer.getBoundingClientRect();
        
        let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g>`;
        
        // 绘制节点
        nodes.forEach(node => {
          const colors: Record<string, { bg: string; border: string }> = {
            startNode: { bg: '#d9f7be', border: '#52c41a' },
            endNode: { bg: '#ffccc7', border: '#ff4d4f' },
            processNode: { bg: '#e6f4ff', border: '#1890ff' },
            decisionNode: { bg: '#fffbe6', border: '#faad14' },
            customNode: { bg: '#f9f0ff', border: '#722ed1' },
          };
          const color = colors[node.type || 'customNode'] || colors.customNode;
          const x = node.position.x + 150;
          const y = node.position.y + 100;
          
          if (node.type === 'decisionNode') {
            svgContent += `
    <g transform="translate(${x}, ${y})">
      <rect x="-40" y="-40" width="80" height="80" fill="${color.bg}" stroke="${color.border}" stroke-width="2" transform="rotate(45)"/>
      <text text-anchor="middle" dominant-baseline="middle" font-size="12">${node.data.label}</text>
    </g>`;
          } else {
            const rx = node.type === 'startNode' || node.type === 'endNode' ? 20 : 4;
            svgContent += `
    <g transform="translate(${x}, ${y})">
      <rect x="-50" y="-20" width="100" height="40" rx="${rx}" fill="${color.bg}" stroke="${color.border}" stroke-width="2"/>
      <text text-anchor="middle" dominant-baseline="middle" font-size="13">${node.data.label}</text>
    </g>`;
          }
        });
        
        // 绘制边
        edges.forEach(edge => {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          if (sourceNode && targetNode) {
            const x1 = sourceNode.position.x + 150;
            const y1 = sourceNode.position.y + 140;
            const x2 = targetNode.position.x + 150;
            const y2 = targetNode.position.y + 80;
            svgContent += `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1890ff" stroke-width="2" marker-end="url(#arrowhead)"/>`;
          }
        });
        
        svgContent += `
  </g>
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#1890ff"/>
    </marker>
  </defs>
</svg>`;
        
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flowchart_${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
        message.success({ content: '导出成功', key: 'export' });
      }
    } catch (error) {
      console.error('Export failed:', error);
      message.error({ content: '导出失败: ' + (error as Error).message, key: 'export' });
    }
  }, [getNodes, getEdges]);

  // 全选
  const handleSelectAll = useCallback(() => {
    setNodes((nds) => nds.map(n => ({ ...n, selected: true })));
    setEdges((eds) => eds.map(e => ({ ...e, selected: true })));
  }, [setNodes, setEdges]);

  // 取消选择
  const handleDeselectAll = useCallback(() => {
    setNodes((nds) => nds.map(n => ({ ...n, selected: false })));
    setEdges((eds) => eds.map(e => ({ ...e, selected: false })));
  }, [setNodes, setEdges]);

  const addNodeMenu = {
    items: NODE_TYPES_OPTIONS.map(t => ({
      key: t.key,
      label: (
        <span>
          <span style={{ 
            display: 'inline-block', 
            width: 12, 
            height: 12, 
            borderRadius: 2, 
            background: t.color, 
            marginRight: 8,
            verticalAlign: 'middle',
          }} />
          {t.label}
        </span>
      ),
      onClick: () => handleAddNode(t.key),
    })),
  };

  const exportMenu = {
    items: [
      { key: 'png', label: <><FileImageOutlined /> 导出 PNG</>, onClick: () => handleExport('png') },
      { key: 'svg', label: <><FileImageOutlined /> 导出 SVG</>, onClick: () => handleExport('svg') },
      { key: 'json', label: <><FileOutlined /> 导出 JSON</>, onClick: () => handleExport('json') },
    ],
  };

  const editMenu = {
    items: [
      { key: 'copy', label: <><CopyOutlined /> 复制 (Ctrl+C)</>, onClick: handleCopy },
      { key: 'cut', label: <><ScissorOutlined /> 剪切 (Ctrl+X)</>, onClick: handleCut },
      { key: 'paste', label: <><SnippetsOutlined /> 粘贴 (Ctrl+V)</>, onClick: handlePaste },
      { type: 'divider' as const },
      { key: 'selectAll', label: '全选 (Ctrl+A)', onClick: handleSelectAll },
      { key: 'deselectAll', label: '取消选择', onClick: handleDeselectAll },
    ],
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
        {/* 第一行：主要操作 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space size="small">
            <Dropdown menu={addNodeMenu}>
              <Button icon={<PlusOutlined />} size="small">添加节点</Button>
            </Dropdown>
            <Tooltip title="删除选中 (Delete)">
              <Button icon={<DeleteOutlined />} size="small" onClick={handleDelete} danger />
            </Tooltip>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Dropdown menu={editMenu}>
              <Button size="small">编辑</Button>
            </Dropdown>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Tooltip title="撤销 (Ctrl+Z)">
              <Button icon={<UndoOutlined />} size="small" onClick={handleUndo} disabled={historyIndex <= 0} />
            </Tooltip>
            <Tooltip title="重做 (Ctrl+Y)">
              <Button icon={<RedoOutlined />} size="small" onClick={handleRedo} disabled={historyIndex >= history.length - 1} />
            </Tooltip>
          </Space>
          <Space size="small">
            <Tooltip title="放大">
              <Button icon={<ZoomInOutlined />} size="small" onClick={() => zoomIn()} />
            </Tooltip>
            <Tooltip title="缩小">
              <Button icon={<ZoomOutOutlined />} size="small" onClick={() => zoomOut()} />
            </Tooltip>
            <Tooltip title="适应画布">
              <Button icon={<ExpandOutlined />} size="small" onClick={() => fitView()} />
            </Tooltip>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Dropdown menu={exportMenu}>
              <Button icon={<DownloadOutlined />} size="small">导出</Button>
            </Dropdown>
            <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave}>保存</Button>
          </Space>
        </div>
        {/* 第二行：快捷节点添加 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#666' }}>快速添加:</span>
          {NODE_TYPES_OPTIONS.map(t => (
            <Tooltip key={t.key} title={t.label}>
              <Button 
                size="small" 
                onClick={() => handleAddNode(t.key)}
                style={{ 
                  borderColor: t.color,
                  color: t.color,
                }}
              >
                {t.label.replace('节点', '')}
              </Button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* 流程图容器 */}
      <div style={{ flex: 1 }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#1890ff', strokeWidth: 2 } }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Controls />
          <MiniMap 
            nodeColor={(node) => {
              const colors: Record<string, string> = {
                startNode: '#52c41a',
                endNode: '#ff4d4f',
                processNode: '#1890ff',
                decisionNode: '#faad14',
                customNode: '#722ed1',
              };
              return colors[node.type || 'customNode'] || '#722ed1';
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </div>

      {/* 操作提示 */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 296,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: 4,
        fontSize: 11,
        zIndex: 10,
      }}>
        双击节点编辑 | 右键空白处添加节点 | 拖拽连接点创建连线 | Delete 删除
      </div>

      {/* 编辑节点对话框 */}
      <Modal
        title="编辑节点"
        open={!!editingNode}
        onOk={handleSaveNodeLabel}
        onCancel={() => { setEditingNode(null); setEditingLabel(''); }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          value={editingLabel}
          onChange={(e) => setEditingLabel(e.target.value)}
          onPressEnter={handleSaveNodeLabel}
          autoFocus
        />
      </Modal>
    </div>
  );
};

// 包装组件以提供 ReactFlowProvider
const FlowchartEditor: React.FC<FlowchartEditorProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowchartEditorInner {...props} />
    </ReactFlowProvider>
  );
};

export default FlowchartEditor;
