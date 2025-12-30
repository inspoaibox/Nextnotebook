import React, { useState } from 'react';
import { Input, Button, Typography, Space, message } from 'antd';
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface LockScreenProps {
  onUnlock: (password: string) => boolean;
  failedAttempts: number;
  lockedUntil: number | null;
}

const LockScreen: React.FC<LockScreenProps> = ({ onUnlock, failedAttempts, lockedUntil }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isTemporarilyLocked = lockedUntil && Date.now() < lockedUntil;
  const remainingTime = isTemporarilyLocked ? Math.ceil((lockedUntil - Date.now()) / 1000) : 0;

  const handleUnlock = async () => {
    if (!password.trim()) {
      message.warning('请输入密码');
      return;
    }

    setLoading(true);
    
    // 模拟延迟以防止暴力破解
    await new Promise(resolve => setTimeout(resolve, 500));

    const success = onUnlock(password);
    setLoading(false);

    if (!success) {
      message.error('密码错误');
      setPassword('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isTemporarilyLocked) {
      handleUnlock();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 40,
          width: 360,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <LockOutlined style={{ fontSize: 36, color: '#666' }} />
        </div>

        <Title level={3} style={{ marginBottom: 8 }}>
          暮城笔记
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          应用已锁定，请输入密码解锁
        </Text>

        {isTemporarilyLocked ? (
          <div style={{ marginBottom: 24 }}>
            <Text type="danger">
              多次密码错误，请等待 {remainingTime} 秒后重试
            </Text>
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Input.Password
              size="large"
              placeholder="输入密码"
              prefix={<LockOutlined />}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
            />

            <Button
              type="primary"
              size="large"
              block
              icon={<UnlockOutlined />}
              loading={loading}
              onClick={handleUnlock}
            >
              解锁
            </Button>
          </Space>
        )}

        {failedAttempts > 0 && failedAttempts < 5 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 12 }}>
            已失败 {failedAttempts} 次，5 次后将临时锁定
          </Text>
        )}
      </div>
    </div>
  );
};

export default LockScreen;
