/**
 * ImportModal 组件
 * 导入生成的资料到密码库的确认弹窗
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  Button,
  Space,
  message,
} from 'antd';
import { FolderAddOutlined } from '@ant-design/icons';
import { GeneratedProfile } from '@shared/types';
import { VaultFolder } from '../hooks/useVault';

interface ImportModalProps {
  visible: boolean;
  profile: GeneratedProfile | null;
  profiles?: GeneratedProfile[];  // 批量导入时使用
  folders: VaultFolder[];
  onConfirm: (folderId: string | null, newFolderName?: string, customName?: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

const ImportModal: React.FC<ImportModalProps> = ({
  visible,
  profile,
  profiles,
  folders,
  onConfirm,
  onCancel,
  loading,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [customName, setCustomName] = useState('');

  const isBatchMode = profiles && profiles.length > 0;
  const count = isBatchMode ? profiles.length : 1;

  // 当弹窗打开时，重置自定义名称
  useEffect(() => {
    if (visible) {
      setCustomName('');
    }
  }, [visible]);

  const handleConfirm = async () => {
    if (showNewFolder && !newFolderName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }

    if (!isBatchMode && !customName.trim()) {
      message.warning('请输入条目名称');
      return;
    }

    try {
      await onConfirm(
        showNewFolder ? null : selectedFolderId,
        showNewFolder ? newFolderName.trim() : undefined,
        !isBatchMode ? customName.trim() : undefined
      );
      // 重置状态
      setSelectedFolderId(null);
      setShowNewFolder(false);
      setNewFolderName('');
      setCustomName('');
    } catch (err) {
      // 错误处理由父组件完成
    }
  };

  const handleCancel = () => {
    setSelectedFolderId(null);
    setShowNewFolder(false);
    setNewFolderName('');
    setCustomName('');
    onCancel();
  };

  const folderOptions = [
    { value: '', label: '未分类' },
    ...folders.map(f => ({ value: f.id, label: f.name })),
  ];

  return (
    <Modal
      title={isBatchMode ? `批量导入 ${count} 条记录` : '导入到密码库'}
      open={visible}
      onOk={handleConfirm}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="导入"
      cancelText="取消"
      width={400}
    >
      <Form layout="vertical">
        {!isBatchMode && profile && (
          <>
            <Form.Item label="条目名称" required style={{ marginBottom: 12 }}>
              <Input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="输入条目名称，如：Google账号、公司邮箱"
              />
            </Form.Item>
            <div style={{ 
              padding: 12, 
              background: 'var(--bg-secondary, #f5f5f5)', 
              borderRadius: 6,
              marginBottom: 16,
            }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#888', marginRight: 8 }}>用户名:</span>
                <span style={{ fontFamily: 'monospace' }}>{profile.username}</span>
              </div>
              {profile.fullName && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#888', marginRight: 8 }}>姓名:</span>
                  <span>{profile.fullName}</span>
                </div>
              )}
              {profile.email && (
                <div>
                  <span style={{ color: '#888', marginRight: 8 }}>邮箱:</span>
                  <span style={{ fontFamily: 'monospace' }}>{profile.email}</span>
                </div>
              )}
            </div>
          </>
        )}

        {isBatchMode && (
          <div style={{ 
            padding: 12, 
            background: 'var(--bg-secondary, #f5f5f5)', 
            borderRadius: 6,
            marginBottom: 16,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1890ff' }}>
              {count}
            </div>
            <div style={{ color: '#888' }}>条记录将被导入（名称使用用户名）</div>
          </div>
        )}

        <Form.Item label="选择文件夹">
          {!showNewFolder ? (
            <Space.Compact style={{ width: '100%' }}>
              <Select
                value={selectedFolderId || ''}
                onChange={v => setSelectedFolderId(v || null)}
                options={folderOptions}
                style={{ flex: 1 }}
                placeholder="选择文件夹"
              />
              <Button
                icon={<FolderAddOutlined />}
                onClick={() => setShowNewFolder(true)}
              >
                新建
              </Button>
            </Space.Compact>
          ) : (
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="输入新文件夹名称"
                style={{ flex: 1 }}
              />
              <Button onClick={() => setShowNewFolder(false)}>
                取消
              </Button>
            </Space.Compact>
          )}
        </Form.Item>

        <div style={{ fontSize: 12, color: '#888' }}>
          <p>导入后：</p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>用户名和密码将对应到条目的用户名和密码字段</li>
            <li>其他信息（姓名、地址、电话、邮箱、工作单位）将放入备注</li>
          </ul>
        </div>
      </Form>
    </Modal>
  );
};

export default ImportModal;
