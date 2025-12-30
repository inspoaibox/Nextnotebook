import React, { useState, useCallback } from 'react';
import { Layout, Menu, Button, List, Empty, Modal, Input, message, Dropdown, Space, Typography, Tabs, Tooltip } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  NodeIndexOutlined,
  ApartmentOutlined,
  HighlightOutlined,
  FolderOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useDiagrams, Diagram } from '../hooks/useDiagrams';
import { DiagramType } from '@shared/types';
import MindMapEditor from './MindMapEditor';
import FlowchartEditor from './FlowchartEditor';
import WhiteboardEditor from './WhiteboardEditor';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;

// 图表类型配置
const DIAGRAM_TYPES: { key: DiagramType; label: string; icon: React.ReactNode }[] = [
  { key: 'mindmap', label: '脑图', icon: <NodeIndexOutlined /> },
  { key: 'flowchart', label: '流程图', icon: <ApartmentOutlined /> },
  { key: 'whiteboard', label: '白板', icon: <HighlightOutlined /> },
];

const DiagramPanel: React.FC = () => {
  const { diagrams, loading, createDiagram, updateDiagram, deleteDiagram, getDiagramsByType } = useDiagrams();
  const [selectedType, setSelectedType] = useState<DiagramType>('mindmap');
  const [selectedDiagram, setSelectedDiagram] = useState<Diagram | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [searchText, setSearchText] = useState('');

  // 获取当前类型的图表列表
  const currentDiagrams = getDiagramsByType(selectedType).filter(d => 
    !searchText || d.payload.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // 创建新图表
  const handleCreate = async () => {
    if (!newName.trim()) {
      message.warning('请输入名称');
      return;
    }
    const diagram = await createDiagram(newName.trim(), selectedType);
    if (diagram) {
      setSelectedDiagram(diagram);
      message.success('创建成功');
    } else {
      message.error('创建失败，请重试');
    }
    setIsCreating(false);
    setNewName('');
  };

  // 重命名
  const handleRename = async () => {
    if (!renameId || !renameName.trim()) return;
    const success = await updateDiagram(renameId, { name: renameName.trim() });
    if (success) {
      message.success('重命名成功');
      if (selectedDiagram?.id === renameId) {
        setSelectedDiagram(prev => prev ? { ...prev, payload: { ...prev.payload, name: renameName.trim() } } : null);
      }
    }
    setIsRenaming(false);
    setRenameId(null);
    setRenameName('');
  };

  // 删除
  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后可在回收站恢复，确定要删除吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const success = await deleteDiagram(id);
        if (success) {
          message.success('已删除');
          if (selectedDiagram?.id === id) {
            setSelectedDiagram(null);
          }
        }
      },
    });
  };

  // 保存图表数据
  const handleSave = useCallback(async (data: string) => {
    if (!selectedDiagram) return;
    await updateDiagram(selectedDiagram.id, { data });
  }, [selectedDiagram, updateDiagram]);

  // 渲染编辑器
  const renderEditor = () => {
    if (!selectedDiagram) {
      return (
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
        }}>
          <Empty description="选择或创建一个图表开始编辑" />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreating(true)}>
            新建{DIAGRAM_TYPES.find(t => t.key === selectedType)?.label}
          </Button>
        </div>
      );
    }

    const commonProps = {
      data: selectedDiagram.payload.data,
      onSave: handleSave,
    };

    switch (selectedDiagram.payload.diagram_type) {
      case 'mindmap':
        return <MindMapEditor {...commonProps} />;
      case 'flowchart':
        return <FlowchartEditor {...commonProps} />;
      case 'whiteboard':
        return <WhiteboardEditor {...commonProps} />;
      default:
        return <Empty description="未知图表类型" />;
    }
  };

  // 列表项菜单
  const getItemMenu = (diagram: Diagram) => ({
    items: [
      {
        key: 'rename',
        icon: <EditOutlined />,
        label: '重命名',
        onClick: () => {
          setRenameId(diagram.id);
          setRenameName(diagram.payload.name);
          setIsRenaming(true);
        },
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => handleDelete(diagram.id),
      },
    ],
  });

  return (
    <Layout style={{ height: '100%' }}>
      {/* 左侧列表 */}
      <Sider width={280} style={{ background: '#fafafa', borderRight: '1px solid #f0f0f0' }} className="diagram-sider">
        {/* 类型切换 */}
        <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>
          <Tabs
            activeKey={selectedType}
            onChange={(key) => {
              setSelectedType(key as DiagramType);
              setSelectedDiagram(null);
            }}
            size="small"
            items={DIAGRAM_TYPES.map(t => ({
              key: t.key,
              label: (
                <span>
                  {t.icon}
                  <span style={{ marginLeft: 4 }}>{t.label}</span>
                </span>
              ),
            }))}
          />
        </div>

        {/* 搜索和新建 */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="搜索..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
            <Tooltip title={`新建${DIAGRAM_TYPES.find(t => t.key === selectedType)?.label}`}>
              <Button icon={<PlusOutlined />} onClick={() => setIsCreating(true)} />
            </Tooltip>
          </Space.Compact>
        </div>

        {/* 图表列表 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {currentDiagrams.length === 0 ? (
            <Empty 
              image={Empty.PRESENTED_IMAGE_SIMPLE} 
              description={searchText ? '没有找到匹配的图表' : '暂无图表'} 
              style={{ marginTop: 40 }}
            />
          ) : (
            <List
              dataSource={currentDiagrams}
              renderItem={diagram => (
                <List.Item
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: selectedDiagram?.id === diagram.id ? '#e6f4ff' : 'transparent',
                    borderLeft: selectedDiagram?.id === diagram.id ? '3px solid #1890ff' : '3px solid transparent',
                  }}
                  onClick={() => setSelectedDiagram(diagram)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text ellipsis style={{ display: 'block' }}>
                      {DIAGRAM_TYPES.find(t => t.key === diagram.payload.diagram_type)?.icon}
                      <span style={{ marginLeft: 8 }}>{diagram.payload.name}</span>
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(diagram.updated_time).toLocaleString()}
                    </Text>
                  </div>
                  <Dropdown menu={getItemMenu(diagram)} trigger={['click']}>
                    <Button 
                      type="text" 
                      size="small" 
                      icon={<MoreOutlined />}
                      onClick={e => e.stopPropagation()}
                    />
                  </Dropdown>
                </List.Item>
              )}
            />
          )}
        </div>
      </Sider>

      {/* 右侧编辑器 */}
      <Content style={{ background: '#fff', position: 'relative' }}>
        {renderEditor()}
      </Content>

      {/* 新建对话框 */}
      <Modal
        title={`新建${DIAGRAM_TYPES.find(t => t.key === selectedType)?.label}`}
        open={isCreating}
        onOk={handleCreate}
        onCancel={() => { setIsCreating(false); setNewName(''); }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="请输入名称"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onPressEnter={handleCreate}
          autoFocus
        />
      </Modal>

      {/* 重命名对话框 */}
      <Modal
        title="重命名"
        open={isRenaming}
        onOk={handleRename}
        onCancel={() => { setIsRenaming(false); setRenameId(null); setRenameName(''); }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="请输入新名称"
          value={renameName}
          onChange={e => setRenameName(e.target.value)}
          onPressEnter={handleRename}
          autoFocus
        />
      </Modal>
    </Layout>
  );
};

export default DiagramPanel;
