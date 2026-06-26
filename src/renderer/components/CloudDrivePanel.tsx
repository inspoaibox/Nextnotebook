/**
 * 网盘主面板
 * 监听本地目录、同步到云端，支持分块上传与断点续传
 *
 * 层7：补齐手动控制（重试 / 取消 / 暂停 / 恢复 / 清空已完成）与高级配置编辑。
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Layout, Button, Tooltip, Tag, Empty, Progress, Row, Col, Space,
  Drawer, Form, InputNumber, Switch, Input, Divider, Popconfirm, message, Dropdown, Checkbox,
} from 'antd';
import {
  FolderOpenOutlined, PlayCircleOutlined, PauseCircleOutlined,
  ReloadOutlined, CloudOutlined, InboxOutlined, SettingOutlined,
  ClearOutlined, CaretRightOutlined, PauseOutlined, CloseOutlined,
  ExclamationCircleOutlined, EyeOutlined, FolderOutlined, FileOutlined, MoreOutlined, DownOutlined,
} from '@ant-design/icons';
import { useCloudDrive } from '../hooks/useCloudDrive';
import { useSettings } from '../contexts/SettingsContext';
import {
  CloudDriveConfig,
  DEFAULT_CLOUD_DRIVE_CONFIG,
  CloudLocalAvailability,
  CloudFilePayload,
  CloudFolderPayload,
} from '@shared/types';

const { Content } = Layout;
const { TextArea } = Input;

// 字节数格式化
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

const formatSpeed = (bytesPerSec: number | undefined): string => {
  if (!bytesPerSec || bytesPerSec <= 0) return '-';
  return `${formatBytes(bytesPerSec)}/s`;
};

// 毫秒数格式化（去抖/稳定阈值）
const formatMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} 秒` : `${ms} 毫秒`);

const normalizeCloudPath = (value: string | null | undefined): string =>
  String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const parentCloudPath = (value: string | null | undefined): string => {
  const normalized = normalizeCloudPath(value);
  if (!normalized) return '';
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/');
};

const baseCloudName = (value: string | null | undefined): string => {
  const normalized = normalizeCloudPath(value);
  if (!normalized) return '根目录';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '根目录';
};

const availabilityColor = (value: CloudLocalAvailability | undefined): 'default' | 'blue' | 'green' =>
  value === 'online_only' ? 'default' : value === 'offline' ? 'blue' : 'green';

const availabilityLabel = (value: CloudLocalAvailability | undefined): string =>
  value === 'online_only' ? '仅云端' : value === 'offline' ? '离线保留' : '本地可用';

const CloudDrivePanel: React.FC = () => {
  const { isDarkMode } = useSettings();
  const {
    config, isWatching, uploadProgress, cloudItems, downloadProgress, loading,
    selectWatchedFolder, startWatching, stopWatching, scanNow, updateConfig,
    retryFailed, retryItem, pauseItem, resumeItem, cancelUpload, clearCompleted,
    downloadFile, pauseDownload, resumeDownload, cancelDownload,
    retryDownload, retryAllDownloads, clearCompletedDownloads, uploadSpeedBps, downloadSpeedBps, localStates, setLocalAvailability, setFolderLocalAvailability, openLocalFile, openLocalDirectory,
  } = useCloudDrive();
  const [currentFolderPath, setCurrentFolderPath] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [transferExpanded, setTransferExpanded] = useState(false);

  // 高级设置抽屉
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // 高级设置表单内部状态（始终为有效值，关闭时丢弃，保存时才提交）
  const [draft, setDraft] = useState<CloudDriveConfig>(config);
  const [patternsText, setPatternsText] = useState<string>('');
  const [advancedTouched, setAdvancedTouched] = useState(false);

  // 打开高级设置时把当前 config 复制成 draft
  const openAdvanced = () => {
    setDraft({ ...config, ignore_patterns: [...config.ignore_patterns] });
    setPatternsText((config.ignore_patterns || []).join('\n'));
    setAdvancedTouched(false);
    setAdvancedOpen(true);
  };

  // 统计信息
  const stats = useMemo(() => {
    const pendingCount = uploadProgress.filter(p => p.state === 'pending').length;
    const uploadingCount = uploadProgress.filter(p => p.state === 'uploading').length;
    const completedCount = uploadProgress.filter(p => p.state === 'completed').length;
    const errorCount = uploadProgress.filter(p => p.state === 'error').length;
    const pausedCount = uploadProgress.filter(p => p.state === 'paused').length;
    return { pendingCount, uploadingCount, completedCount, errorCount, pausedCount };
  }, [uploadProgress]);

  // 下载侧统计
  const downloadStats = useMemo(() => {
    const pendingCount = downloadProgress.filter(p => p.state === 'pending').length;
    const downloadingCount = downloadProgress.filter(p => p.state === 'downloading').length;
    const completedCount = downloadProgress.filter(p => p.state === 'completed').length;
    const errorCount = downloadProgress.filter(p => p.state === 'error').length;
    const pausedCount = downloadProgress.filter(p => p.state === 'paused').length;
    return { pendingCount, downloadingCount, completedCount, errorCount, pausedCount };
  }, [downloadProgress]);

  const activeUploadProgress = useMemo(
    () => uploadProgress.filter(p => p.state !== 'completed'),
    [uploadProgress]
  );

  const actionableDownloadProgress = useMemo(
    () => downloadProgress.filter(p => p.state !== 'completed' && !(p.state === 'pending' && localStates[p.file_id] !== 'online_only')),
    [downloadProgress, localStates]
  );
  const hasActiveTransfers = activeUploadProgress.length > 0 || actionableDownloadProgress.length > 0;

  const uploadStateMap = useMemo(() => {
    const map = new Map<string, typeof uploadProgress[number]>();
    for (const item of uploadProgress) {
      map.set(item.file_id, item);
    }
    return map;
  }, [uploadProgress]);

  const downloadStateMap = useMemo(() => {
    const map = new Map<string, typeof downloadProgress[number]>();
    for (const item of downloadProgress) {
      map.set(item.file_id, item);
    }
    return map;
  }, [downloadProgress]);

  const folderEntries = useMemo(() => {
    const folders = cloudItems
      .filter((item): item is { id: string; type: 'cloud_folder'; payload: CloudFolderPayload } => item.type === 'cloud_folder')
      .map(item => {
        const relativePath = normalizeCloudPath(item.payload.relative_path);
        return {
          id: item.id,
          name: item.payload.name || baseCloudName(relativePath),
          relativePath,
          parentPath: parentCloudPath(relativePath),
        };
      });
    folders.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));
    return folders;
  }, [cloudItems]);

  const folderPathSet = useMemo(() => {
    const paths = new Set<string>(['']);
    for (const folder of folderEntries) {
      let cursor = folder.relativePath;
      while (cursor) {
        paths.add(cursor);
        cursor = parentCloudPath(cursor);
      }
    }
    return paths;
  }, [folderEntries]);

  const fileEntries = useMemo(() => {
    const files = cloudItems
      .filter((item): item is { id: string; type: 'cloud_file'; payload: CloudFilePayload } => item.type === 'cloud_file')
      .map(item => ({
        id: item.id,
        filename: item.payload.filename,
        relativePath: normalizeCloudPath(item.payload.relative_path),
        parentPath: parentCloudPath(item.payload.relative_path),
        size: item.payload.size,
        uploadState: item.payload.upload_state,
        downloadState: item.payload.download_state,
      }));
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));
    return files;
  }, [cloudItems]);

  useEffect(() => {
    if (!folderPathSet.has(currentFolderPath)) {
      setCurrentFolderPath('');
    }
  }, [currentFolderPath, folderPathSet]);

  const currentFolderSegments = useMemo(() => {
    const normalized = normalizeCloudPath(currentFolderPath);
    if (!normalized) return [];
    const parts = normalized.split('/');
    return parts.map((name, index) => ({
      name,
      path: parts.slice(0, index + 1).join('/'),
    }));
  }, [currentFolderPath]);

  const visibleFolders = useMemo(
    () => folderEntries.filter(folder => folder.parentPath === currentFolderPath),
    [currentFolderPath, folderEntries]
  );

  const visibleFiles = useMemo(
    () => fileEntries.filter(file => file.parentPath === currentFolderPath),
    [currentFolderPath, fileEntries]
  );

  const visibleFolderIds = useMemo(() => visibleFolders.map(folder => folder.id), [visibleFolders]);
  const visibleFileIds = useMemo(() => visibleFiles.map(file => file.id), [visibleFiles]);
  const visibleItemIds = useMemo(() => [...visibleFolderIds, ...visibleFileIds], [visibleFileIds, visibleFolderIds]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedFolders = useMemo(
    () => visibleFolders.filter(folder => selectedIdSet.has(folder.id)),
    [selectedIdSet, visibleFolders]
  );
  const selectedFiles = useMemo(
    () => visibleFiles.filter(file => selectedIdSet.has(file.id)),
    [selectedIdSet, visibleFiles]
  );

  // 工具栏：重试全部失败
  const handleRetryFailed = async () => {
    const n = await retryFailed();
    if (n > 0) {
      message.success(`已重新入队 ${n} 个失败任务`);
    } else {
      message.info('没有需要重试的失败任务');
    }
  };

  // 工具栏：清空已完成
  const handleClearCompleted = async () => {
    const cleared = await clearCompleted();
    if (cleared.length > 0) {
      message.success(`已从列表中清除 ${cleared.length} 个已完成任务`);
    } else {
      message.info('当前没有已完成的任务');
    }
  };

  // 每文件：取消/删除
  const handleCancel = async (itemId: string) => {
    const ok = await cancelUpload(itemId);
    if (ok) {
      message.success('已取消该任务');
    } else {
      message.warning('无法取消（任务可能已完成或正在写入）');
    }
  };

  // 下载侧：重试全部失败
  const handleRetryFailedDownloads = async () => {
    const n = await retryAllDownloads();
    if (n > 0) {
      message.success(`已重新入队 ${n} 个失败下载`);
    } else {
      message.info('没有需要重试的失败下载');
    }
  };

  // 下载侧：清空已完成
  const handleClearCompletedDownloads = async () => {
    const cleared = await clearCompletedDownloads();
    if (cleared.length > 0) {
      message.success(`已从列表中清除 ${cleared.length} 个已完成下载`);
    } else {
      message.info('当前没有已完成的下载');
    }
  };

  // 下载侧：每文件取消
  const handleCancelDownload = async (itemId: string) => {
    const ok = await cancelDownload(itemId);
    if (ok) {
      message.success('已取消该下载（已下载部分已删除）');
    } else {
      message.warning('无法取消（任务可能已完成）');
    }
  };

  const handleSetLocalAvailability = async (itemId: string, availability: CloudLocalAvailability) => {
    const ok = await setLocalAvailability(itemId, availability);
    if (!ok) {
      message.warning('状态更新失败');
      return;
    }
    message.success(
      availability === 'online_only'
        ? '已释放本地空间'
        : availability === 'offline'
          ? '已设为离线保留'
          : '已设为本地可用'
    );
  };

  const handleSetFolderLocalAvailability = async (availability: CloudLocalAvailability, folderPath = '') => {
    const changed = await setFolderLocalAvailability(folderPath, availability);
    if (changed <= 0) {
      message.info('当前没有可更新的文件');
      return;
    }
    const scope = folderPath ? `目录 ${baseCloudName(folderPath)}` : '当前网盘';
    message.success(
      availability === 'online_only'
        ? `${scope}已释放 ${changed} 个文件的本地空间`
        : `${scope}已为 ${changed} 个文件设置离线保留`
    );
  };

  const handleOpenLocalFile = async (itemId: string) => {
    const ok = await openLocalFile(itemId);
    if (!ok) {
      message.warning('本地文件尚未就绪');
    }
  };

  const handleOpenLocalDirectory = async (folderPath: string) => {
    const ok = await openLocalDirectory(folderPath);
    if (!ok) {
      message.warning('本地目录尚未就绪');
    }
  };

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return Array.from(next);
    });
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds(checked ? visibleItemIds : []);
  };

  const handleBatchAvailability = async (availability: CloudLocalAvailability) => {
    if (selectedFolders.length === 0 && selectedFiles.length === 0) {
      message.info('请先选择文件或文件夹');
      return;
    }
    for (const folder of selectedFolders) {
      await setFolderLocalAvailability(folder.relativePath, availability);
    }
    for (const file of selectedFiles) {
      await setLocalAvailability(file.id, availability);
    }
    message.success(
      availability === 'online_only'
        ? `已更新 ${selectedIds.length} 个选中项`
        : availability === 'offline'
          ? `已为 ${selectedIds.length} 个选中项启用离线保留`
          : `已为 ${selectedIds.length} 个选中项下载到本机`
    );
    clearSelection();
  };

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => visibleItemIds.includes(id)));
  }, [visibleItemIds]);

  useEffect(() => {
    if (!hasActiveTransfers) {
      setTransferExpanded(false);
    }
  }, [hasActiveTransfers]);

  // 高级设置：保存
  const handleSaveAdvanced = async () => {
    // 解析忽略规则文本 → 数组（去空、去重）
    const patterns = patternsText
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const uniquePatterns = Array.from(new Set(patterns));
    const patch: Partial<CloudDriveConfig> = {
      ...draft,
      ignore_patterns: uniquePatterns,
    };
    await updateConfig(patch);
    message.success('高级设置已保存');
    setAdvancedOpen(false);
  };

  // 通用数字字段变更
  const setNumberField = (field: keyof CloudDriveConfig, value: number | null) => {
    setAdvancedTouched(true);
    setDraft(prev => ({ ...prev, [field]: value ?? 0 }));
  };

  const cardBg = isDarkMode ? '#1f1f1f' : '#fff';
  const cardBorder = isDarkMode ? '#303030' : '#f0f0f0';
  const rowBorder = isDarkMode ? '#262626' : '#f5f5f5';
  const subColor = isDarkMode ? '#aaa' : '#666';
  const selectedAll = visibleItemIds.length > 0 && selectedIds.length === visibleItemIds.length;
  const selectedPartial = selectedIds.length > 0 && selectedIds.length < visibleItemIds.length;

  return (
    <Content style={{ background: isDarkMode ? '#141414' : '#fafafa', height: '100%', overflow: 'auto' }}>
      <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
        {/* 头部 */}
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space>
            <CloudOutlined style={{ fontSize: 22, color: '#1890ff' }} />
            <h2 style={{ margin: 0 }}>网盘</h2>
            <Tag color={isWatching ? 'success' : 'default'}>
              {isWatching ? '监听中' : '已停止'}
            </Tag>
          </Space>
          <Space wrap>
            <Tooltip title="选择监听目录">
              <Button icon={<FolderOpenOutlined />} onClick={selectWatchedFolder}>
                选择目录
              </Button>
            </Tooltip>
            {isWatching ? (
              <Button icon={<PauseCircleOutlined />} danger onClick={stopWatching}>
                停止监听
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={startWatching}
                disabled={!config.watched_root_path}
              >
                开始监听
              </Button>
            )}
            <Tooltip title="立即扫描一次">
              <Button icon={<ReloadOutlined />} onClick={scanNow} disabled={!config.watched_root_path}>
                立即扫描
              </Button>
            </Tooltip>
            <Tooltip title="高级设置">
              <Button icon={<SettingOutlined />} onClick={openAdvanced} />
            </Tooltip>
          </Space>
        </div>

        {/* 监听信息 */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: subColor, fontSize: 12 }}>监听目录</span>
              <span style={{ fontWeight: 500, fontSize: 13, minWidth: 0, wordBreak: 'break-all' }}>
                {config.watched_root_path || <span style={{ color: '#999' }}>未选择目录</span>}
              </span>
            </div>
            <Space size={[6, 6]} wrap>
              <Tag>单文件上限 {formatBytes(config.max_file_size)}</Tag>
              <Tag>分块 {formatBytes(config.chunk_size)}</Tag>
              <Tag>并发 {config.small_file_concurrency === 0 ? '不限' : config.small_file_concurrency}</Tag>
              <Tag>保留 {config.soft_delete_retention_days} 天</Tag>
            </Space>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Space>
              <FolderOpenOutlined style={{ color: '#1890ff' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>网盘文件</h3>
              <span style={{ color: subColor, fontSize: 12 }}>目录结构先同步，文件按需落盘</span>
            </Space>
            <Space wrap>
              {currentFolderPath && (
                <Button size="small" onClick={() => setCurrentFolderPath(parentCloudPath(currentFolderPath))}>
                  返回上级
                </Button>
              )}
              <Button size="small" onClick={() => handleOpenLocalDirectory(currentFolderPath)}>
                打开本地目录
              </Button>
              <Button size="small" onClick={() => handleSetFolderLocalAvailability('offline', currentFolderPath)}>
                当前目录离线
              </Button>
              <Button size="small" onClick={() => handleSetFolderLocalAvailability('online_only', currentFolderPath)}>
                当前目录释放
              </Button>
            </Space>
          </div>

          <Row gutter={16}>
            <Col xs={24} lg={7}>
              <div
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 8,
                  minHeight: 320,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${rowBorder}`, fontWeight: 500 }}>
                  目录树
                </div>
                {folderEntries.length === 0 && fileEntries.length === 0 ? (
                  <div style={{ padding: 20, color: '#999' }}>暂无目录元数据</div>
                ) : (
                  <div>
                    {[{ id: 'root', name: '根目录', relativePath: '', parentPath: '' }, ...folderEntries].map(folder => {
                      const depth = folder.relativePath ? folder.relativePath.split('/').length : 0;
                      const active = folder.relativePath === currentFolderPath;
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => setCurrentFolderPath(folder.relativePath)}
                          style={{
                            width: '100%',
                            border: 0,
                            borderBottom: `1px solid ${rowBorder}`,
                            background: active ? (isDarkMode ? '#111b26' : '#e6f4ff') : 'transparent',
                            color: isDarkMode ? '#f0f0f0' : '#222',
                            textAlign: 'left',
                            padding: `10px 12px 10px ${12 + depth * 14}px`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <FolderOutlined style={{ color: active ? '#1890ff' : '#999' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Col>

            <Col xs={24} lg={17}>
              <div
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 8,
                  minHeight: 320,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${rowBorder}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Space wrap size={4}>
                      <Button type="text" size="small" onClick={() => setCurrentFolderPath('')}>
                        根目录
                      </Button>
                      {currentFolderSegments.map(segment => (
                        <React.Fragment key={segment.path}>
                          <span style={{ color: '#999' }}>/</span>
                          <Button type="text" size="small" onClick={() => setCurrentFolderPath(segment.path)}>
                            {segment.name}
                          </Button>
                        </React.Fragment>
                      ))}
                    </Space>
                    <span style={{ color: subColor, fontSize: 12 }}>
                      {visibleFolders.length} 个文件夹，{visibleFiles.length} 个文件
                    </span>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Checkbox
                      checked={selectedAll}
                      indeterminate={selectedPartial}
                      onChange={e => toggleSelectAllVisible(e.target.checked)}
                    >
                      选择当前目录
                    </Checkbox>
                    <Space size={6} wrap>
                      <span style={{ color: subColor, fontSize: 12 }}>
                        已选 {selectedIds.length} 项
                      </span>
                      <Button size="small" onClick={() => handleBatchAvailability('offline')} disabled={selectedIds.length === 0}>
                        选中离线
                      </Button>
                      <Button size="small" onClick={() => handleBatchAvailability('online_only')} disabled={selectedIds.length === 0}>
                        选中释放
                      </Button>
                      <Button size="small" type="text" onClick={clearSelection} disabled={selectedIds.length === 0}>
                        清空选择
                      </Button>
                    </Space>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: `1px solid ${rowBorder}`,
                      display: 'grid',
                      gridTemplateColumns: '36px minmax(0, 1fr) 110px 120px 240px',
                      gap: 8,
                      alignItems: 'center',
                      color: subColor,
                      fontSize: 12,
                    }}
                  >
                    <span />
                    <span>名称</span>
                    <span>大小</span>
                    <span>状态</span>
                    <span>操作</span>
                  </div>
                </div>

                {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
                  <div style={{ padding: 32 }}>
                    <Empty description={currentFolderPath ? '该目录暂无内容' : '网盘目录为空'} />
                  </div>
                ) : (
                  <div>
                    {visibleFolders.map(folder => (
                      <Dropdown
                        key={folder.id}
                        trigger={['contextMenu']}
                        menu={{
                          items: [
                            { key: 'open', label: '打开目录', onClick: () => setCurrentFolderPath(folder.relativePath) },
                            { key: 'local-open', label: '打开本地目录', onClick: () => void handleOpenLocalDirectory(folder.relativePath) },
                            { key: 'offline', label: '该目录离线', onClick: () => void handleSetFolderLocalAvailability('offline', folder.relativePath) },
                            { key: 'release', label: '释放空间', onClick: () => void handleSetFolderLocalAvailability('online_only', folder.relativePath) },
                          ],
                        }}
                      >
                        <div
                          style={{
                            padding: '6px 12px',
                            borderBottom: `1px solid ${rowBorder}`,
                            display: 'grid',
                            gridTemplateColumns: '36px minmax(0, 1fr) 110px 120px 240px',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <Checkbox
                            checked={selectedIdSet.has(folder.id)}
                            onChange={e => toggleSelection(folder.id, e.target.checked)}
                            onClick={e => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            onClick={() => setCurrentFolderPath(folder.relativePath)}
                            style={{
                              border: 0,
                              background: 'transparent',
                              padding: 0,
                              margin: 0,
                              textAlign: 'left',
                              cursor: 'pointer',
                              color: isDarkMode ? '#f0f0f0' : '#222',
                              minWidth: 0,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <FolderOutlined style={{ color: '#1890ff' }} />
                              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {folder.name}
                              </span>
                            </div>
                          </button>
                          <span style={{ color: '#999', fontSize: 12 }}>-</span>
                          <Tag color="default" style={{ width: 'fit-content', marginInlineEnd: 0 }}>目录</Tag>
                          <Space size={2} wrap>
                            <Button size="small" type="text" onClick={() => setCurrentFolderPath(folder.relativePath)}>
                              打开
                            </Button>
                            <Button size="small" type="text" onClick={() => handleOpenLocalDirectory(folder.relativePath)}>
                              打开本地目录
                            </Button>
                            <Button size="small" type="text" onClick={() => handleSetFolderLocalAvailability('offline', folder.relativePath)}>
                              该目录离线
                            </Button>
                            <Button size="small" type="text" onClick={() => handleSetFolderLocalAvailability('online_only', folder.relativePath)}>
                              释放空间
                            </Button>
                            <Dropdown
                              trigger={['click']}
                              menu={{
                                items: [
                                  { key: 'folder-open', label: '打开目录', onClick: () => setCurrentFolderPath(folder.relativePath) },
                                  { key: 'folder-local-open', label: '打开本地目录', onClick: () => void handleOpenLocalDirectory(folder.relativePath) },
                                  { key: 'folder-offline', label: '该目录离线', onClick: () => void handleSetFolderLocalAvailability('offline', folder.relativePath) },
                                  { key: 'folder-release', label: '释放空间', onClick: () => void handleSetFolderLocalAvailability('online_only', folder.relativePath) },
                                ],
                              }}
                            >
                              <Button size="small" type="text" icon={<MoreOutlined />} />
                            </Dropdown>
                          </Space>
                        </div>
                      </Dropdown>
                    ))}

                    {visibleFiles.map(file => {
                      const availability = localStates[file.id] ?? 'online_only';
                      const uploadState = uploadStateMap.get(file.id)?.state ?? file.uploadState;
                      const downloadProgressItem = downloadStateMap.get(file.id);
                      const downloadState = downloadProgressItem?.state ?? file.downloadState;
                      return (
                        <Dropdown
                          key={file.id}
                          trigger={['contextMenu']}
                          menu={{
                            items: [
                              ...(availability !== 'online_only'
                                ? [{ key: 'open', label: '打开', onClick: () => void handleOpenLocalFile(file.id) }]
                                : [{ key: 'download', label: '下载到本机', onClick: () => void handleSetLocalAvailability(file.id, 'local') }]),
                              ...(availability !== 'offline'
                                ? [{ key: 'offline', label: '离线保留', onClick: () => void handleSetLocalAvailability(file.id, 'offline') }]
                                : []),
                              ...(availability !== 'online_only'
                                ? [{ key: 'release', label: '释放空间', onClick: () => void handleSetLocalAvailability(file.id, 'online_only') }]
                                : []),
                            ],
                          }}
                        >
                          <div
                          style={{
                            padding: '6px 12px',
                            borderBottom: `1px solid ${rowBorder}`,
                            display: 'grid',
                            gridTemplateColumns: '36px minmax(0, 1fr) 110px 120px 240px',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                            <Checkbox
                              checked={selectedIdSet.has(file.id)}
                              onChange={e => toggleSelection(file.id, e.target.checked)}
                              onClick={e => e.stopPropagation()}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FileOutlined style={{ color: '#999' }} />
                                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {file.filename}
                                </span>
                              </div>
                            </div>
                            <span style={{ color: '#999', fontSize: 12 }}>{formatBytes(file.size)}</span>
                            <Space size={4} wrap>
                              <Tag color={availabilityColor(availability)} style={{ marginInlineEnd: 0 }}>{availabilityLabel(availability)}</Tag>
                              {uploadState !== 'completed' && (
                                <Tag
                                  color={
                                    uploadState === 'uploading'
                                      ? 'processing'
                                      : uploadState === 'error'
                                        ? 'error'
                                        : uploadState === 'paused'
                                          ? 'warning'
                                          : 'default'
                                  }
                                  style={{ marginInlineEnd: 0 }}
                                >
                                  {uploadState === 'uploading'
                                    ? '上传中'
                                    : uploadState === 'error'
                                      ? '上传失败'
                                      : uploadState === 'paused'
                                        ? '上传暂停'
                                        : '待上传'}
                                </Tag>
                              )}
                              {downloadState && downloadState !== 'completed' && (
                                <Tag
                                  color={
                                    downloadState === 'downloading'
                                      ? 'processing'
                                      : downloadState === 'error'
                                        ? 'error'
                                        : downloadState === 'paused'
                                          ? 'warning'
                                          : 'default'
                                  }
                                  style={{ marginInlineEnd: 0 }}
                                >
                                  {downloadState === 'downloading'
                                    ? '下载中'
                                    : downloadState === 'error'
                                      ? '下载失败'
                                      : downloadState === 'paused'
                                        ? '下载暂停'
                                        : '待下载'}
                                </Tag>
                              )}
                            </Space>
                            <Space size={2} wrap>
                                {availability === 'online_only' ? (
                                  <Button size="small" type="text" onClick={() => handleSetLocalAvailability(file.id, 'local')}>
                                    下载到本机
                                  </Button>
                                ) : (
                                  <>
                                    <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => handleOpenLocalFile(file.id)}>
                                      打开
                                    </Button>
                                    <Button size="small" type="text" onClick={() => handleSetLocalAvailability(file.id, 'online_only')}>
                                      释放空间
                                    </Button>
                                  </>
                                )}
                                {availability !== 'offline' && (
                                  <Button size="small" type="text" onClick={() => handleSetLocalAvailability(file.id, 'offline')}>
                                    离线保留
                                  </Button>
                                )}
                                {downloadState === 'error' && (
                                  <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => retryDownload(file.id)} />
                                )}
                                {downloadState === 'downloading' && (
                                  <Button size="small" type="text" icon={<PauseOutlined />} onClick={() => pauseDownload(file.id)} />
                                )}
                                {downloadState === 'paused' && (
                                  <Button size="small" type="text" icon={<CaretRightOutlined />} onClick={() => resumeDownload(file.id)} />
                                )}
                                <Dropdown
                                  trigger={['click']}
                                  menu={{
                                    items: [
                                      ...(availability !== 'online_only'
                                        ? [{ key: 'file-open', label: '打开', onClick: () => void handleOpenLocalFile(file.id) }]
                                        : [{ key: 'file-download', label: '下载到本机', onClick: () => void handleSetLocalAvailability(file.id, 'local') }]),
                                      ...(availability !== 'offline'
                                        ? [{ key: 'file-offline', label: '离线保留', onClick: () => void handleSetLocalAvailability(file.id, 'offline') }]
                                        : []),
                                      ...(availability !== 'online_only'
                                        ? [{ key: 'file-release', label: '释放空间', onClick: () => void handleSetLocalAvailability(file.id, 'online_only') }]
                                        : []),
                                    ],
                                  }}
                                >
                                  <Button size="small" type="text" icon={<MoreOutlined />} />
                                </Dropdown>
                            </Space>
                          </div>
                        </Dropdown>
                      );
                    })}
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </div>

        {(activeUploadProgress.length > 0 || actionableDownloadProgress.length > 0) && (
          <div
            style={{
              marginTop: 12,
              background: cardBg,
              border: `1px solid ${cardBorder}`,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Space wrap size={6}>
                <Button
                  size="small"
                  type="text"
                  icon={<DownOutlined style={{ transform: transferExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />}
                  onClick={() => setTransferExpanded(prev => !prev)}
                >
                  传输队列
                </Button>
                {activeUploadProgress.length > 0 && <Tag>{`待上传 ${stats.pendingCount + stats.pausedCount}`}</Tag>}
                {stats.uploadingCount > 0 && <Tag color="processing">{`上传中 ${stats.uploadingCount}`}</Tag>}
                {actionableDownloadProgress.length > 0 && <Tag>{`待下载 ${actionableDownloadProgress.filter(p => p.state === 'pending' || p.state === 'paused').length}`}</Tag>}
                {downloadStats.downloadingCount > 0 && <Tag color="processing">{`下载中 ${downloadStats.downloadingCount}`}</Tag>}
                {stats.errorCount > 0 && <Tag color="error">{`上传失败 ${stats.errorCount}`}</Tag>}
                {downloadStats.errorCount > 0 && <Tag color="error">{`下载失败 ${downloadStats.errorCount}`}</Tag>}
              </Space>
              <Space wrap size={6}>
                <Button size="small" icon={<ReloadOutlined />} onClick={handleRetryFailed} disabled={stats.errorCount === 0}>
                  重试上传
                </Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={handleRetryFailedDownloads} disabled={downloadStats.errorCount === 0}>
                  重试下载
                </Button>
                <Button size="small" onClick={() => handleSetFolderLocalAvailability('offline')}>
                  全部离线
                </Button>
                <Button size="small" onClick={() => handleSetFolderLocalAvailability('online_only')}>
                  全部释放
                </Button>
              </Space>
            </div>

            {transferExpanded && (
              <div style={{ maxHeight: 220, overflow: 'auto', borderTop: `1px solid ${rowBorder}` }}>
              {activeUploadProgress.map(p => {
                const ratio = p.size > 0
                  ? p.uploaded_bytes / p.size
                  : p.total_chunks > 0
                    ? p.uploaded_chunks / p.total_chunks
                    : 0;
                const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
                return (
                  <div
                    key={`upload-${p.file_id}`}
                    style={{
                      padding: '8px 12px',
                      borderBottom: `1px solid ${rowBorder}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={p.state === 'error' ? 'error' : p.state === 'uploading' ? 'processing' : p.state === 'paused' ? 'warning' : 'default'}>
                          {p.state === 'uploading' ? '上传中' : p.state === 'error' ? '失败' : p.state === 'paused' ? '已暂停' : '待上传'}
                        </Tag>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.filename}</span>
                        <span style={{ color: '#999', fontSize: 12 }}>
                          {formatBytes(p.uploaded_bytes)} / {formatBytes(p.size)}
                        </span>
                        <span style={{ color: '#999', fontSize: 12 }}>{formatSpeed(uploadSpeedBps[p.file_id])}</span>
                        <span style={{ color: '#999', fontSize: 12 }}>{percent}%</span>
                      </div>
                      <Progress percent={percent} size="small" showInfo={false} status={p.state === 'error' ? 'exception' : 'normal'} />
                    </div>
                    <Space size={2} wrap>
                      {p.state === 'error' && <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => retryItem(p.file_id)} />}
                      {(p.state === 'uploading' || p.state === 'pending') && <Button size="small" type="text" icon={<PauseOutlined />} onClick={() => pauseItem(p.file_id)} />}
                      {p.state === 'paused' && <Button size="small" type="text" icon={<CaretRightOutlined />} onClick={() => resumeItem(p.file_id)} />}
                      <Popconfirm
                        title="取消该任务？"
                        description="将删除本地元数据并中止上传。"
                        icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                        onConfirm={() => handleCancel(p.file_id)}
                        okText="取消任务"
                        cancelText="保留"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" type="text" danger icon={<CloseOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                );
              })}

              {actionableDownloadProgress.map(p => {
                const percent = p.size > 0 ? Math.max(0, Math.min(100, Math.round((p.downloaded_bytes / p.size) * 100))) : 0;
                return (
                  <div
                    key={`download-${p.file_id}`}
                    style={{
                      padding: '8px 12px',
                      borderBottom: `1px solid ${rowBorder}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={p.state === 'error' ? 'error' : p.state === 'downloading' ? 'processing' : p.state === 'paused' ? 'warning' : 'default'}>
                          {p.state === 'downloading' ? '下载中' : p.state === 'error' ? '失败' : p.state === 'paused' ? '已暂停' : '待下载'}
                        </Tag>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.filename}</span>
                        <span style={{ color: '#999', fontSize: 12 }}>
                          {formatBytes(p.downloaded_bytes)} / {formatBytes(p.size)}
                        </span>
                        <span style={{ color: '#999', fontSize: 12 }}>{formatSpeed(downloadSpeedBps[p.file_id])}</span>
                        <span style={{ color: '#999', fontSize: 12 }}>{percent}%</span>
                      </div>
                      <Progress percent={percent} size="small" showInfo={false} status={p.state === 'error' ? 'exception' : 'normal'} />
                    </div>
                    <Space size={2} wrap>
                      {p.state === 'error' && <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => retryDownload(p.file_id)} />}
                      {p.state === 'pending' && <Button size="small" type="text" icon={<CaretRightOutlined />} onClick={() => downloadFile(p.file_id)} />}
                      {p.state === 'downloading' && <Button size="small" type="text" icon={<PauseOutlined />} onClick={() => pauseDownload(p.file_id)} />}
                      {p.state === 'paused' && <Button size="small" type="text" icon={<CaretRightOutlined />} onClick={() => resumeDownload(p.file_id)} />}
                      <Popconfirm
                        title="取消该下载？"
                        description="将删除已下载的部分文件，本地元数据保留。"
                        icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                        onConfirm={() => handleCancelDownload(p.file_id)}
                        okText="取消下载"
                        cancelText="保留"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" type="text" danger icon={<CloseOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                );
              })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 高级设置抽屉 */}
      <Drawer
        title="高级设置"
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        width={460}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setAdvancedOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSaveAdvanced} disabled={!advancedTouched}>
              保存
            </Button>
          </Space>
        }
      >
        <Form layout="vertical" colon={false}>
          <Divider orientation="left" plain style={{ marginTop: 0 }}>上传参数</Divider>

          <Form.Item
            label="单文件大小上限（MB）"
            tooltip="超过此大小的文件将被跳过；0 = 无限制"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={10}
              value={Math.round(draft.max_file_size / 1024 / 1024)}
              onChange={v => setNumberField('max_file_size', (v ?? 0) * 1024 * 1024)}
            />
          </Form.Item>

          <Form.Item
            label="分块大小（MB）"
            tooltip="大文件按此大小切片上传，建议 4-16MB"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={64}
              step={1}
              value={Math.round(draft.chunk_size / 1024 / 1024)}
              onChange={v => setNumberField('chunk_size', (v ?? 1) * 1024 * 1024)}
            />
          </Form.Item>

          <Form.Item
            label="小文件并发数"
            tooltip="同时上传的任务数；0 = 不限"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={16}
              value={draft.small_file_concurrency}
              onChange={v => setNumberField('small_file_concurrency', v ?? 0)}
            />
          </Form.Item>

          <Divider orientation="left" plain>四闸门（同步时机）</Divider>

          <Form.Item
            label="写入稳定阈值（毫秒）"
            tooltip="闸门1：文件停止写入多久后视为稳定（awaitWriteFinish）"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={500}
              value={draft.stability_threshold}
              onChange={v => setNumberField('stability_threshold', v ?? 0)}
            />
            <span style={{ color: subColor, fontSize: 12 }}>当前 ≈ {formatMs(draft.stability_threshold)}</span>
          </Form.Item>

          <Form.Item
            label="变更去抖时长（毫秒）"
            tooltip="闸门3：连续变更合并窗口；闸门4 哈希比对在去抖结束后触发"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={500}
              value={draft.debounce_ms}
              onChange={v => setNumberField('debounce_ms', v ?? 0)}
            />
            <span style={{ color: subColor, fontSize: 12 }}>当前 ≈ {formatMs(draft.debounce_ms)}</span>
          </Form.Item>

          <Divider orientation="left" plain>删除与忽略</Divider>

          <Form.Item
            label="软删除保留天数"
            tooltip="云端软删除记录保留天数，超过后由服务端定时清理"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={365}
              value={draft.soft_delete_retention_days}
              onChange={v => setNumberField('soft_delete_retention_days', v ?? 30)}
            />
          </Form.Item>

          <Form.Item label="忽略隐藏文件（以 . 开头）">
            <Switch
              checked={draft.ignore_hidden}
              onChange={checked => { setAdvancedTouched(true); setDraft(prev => ({ ...prev, ignore_hidden: checked })); }}
            />
          </Form.Item>

          <Form.Item
            label="忽略规则（每行一条 glob）"
            tooltip="如 ~$*（Office 锁文件）、*.tmp、.DS_Store"
          >
            <TextArea
              rows={8}
              value={patternsText}
              onChange={e => { setAdvancedTouched(true); setPatternsText(e.target.value); }}
              placeholder={DEFAULT_CLOUD_DRIVE_CONFIG.ignore_patterns.join('\n')}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </Content>
  );
};

export default CloudDrivePanel;
