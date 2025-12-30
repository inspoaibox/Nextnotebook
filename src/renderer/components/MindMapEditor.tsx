import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Button, Space, Tooltip, message, Dropdown, Select, Modal, Input } from 'antd';
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
  EditOutlined,
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  FileImageOutlined,
  FileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

interface MindMapEditorProps {
  data: string;
  onSave: (data: string) => void;
}

// 默认脑图数据
const DEFAULT_MIND_DATA = {
  root: {
    data: {
      text: '中心主题',
    },
    children: [],
  },
};

// 布局选项
const LAYOUTS = [
  { value: 'logicalStructure', label: '逻辑结构图' },
  { value: 'mindMap', label: '思维导图' },
  { value: 'organizationStructure', label: '组织结构图' },
  { value: 'catalogOrganization', label: '目录组织图' },
  { value: 'timeline', label: '时间轴' },
];

// 主题选项
const THEMES = [
  { value: 'default', label: '默认' },
  { value: 'classic', label: '经典' },
  { value: 'minions', label: '小黄人' },
  { value: 'pinkGrape', label: '粉红葡萄' },
  { value: 'mint', label: '薄荷' },
  { value: 'gold', label: '金色' },
  { value: 'vitalityOrange', label: '活力橙' },
  { value: 'greenLeaf', label: '绿叶' },
  { value: 'dark2', label: '暗色2' },
  { value: 'skyGreen', label: '天清绿' },
  { value: 'classic2', label: '经典2' },
  { value: 'classic3', label: '经典3' },
  { value: 'classic4', label: '经典4' },
  { value: 'classicGreen', label: '经典绿' },
  { value: 'classicBlue', label: '经典蓝' },
  { value: 'blueSky', label: '天空蓝' },
  { value: 'brainImpairedPink', label: '脑残粉' },
  { value: 'dark', label: '暗色' },
  { value: 'earthYellow', label: '泥土黄' },
  { value: 'freshGreen', label: '清新绿' },
  { value: 'freshRed', label: '清新红' },
  { value: 'romanticPurple', label: '浪漫紫' },
];

const MindMapEditor: React.FC<MindMapEditorProps> = ({ data, onSave }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentLayout, setCurrentLayout] = useState('logicalStructure');
  const [currentTheme, setCurrentTheme] = useState('default');
  const [editingNode, setEditingNode] = useState(false);
  const [editingText, setEditingText] = useState('');
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const initMindMap = useCallback(async () => {
    if (!containerRef.current) {
      setLoadError('容器未就绪');
      return;
    }

    try {
      setIsLoading(true);
      setLoadError(null);
      
      if (mindMapRef.current) {
        try {
          mindMapRef.current.destroy();
        } catch (e) {
          console.warn('Destroy old instance failed:', e);
        }
        mindMapRef.current = null;
      }

      containerRef.current.innerHTML = '';
      
      const MindMapModule = await import('simple-mind-map');
      const MindMap = MindMapModule.default;

      let mindData = DEFAULT_MIND_DATA;
      if (dataRef.current && dataRef.current !== '{}') {
        try {
          const parsed = JSON.parse(dataRef.current);
          if (parsed && parsed.root) {
            mindData = parsed;
          }
        } catch {
          console.warn('Invalid mind map data, using default');
        }
      }

      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      
      const mindMap = new MindMap({
        el: containerRef.current,
        data: mindData,
        layout: currentLayout,
        theme: currentTheme,
        scaleRatio: 0.1,
        mouseScaleCenterUseMousePosition: true,
        enableFreeDrag: false,
        readonly: false,
        initRootNodePosition: ['center', 'center'],
        width: rect.width || 800,
        height: rect.height || 600,
      } as any);

      mindMapRef.current = mindMap;
      setIsReady(true);
      setIsLoading(false);

      mindMap.on('data_change', () => {
        if ((window as any).__mindMapSaveTimer) {
          clearTimeout((window as any).__mindMapSaveTimer);
        }
        (window as any).__mindMapSaveTimer = setTimeout(() => {
          if (mindMapRef.current) {
            try {
              const exportData = mindMapRef.current.getData(true);
              onSave(JSON.stringify(exportData));
            } catch (e) {
              console.error('Auto save failed:', e);
            }
          }
        }, 1000);
      });

      setTimeout(() => {
        try {
          mindMap.view?.fit();
        } catch (e) {
          console.warn('Fit view failed:', e);
        }
      }, 300);

    } catch (error) {
      console.error('Failed to initialize mind map:', error);
      setIsLoading(false);
      setLoadError('脑图加载失败: ' + (error as Error).message);
    }
  }, [currentLayout, currentTheme, onSave]);

  useEffect(() => {
    const timer = setTimeout(() => {
      initMindMap();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mindMapRef.current) {
        try {
          mindMapRef.current.destroy();
        } catch (e) {
          console.error('Destroy failed:', e);
        }
      }
      if ((window as any).__mindMapSaveTimer) {
        clearTimeout((window as any).__mindMapSaveTimer);
      }
    };
  }, []);

  const handleReload = useCallback(() => {
    initMindMap();
  }, [initMindMap]);

  const handleAddChild = useCallback(() => {
    if (!mindMapRef.current || !isReady) {
      message.warning('脑图未就绪');
      return;
    }
    try {
      const activeNodes = mindMapRef.current.renderer?.activeNodeList || [];
      if (activeNodes.length === 0) {
        const root = mindMapRef.current.renderer?.root;
        if (root) {
          mindMapRef.current.renderer.addNodeToActiveList(root);
        }
      }
      // 使用带默认文本的方式添加节点
      mindMapRef.current.execCommand('INSERT_CHILD_NODE', false, [], {
        text: '新节点'
      });
      message.success('已添加子节点，双击可编辑');
    } catch (e) {
      console.error('Add child failed:', e);
      message.error('添加失败，请先点击选中一个节点');
    }
  }, [isReady]);

  const handleAddSibling = useCallback(() => {
    if (!mindMapRef.current || !isReady) {
      message.warning('脑图未就绪');
      return;
    }
    try {
      const activeNodes = mindMapRef.current.renderer?.activeNodeList || [];
      if (activeNodes.length === 0) {
        message.warning('请先点击选中一个节点');
        return;
      }
      // 使用带默认文本的方式添加节点
      mindMapRef.current.execCommand('INSERT_NODE', false, [], {
        text: '新节点'
      });
      message.success('已添加兄弟节点，双击可编辑');
    } catch (e) {
      console.error('Add sibling failed:', e);
      message.error('添加失败，请先选中非根节点');
    }
  }, [isReady]);

  const handleAddParent = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      const activeNodes = mindMapRef.current.renderer?.activeNodeList || [];
      if (activeNodes.length === 0) {
        message.warning('请先点击选中一个节点');
        return;
      }
      // 使用带默认文本的方式添加节点
      mindMapRef.current.execCommand('INSERT_PARENT_NODE', false, [], {
        text: '父节点'
      });
      message.success('已添加父节点，双击可编辑');
    } catch (e) {
      message.error('添加失败');
    }
  }, [isReady]);

  const handleDelete = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      const activeNodes = mindMapRef.current.renderer?.activeNodeList || [];
      if (activeNodes.length === 0) {
        message.warning('请先点击选中要删除的节点');
        return;
      }
      mindMapRef.current.execCommand('REMOVE_NODE');
      message.success('已删除节点');
    } catch (e) {
      message.error('删除失败');
    }
  }, [isReady]);

  const handleEditNode = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      const activeNodes = mindMapRef.current.renderer?.activeNodeList || [];
      if (activeNodes.length === 0) {
        message.warning('请先点击选中要编辑的节点');
        return;
      }
      const node = activeNodes[0];
      const text = node.nodeData?.data?.text || '';
      setEditingText(text);
      setEditingNode(true);
    } catch (e) {
      message.error('编辑失败');
    }
  }, [isReady]);

  const handleSaveNodeEdit = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.execCommand('SET_NODE_TEXT', mindMapRef.current.renderer.activeNodeList[0], editingText);
      setEditingNode(false);
      setEditingText('');
    } catch (e) {
      message.error('保存失败');
    }
  }, [isReady, editingText]);

  const handleUndo = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.execCommand('BACK');
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }, [isReady]);

  const handleRedo = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.execCommand('FORWARD');
    } catch (e) {
      console.error('Redo failed:', e);
    }
  }, [isReady]);

  const handleZoomIn = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.view.enlarge();
    } catch (e) {
      console.error('Zoom in failed:', e);
    }
  }, [isReady]);

  const handleZoomOut = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.view.narrow();
    } catch (e) {
      console.error('Zoom out failed:', e);
    }
  }, [isReady]);

  const handleFit = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.view.fit();
    } catch (e) {
      console.error('Fit failed:', e);
    }
  }, [isReady]);

  const handleReset = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.view.reset();
    } catch (e) {
      console.error('Reset failed:', e);
    }
  }, [isReady]);

  const handleLayoutChange = useCallback((layout: string) => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.setLayout(layout);
      setCurrentLayout(layout);
      message.success('布局已切换');
    } catch (e) {
      console.error('Layout change failed:', e);
    }
  }, [isReady]);

  const handleThemeChange = useCallback((theme: string) => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.setTheme(theme);
      setCurrentTheme(theme);
      message.success('主题已切换');
    } catch (e) {
      console.error('Theme change failed:', e);
    }
  }, [isReady]);

  const handleSave = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      const exportData = mindMapRef.current.getData(true);
      onSave(JSON.stringify(exportData));
      message.success('已保存');
    } catch (e) {
      console.error('Save failed:', e);
      message.error('保存失败');
    }
  }, [onSave, isReady]);

  const handleExport = useCallback(async (type: 'png' | 'svg' | 'json') => {
    if (!mindMapRef.current || !isReady) return;
    
    try {
      if (type === 'json') {
        const exportData = mindMapRef.current.getData(true);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mindmap_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('导出成功');
        return;
      }

      const svgEl = containerRef.current?.querySelector('svg');
      if (!svgEl) {
        message.error('无法获取图形');
        return;
      }

      if (type === 'svg') {
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mindmap_${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('导出成功');
      } else {
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
          canvas.width = img.width || 1920;
          canvas.height = img.height || 1080;
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          }
          const dataUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `mindmap_${Date.now()}.png`;
          a.click();
          message.success('导出成功');
        };
        
        img.onerror = () => {
          message.error('导出失败');
        };
        
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      }
    } catch (error) {
      console.error('Export failed:', error);
      message.error('导出失败');
    }
  }, [isReady]);

  const handleExpandAll = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.execCommand('EXPAND_ALL');
    } catch (e) {
      console.error('Expand all failed:', e);
    }
  }, [isReady]);

  const handleCollapseAll = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.execCommand('UNEXPAND_ALL');
    } catch (e) {
      console.error('Collapse all failed:', e);
    }
  }, [isReady]);

  const handleCopy = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      const activeNodes = mindMapRef.current.renderer?.activeNodeList || [];
      if (activeNodes.length === 0) {
        message.warning('请先选中要复制的节点');
        return;
      }
      mindMapRef.current.renderer.copy();
      message.success('已复制');
    } catch (e) {
      message.error('复制失败');
    }
  }, [isReady]);

  const handleCut = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      const activeNodes = mindMapRef.current.renderer?.activeNodeList || [];
      if (activeNodes.length === 0) {
        message.warning('请先选中要剪切的节点');
        return;
      }
      mindMapRef.current.renderer.cut();
      message.success('已剪切');
    } catch (e) {
      message.error('剪切失败');
    }
  }, [isReady]);

  const handlePaste = useCallback(() => {
    if (!mindMapRef.current || !isReady) return;
    try {
      mindMapRef.current.renderer.paste();
      message.success('已粘贴');
    } catch (e) {
      message.error('粘贴失败');
    }
  }, [isReady]);

  const addNodeMenu = {
    items: [
      { key: 'child', label: '添加子节点 (Tab)', onClick: handleAddChild },
      { key: 'sibling', label: '添加兄弟节点 (Enter)', onClick: handleAddSibling },
      { key: 'parent', label: '添加父节点', onClick: handleAddParent },
    ],
  };

  const exportMenu = {
    items: [
      { key: 'png', label: <><FileImageOutlined /> 导出 PNG</>, onClick: () => handleExport('png') },
      { key: 'svg', label: <><FileImageOutlined /> 导出 SVG</>, onClick: () => handleExport('svg') },
      { key: 'json', label: <><FileOutlined /> 导出 JSON</>, onClick: () => handleExport('json') },
    ],
  };

  const viewMenu = {
    items: [
      { key: 'fit', label: '适应画布', onClick: handleFit },
      { key: 'reset', label: '重置视图', onClick: handleReset },
      { key: 'expand', label: '展开所有', onClick: handleExpandAll },
      { key: 'collapse', label: '收起所有', onClick: handleCollapseAll },
    ],
  };

  const editMenu = {
    items: [
      { key: 'edit', label: <><EditOutlined /> 编辑节点</>, onClick: handleEditNode },
      { key: 'copy', label: <><CopyOutlined /> 复制 (Ctrl+C)</>, onClick: handleCopy },
      { key: 'cut', label: <><ScissorOutlined /> 剪切 (Ctrl+X)</>, onClick: handleCut },
      { key: 'paste', label: <><SnippetsOutlined /> 粘贴 (Ctrl+V)</>, onClick: handlePaste },
    ],
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ 
        padding: '8px 12px', 
        borderBottom: '1px solid #f0f0f0',
        background: '#fafafa',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space size="small">
            <Dropdown menu={addNodeMenu}>
              <Button icon={<PlusOutlined />} size="small" type="primary">添加节点</Button>
            </Dropdown>
            <Tooltip title="删除节点 (Delete)">
              <Button icon={<DeleteOutlined />} size="small" onClick={handleDelete} danger />
            </Tooltip>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Dropdown menu={editMenu}>
              <Button size="small">编辑</Button>
            </Dropdown>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Tooltip title="撤销 (Ctrl+Z)">
              <Button icon={<UndoOutlined />} size="small" onClick={handleUndo} />
            </Tooltip>
            <Tooltip title="重做 (Ctrl+Y)">
              <Button icon={<RedoOutlined />} size="small" onClick={handleRedo} />
            </Tooltip>
          </Space>
          <Space size="small">
            <Tooltip title="放大">
              <Button icon={<ZoomInOutlined />} size="small" onClick={handleZoomIn} />
            </Tooltip>
            <Tooltip title="缩小">
              <Button icon={<ZoomOutOutlined />} size="small" onClick={handleZoomOut} />
            </Tooltip>
            <Dropdown menu={viewMenu}>
              <Button icon={<ExpandOutlined />} size="small">视图</Button>
            </Dropdown>
            <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
            <Dropdown menu={exportMenu}>
              <Button icon={<DownloadOutlined />} size="small">导出</Button>
            </Dropdown>
            <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave}>保存</Button>
          </Space>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Space size="small">
            <span style={{ fontSize: 12, color: '#666' }}>布局:</span>
            <Select
              size="small"
              value={currentLayout}
              onChange={handleLayoutChange}
              style={{ width: 120 }}
              options={LAYOUTS}
            />
          </Space>
          <Space size="small">
            <span style={{ fontSize: 12, color: '#666' }}>主题:</span>
            <Select
              size="small"
              value={currentTheme}
              onChange={handleThemeChange}
              style={{ width: 100 }}
              options={THEMES}
            />
          </Space>
          <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
          <Space size="small">
            <Tooltip title="添加子节点">
              <Button size="small" onClick={handleAddChild}>+ 子节点</Button>
            </Tooltip>
            <Tooltip title="添加兄弟节点">
              <Button size="small" onClick={handleAddSibling}>+ 兄弟</Button>
            </Tooltip>
          </Space>
          {loadError && (
            <Tooltip title="重新加载">
              <Button icon={<ReloadOutlined />} size="small" onClick={handleReload} type="link" danger>
                重新加载
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <div 
        ref={containerRef} 
        style={{ 
          flex: 1, 
          overflow: 'hidden',
          background: '#fff',
          position: 'relative',
          minHeight: 400,
        }} 
      />
      
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,0.95)',
          padding: '20px 40px',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 8 }}>加载中...</div>
            <div style={{ fontSize: 12, color: '#999' }}>正在初始化脑图编辑器</div>
          </div>
        </div>
      )}

      {loadError && !isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,0.95)',
          padding: '20px 40px',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 1000,
          textAlign: 'center',
        }}>
          <div style={{ color: '#ff4d4f', marginBottom: 12 }}>{loadError}</div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={handleReload}>
            重新加载
          </Button>
        </div>
      )}
      
      {isReady && !loadError && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: '6px 10px',
          borderRadius: 4,
          fontSize: 11,
          zIndex: 10,
        }}>
          点击选中节点 | 双击编辑 | Tab 子节点 | Enter 兄弟节点 | Delete 删除
        </div>
      )}

      <Modal
        title="编辑节点"
        open={editingNode}
        onOk={handleSaveNodeEdit}
        onCancel={() => { setEditingNode(false); setEditingText(''); }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onPressEnter={handleSaveNodeEdit}
          autoFocus
          placeholder="请输入节点内容"
        />
      </Modal>
    </div>
  );
};

export default MindMapEditor;
