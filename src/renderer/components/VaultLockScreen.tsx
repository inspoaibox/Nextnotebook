import React, { useState } from 'react';
import { Input, Button, message } from 'antd';
import { LockOutlined, KeyOutlined } from '@ant-design/icons';

interface VaultLockScreenProps {
  onUnlock: () => void;
  onSetPassword?: () => void;
  hasPassword: boolean;
}

const VaultLockScreen: React.FC<VaultLockScreenProps> = ({ onUnlock, onSetPassword, hasPassword }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = () => {
    if (!password) {
      message.warning('请输入密码');
      return;
    }

    setLoading(true);
    
    // 验证密码
    const savedPassword = localStorage.getItem('mucheng-vault-password');
    if (password === savedPassword) {
      message.success('密码库已解锁');
      onUnlock();
    } else {
      message.error('密码错误');
    }
    
    setLoading(false);
    setPassword('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  };

  if (!hasPassword) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#fafafa',
        padding: 40,
      }}>
        <KeyOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 24 }} />
        <h2 style={{ margin: '0 0 16px', color: '#333' }}>密码库</h2>
        <p style={{ color: '#666', marginBottom: 24, textAlign: 'center' }}>
          您尚未设置密码库密码<br />
          设置密码后可以保护您的敏感数据
        </p>
        <Button type="primary" onClick={onSetPassword}>
          设置密码库密码
        </Button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      background: '#fafafa',
      padding: 40,
    }}>
      <LockOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 24 }} />
      <h2 style={{ margin: '0 0 8px', color: '#333' }}>密码库已锁定</h2>
      <p style={{ color: '#666', marginBottom: 24 }}>请输入密码以访问密码库</p>
      
      <div style={{ width: 280 }}>
        <Input.Password
          size="large"
          placeholder="输入密码库密码"
          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyPress={handleKeyPress}
          autoFocus
          style={{ marginBottom: 16 }}
        />
        <Button 
          type="primary" 
          size="large" 
          block 
          onClick={handleUnlock}
          loading={loading}
        >
          解锁
        </Button>
      </div>
      
      <p style={{ color: '#999', fontSize: 12, marginTop: 24 }}>
        密码库密码可在设置 → 安全设置中修改
      </p>
    </div>
  );
};

export default VaultLockScreen;
