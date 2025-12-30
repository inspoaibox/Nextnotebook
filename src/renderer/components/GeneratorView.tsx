/**
 * GeneratorView 组件
 * 密码/资料生成器的主视图，整合配置和结果展示
 */

import React, { useState, useCallback } from 'react';
import { Layout, Button, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { GeneratedProfile, VaultEntryPayload } from '@shared/types';
import { VaultFolder } from '../hooks/useVault';
import { useGenerator } from '../hooks/useGenerator';
import GeneratorConfig from './GeneratorConfig';
import GeneratorResults from './GeneratorResults';
import ImportModal from './ImportModal';

const { Sider, Content } = Layout;

interface GeneratorViewProps {
  folders: VaultFolder[];
  onBack: () => void;
  onImport: (payload: Partial<VaultEntryPayload>) => Promise<void>;
  onCreateFolder: (name: string) => Promise<VaultFolder | null>;
}

const GeneratorView: React.FC<GeneratorViewProps> = ({
  folders,
  onBack,
  onImport,
  onCreateFolder,
}) => {
  const {
    options,
    setCountry,
    setGender,
    setQuantity,
    setPasswordOptions,
    setIncludeFields,
    resetOptions,
    profiles,
    loading,
    error,
    generate,
    clearProfiles,
    formatAsNotes,
    formatForCopy,
  } = useGenerator();

  // 导入弹窗状态
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importProfile, setImportProfile] = useState<GeneratedProfile | null>(null);
  const [importProfiles, setImportProfiles] = useState<GeneratedProfile[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  // 处理单个导入
  const handleImport = useCallback((profile: GeneratedProfile) => {
    setImportProfile(profile);
    setImportProfiles([]);
    setImportModalVisible(true);
  }, []);

  // 处理批量导入
  const handleBatchImport = useCallback(() => {
    setImportProfile(null);
    setImportProfiles(profiles);
    setImportModalVisible(true);
  }, [profiles]);

  // 确认导入
  const handleConfirmImport = useCallback(async (
    folderId: string | null,
    newFolderName?: string,
    customName?: string
  ) => {
    setImportLoading(true);
    
    try {
      let targetFolderId = folderId;
      
      // 如果需要创建新文件夹
      if (newFolderName) {
        const newFolder = await onCreateFolder(newFolderName);
        if (newFolder) {
          targetFolderId = newFolder.id;
        } else {
          throw new Error('创建文件夹失败');
        }
      }

      const profilesToImport = importProfiles.length > 0 ? importProfiles : (importProfile ? [importProfile] : []);
      const isBatchMode = importProfiles.length > 0;
      
      for (const profile of profilesToImport) {
        const payload: Partial<VaultEntryPayload> = {
          // 单条导入使用自定义名称，批量导入使用用户名
          name: isBatchMode ? profile.username : (customName || profile.username),
          entry_type: 'login',
          folder_id: targetFolderId,
          username: profile.username,
          password: profile.password,
          notes: formatAsNotes(profile),
          favorite: false,
          uris: [],
          totp_secrets: [],
          custom_fields: [],
        };
        
        await onImport(payload);
      }

      message.success(`成功导入 ${profilesToImport.length} 条记录`);
      setImportModalVisible(false);
      setImportProfile(null);
      setImportProfiles([]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  }, [importProfile, importProfiles, onImport, onCreateFolder, formatAsNotes]);

  // 取消导入
  const handleCancelImport = useCallback(() => {
    setImportModalVisible(false);
    setImportProfile(null);
    setImportProfiles([]);
  }, []);

  // 复制字段（用于统计或日志）
  const handleCopyField = useCallback((_value: string, _label: string) => {
    // 可以在这里添加统计逻辑
  }, []);

  // 复制全部（用于统计或日志）
  const handleCopyAll = useCallback((_profile: GeneratedProfile) => {
    // 可以在这里添加统计逻辑
  }, []);

  return (
    <Layout style={{ height: '100%' }}>
      {/* 左侧配置区域 */}
      <Sider 
        width={280} 
        theme="light" 
        style={{ 
          borderRight: '1px solid var(--border-color, #f0f0f0)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 返回按钮 */}
        <div style={{ 
          padding: '12px 16px', 
          borderBottom: '1px solid var(--border-color, #f0f0f0)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
          >
            返回密码库
          </Button>
        </div>
        
        {/* 配置面板 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <GeneratorConfig
            options={options}
            onCountryChange={setCountry}
            onGenderChange={setGender}
            onQuantityChange={setQuantity}
            onPasswordOptionsChange={setPasswordOptions}
            onIncludeFieldsChange={setIncludeFields}
            onGenerate={generate}
            onReset={() => {
              resetOptions();
              clearProfiles();
            }}
            loading={loading}
            error={error}
          />
        </div>
      </Sider>

      {/* 右侧结果区域 */}
      <Content style={{ display: 'flex', flexDirection: 'column' }}>
        <GeneratorResults
          profiles={profiles}
          onCopyField={handleCopyField}
          onCopyAll={handleCopyAll}
          onImport={handleImport}
          onBatchImport={handleBatchImport}
          formatForCopy={formatForCopy}
        />
      </Content>

      {/* 导入弹窗 */}
      <ImportModal
        visible={importModalVisible}
        profile={importProfile}
        profiles={importProfiles.length > 0 ? importProfiles : undefined}
        folders={folders}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
        loading={importLoading}
      />
    </Layout>
  );
};

export default GeneratorView;
