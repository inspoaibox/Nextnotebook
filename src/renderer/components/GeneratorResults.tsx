/**
 * GeneratorResults 组件
 * 显示生成的用户资料，支持紧凑和展开两种视图模式
 */

import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Button,
  Space,
  Empty,
  Tooltip,
  message,
  Tag,
} from 'antd';
import {
  CopyOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ImportOutlined,
  TableOutlined,
  AppstoreOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { GeneratedProfile } from '@shared/types';

interface GeneratorResultsProps {
  profiles: GeneratedProfile[];
  onCopyField: (value: string, label: string) => void;
  onCopyAll: (profile: GeneratedProfile) => void;
  onImport: (profile: GeneratedProfile) => void;
  onBatchImport: () => void;
  formatForCopy: (profile: GeneratedProfile) => string;
}

type ViewMode = 'compact' | 'expanded';

const GeneratorResults: React.FC<GeneratorResultsProps> = ({
  profiles,
  onCopyField,
  onCopyAll,
  onImport,
  onBatchImport,
  formatForCopy,
}) => {
  // 根据数量自动选择默认视图模式
  const [viewMode, setViewMode] = useState<ViewMode>(
    profiles.length > 1 ? 'compact' : 'expanded'
  );
  // 默认所有密码都可见（存储隐藏的密码ID）
  const [hiddenPasswords, setHiddenPasswords] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  // 当 profiles 变化时，重置隐藏状态（新生成的密码默认显示）
  useEffect(() => {
    setHiddenPasswords(new Set());
  }, [profiles]);

  // 切换密码可见性
  const togglePasswordVisibility = (id: string) => {
    setHiddenPasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 检查密码是否可见（默认可见，在 hiddenPasswords 中的才隐藏）
  const isPasswordVisible = (id: string) => !hiddenPasswords.has(id);

  // 复制到剪贴板
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`${label}已复制`);
    onCopyField(text, label);
  };

  // 复制全部
  const handleCopyAll = (profile: GeneratedProfile) => {
    const text = formatForCopy(profile);
    navigator.clipboard.writeText(text);
    message.success('已复制全部信息');
    onCopyAll(profile);
  };

  if (profiles.length === 0) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        padding: 24,
      }}>
        <Empty description='点击"生成"按钮创建用户资料' />
      </div>
    );
  }

  // 紧凑视图 - 表格形式
  const renderCompactView = () => {
    const columns = [
      {
        title: '#',
        dataIndex: 'index',
        key: 'index',
        width: 50,
        render: (_: any, __: any, index: number) => index + 1,
      },
      {
        title: '用户名',
        dataIndex: 'username',
        key: 'username',
        ellipsis: true,
        render: (text: string) => (
          <Space size={4}>
            <span style={{ fontFamily: 'monospace' }}>{text}</span>
            <Tooltip title="复制">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(text, '用户名')}
              />
            </Tooltip>
          </Space>
        ),
      },
      {
        title: '密码',
        dataIndex: 'password',
        key: 'password',
        width: 200,
        render: (text: string, record: GeneratedProfile) => {
          const isVisible = isPasswordVisible(record.id);
          return (
            <Space size={4}>
              <span style={{ fontFamily: 'monospace' }}>
                {isVisible ? text : '••••••••'}
              </span>
              <Tooltip title={isVisible ? '隐藏' : '显示'}>
                <Button
                  type="text"
                  size="small"
                  icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => togglePasswordVisibility(record.id)}
                />
              </Tooltip>
              <Tooltip title="复制">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(text, '密码')}
                />
              </Tooltip>
            </Space>
          );
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 120,
        render: (_: any, record: GeneratedProfile) => (
          <Space size={4}>
            <Tooltip title="复制全部">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => handleCopyAll(record)}
              />
            </Tooltip>
            <Tooltip title="导入到密码库">
              <Button
                type="text"
                size="small"
                icon={<ImportOutlined />}
                onClick={() => onImport(record)}
              />
            </Tooltip>
          </Space>
        ),
      },
    ];

    // 展开行内容 - 显示可选字段
    const expandedRowRender = (record: GeneratedProfile) => {
      const fields = [];
      if (record.fullName) fields.push({ label: '姓名', value: record.fullName });
      if (record.address) fields.push({ label: '地址', value: record.address });
      if (record.phone) fields.push({ label: '电话', value: record.phone });
      if (record.email) fields.push({ label: '邮箱', value: record.email });
      if (record.company) fields.push({ label: '工作单位', value: record.company });

      if (fields.length === 0) {
        return <span style={{ color: '#999' }}>无可选字段</span>;
      }

      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {fields.map(field => (
            <div key={field.label} style={{ minWidth: 200 }}>
              <span style={{ color: '#888', marginRight: 8 }}>{field.label}:</span>
              <span style={{ fontFamily: 'monospace' }}>{field.value}</span>
              <Tooltip title="复制">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(field.value, field.label)}
                />
              </Tooltip>
            </div>
          ))}
        </div>
      );
    };

    return (
      <Table
        dataSource={profiles}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 'calc(100vh - 280px)' }}
        expandable={{
          expandedRowRender,
          expandedRowKeys: expandedRows,
          onExpandedRowsChange: (keys) => setExpandedRows(keys as string[]),
        }}
      />
    );
  };


  // 展开视图 - 卡片形式
  const renderExpandedView = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {profiles.map((profile, index) => {
          const isVisible = isPasswordVisible(profile.id);
          return (
            <Card
              key={profile.id}
              size="small"
              title={
                <Space>
                  <Tag color="blue">#{index + 1}</Tag>
                  <span>{profile.username}</span>
                </Space>
              }
              extra={
                <Space>
                  <Tooltip title="复制全部">
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyAll(profile)}
                    />
                  </Tooltip>
                  <Tooltip title="导入到密码库">
                    <Button
                      type="primary"
                      size="small"
                      icon={<ImportOutlined />}
                      onClick={() => onImport(profile)}
                    >
                      导入
                    </Button>
                  </Tooltip>
                </Space>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 24px' }}>
                {/* 用户名 */}
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>用户名</div>
                  <Space>
                    <span style={{ fontFamily: 'monospace' }}>{profile.username}</span>
                    <Tooltip title="复制">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(profile.username, '用户名')}
                      />
                    </Tooltip>
                  </Space>
                </div>

                {/* 密码 */}
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>密码</div>
                  <Space>
                    <span style={{ fontFamily: 'monospace' }}>
                      {isVisible ? profile.password : '••••••••••••'}
                    </span>
                    <Tooltip title={isVisible ? '隐藏' : '显示'}>
                      <Button
                        type="text"
                        size="small"
                        icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                        onClick={() => togglePasswordVisibility(profile.id)}
                      />
                    </Tooltip>
                    <Tooltip title="复制">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(profile.password, '密码')}
                      />
                    </Tooltip>
                  </Space>
                </div>

                {/* 可选字段 */}
                {profile.fullName && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>姓名</div>
                    <Space>
                      <span>{profile.fullName}</span>
                      <Tooltip title="复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(profile.fullName!, '姓名')}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                )}

                {profile.email && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>邮箱</div>
                    <Space>
                      <span style={{ fontFamily: 'monospace' }}>{profile.email}</span>
                      <Tooltip title="复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(profile.email!, '邮箱')}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                )}

                {profile.phone && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>电话</div>
                    <Space>
                      <span style={{ fontFamily: 'monospace' }}>{profile.phone}</span>
                      <Tooltip title="复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(profile.phone!, '电话')}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                )}

                {profile.address && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>地址</div>
                    <Space>
                      <span>{profile.address}</span>
                      <Tooltip title="复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(profile.address!, '地址')}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                )}

                {profile.company && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>工作单位</div>
                    <Space>
                      <span>{profile.company}</span>
                      <Tooltip title="复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(profile.company!, '工作单位')}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ 
        padding: '8px 16px', 
        borderBottom: '1px solid var(--border-color, #f0f0f0)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Space>
          <span style={{ color: '#888' }}>
            共 {profiles.length} 条记录
          </span>
        </Space>
        <Space>
          <Tooltip title="紧凑视图">
            <Button
              type={viewMode === 'compact' ? 'primary' : 'default'}
              size="small"
              icon={<TableOutlined />}
              onClick={() => setViewMode('compact')}
            />
          </Tooltip>
          <Tooltip title="展开视图">
            <Button
              type={viewMode === 'expanded' ? 'primary' : 'default'}
              size="small"
              icon={<AppstoreOutlined />}
              onClick={() => setViewMode('expanded')}
            />
          </Tooltip>
          {profiles.length > 1 && (
            <Button
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              onClick={onBatchImport}
            >
              批量导入
            </Button>
          )}
        </Space>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {viewMode === 'compact' ? renderCompactView() : renderExpandedView()}
      </div>
    </div>
  );
};

export default GeneratorResults;
