import React, { useState } from 'react';
import { Modal, Button, Steps, Typography, Space, Card, Row, Col } from 'antd';
import {
  FileTextOutlined,
  FolderOutlined,
  TagOutlined,
  CloudSyncOutlined,
  LockOutlined,
  BulbOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

interface WelcomeGuideProps {
  open: boolean;
  onClose: () => void;
}

const features = [
  {
    icon: <FileTextOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
    title: 'Markdown 编辑',
    description: '支持实时预览和分屏编辑，让写作更高效',
  },
  {
    icon: <FolderOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    title: '文件夹管理',
    description: '使用文件夹组织你的笔记，保持井井有条',
  },
  {
    icon: <TagOutlined style={{ fontSize: 32, color: '#faad14' }} />,
    title: '标签系统',
    description: '为笔记添加标签，快速分类和查找',
  },
  {
    icon: <CloudSyncOutlined style={{ fontSize: 32, color: '#13c2c2' }} />,
    title: '云端同步',
    description: '支持 WebDAV 和自建服务器同步，多设备无缝切换',
  },
  {
    icon: <LockOutlined style={{ fontSize: 32, color: '#eb2f96' }} />,
    title: '端到端加密',
    description: '你的数据只有你能解密，隐私安全有保障',
  },
  {
    icon: <BulbOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    title: '深色主题',
    description: '支持浅色/深色主题切换，保护你的眼睛',
  },
];

const shortcuts = [
  { key: 'Ctrl+N', description: '新建笔记' },
  { key: 'Ctrl+Shift+N', description: '从模板新建' },
  { key: 'Ctrl+S', description: '保存笔记' },
  { key: 'Ctrl+Shift+S', description: '立即同步' },
  { key: 'Ctrl+F', description: '搜索笔记' },
  { key: 'Ctrl+B', description: '切换侧边栏' },
  { key: 'Ctrl+P', description: '星标/取消星标' },
  { key: 'Ctrl+D', description: '删除笔记' },
  { key: 'Ctrl+Shift+D', description: '复制笔记' },
  { key: 'Ctrl+↑/↓', description: '上/下一篇笔记' },
  { key: 'Ctrl+,', description: '打开设置' },
  { key: 'Esc', description: '退出搜索' },
];

const WelcomeGuide: React.FC<WelcomeGuideProps> = ({ open, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
    } else {
      localStorage.setItem('mucheng-welcome-shown', 'true');
      onClose();
    }
  };

  const handleSkip = () => {
    localStorage.setItem('mucheng-welcome-shown', 'true');
    onClose();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Title level={2}>欢迎使用暮城笔记 ✨</Title>
            <Paragraph style={{ fontSize: 16, color: '#666' }}>
              一款安全、简洁的本地加密笔记应用
            </Paragraph>
            <div style={{ margin: '40px 0' }}>
              <FileTextOutlined style={{ fontSize: 120, color: '#1890ff' }} />
            </div>
            <Paragraph>
              让我们花一分钟了解暮城笔记的主要功能
            </Paragraph>
          </div>
        );
      case 1:
        return (
          <div style={{ padding: '20px 0' }}>
            <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
              核心功能
            </Title>
            <Row gutter={[16, 16]}>
              {features.map((feature, index) => (
                <Col span={8} key={index}>
                  <Card size="small" style={{ textAlign: 'center', height: '100%' }}>
                    {feature.icon}
                    <Title level={5} style={{ marginTop: 12, marginBottom: 8 }}>
                      {feature.title}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {feature.description}
                    </Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        );
      case 2:
        return (
          <div style={{ padding: '20px 0' }}>
            <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
              快捷键
            </Title>
            <div style={{ maxWidth: 300, margin: '0 auto' }}>
              {shortcuts.map((shortcut, index) => (
                <div 
                  key={index} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '12px 0',
                    borderBottom: index < shortcuts.length - 1 ? '1px solid #f0f0f0' : 'none',
                  }}
                >
                  <Text keyboard>{shortcut.key}</Text>
                  <Text>{shortcut.description}</Text>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Paragraph type="secondary">
                准备好了吗？点击"开始使用"创建你的第一篇笔记！
              </Paragraph>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleSkip}
      footer={null}
      width={600}
      closable={false}
      centered
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { title: '欢迎' },
          { title: '功能介绍' },
          { title: '快捷键' },
        ]}
      />
      
      {renderStep()}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Button onClick={handleSkip}>跳过</Button>
        <Space>
          {currentStep > 0 && (
            <Button onClick={() => setCurrentStep(currentStep - 1)}>上一步</Button>
          )}
          <Button type="primary" onClick={handleNext}>
            {currentStep === 2 ? '开始使用' : '下一步'}
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default WelcomeGuide;
