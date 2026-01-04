/**
 * RemoveBackgroundTool - 图片去背景工具
 * 使用 RMBG-2.0 模型实现 AI 去背景
 * TODO: 功能开发中
 */

import React from 'react';
import { Card, Typography, Alert } from 'antd';
import { ScissorOutlined } from '@ant-design/icons';

const { Text } = Typography;

const RemoveBackgroundTool: React.FC = () => {
  return (
    <Card title={<><ScissorOutlined /> AI 去背景</>}>
      <Alert
        message="功能开发中"
        description="AI 去背景功能正在开发中，敬请期待..."
        type="info"
        showIcon
      />
    </Card>
  );
};

export default RemoveBackgroundTool;
