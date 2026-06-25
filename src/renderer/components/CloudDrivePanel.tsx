/**
 * 网盘主面板
 * 监听本地目录、同步到云端，支持分块上传与断点续传
 *
 * 层7：补齐手动控制（重试 / 取消 / 暂停 / 恢复 / 清空已完成）与高级配置编辑。
 */

import React, { useMemo, useState } from 'react';
import {
  Layout, Button, Tooltip, Tag, Empty, Progress, Statistic, Row, Col, Space,
  Drawer, Form, InputNumber, Switch, Input, Divider, Popconfirm, message,
} from 'antd';
import {
  FolderOpenOutlined, PlayCircleOutlined, PauseCircleOutlined,
  ReloadOutlined, CloudOutlined, InboxOutlined, SettingOutlined,
  ClearOutlined, CaretRightOutlined, PauseOutlined, CloseOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useCloudDrive } from '../hooks/useCloudDrive';
import { useSettings } from '../contexts/SettingsContext';
import { CloudDriveConfig, DEFAULT_CLOUD_DRIVE_CONFIG } from '@shared/types';

const { Content } = Layout;
const { TextArea } = Input;

// 字节数格式化
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

// 毫秒数格式化（去抖/稳定阈值）
const formatMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} 秒` : `${ms} 毫秒`);

const CloudDrivePanel: React.FC = () => {
  const { isDarkMode } = useSettings();
  const {
    config, isWatching, uploadProgress, downloadProgress, loading,
    selectWatchedFolder, startWatching, stopWatching, scanNow, updateConfig,
    retryFailed, retryItem, pauseItem, resumeItem, cancelUpload, clearCompleted,
    downloadFile, pauseDownload, resumeDownload, cancelDownload,
    retryDownload, retryAllDownloads, clearCompletedDownloads,
  } = useCloudDrive();

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

        {/* 当前目录 */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ color: subColor, fontSize: 12, marginBottom: 4 }}>
            监听根目录
          </div>
          <div style={{ fontWeight: 500, wordBreak: 'break-all' }}>
            {config.watched_root_path || <span style={{ color: '#999' }}>未选择目录</span>}
          </div>
          <Row gutter={24} style={{ marginTop: 12 }}>
            <Col span={6}>
              <Statistic title="单文件上限" value={formatBytes(config.max_file_size)} />
            </Col>
            <Col span={6}>
              <Statistic title="分块大小" value={formatBytes(config.chunk_size)} />
            </Col>
            <Col span={6}>
              <Statistic title="小文件并发" value={config.small_file_concurrency === 0 ? '不限' : config.small_file_concurrency} />
            </Col>
            <Col span={6}>
              <Statistic title="软删保留" value={`${config.soft_delete_retention_days} 天`} />
            </Col>
          </Row>
        </div>

        {/* 统计概览 + 工具栏 */}
        {uploadProgress.length > 0 && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="待上传" value={stats.pendingCount + stats.pausedCount} />
                </div>
              </Col>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="上传中" value={stats.uploadingCount} />
                </div>
              </Col>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="已完成" value={stats.completedCount} />
                </div>
              </Col>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="失败" value={stats.errorCount} valueStyle={{ color: stats.errorCount > 0 ? '#cf1322' : undefined }} />
                </div>
              </Col>
              <Col span={4}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Tooltip title="重试全部失败任务">
                    <Button size="small" icon={<ReloadOutlined />} onClick={handleRetryFailed} disabled={stats.errorCount === 0}>
                      重试失败
                    </Button>
                  </Tooltip>
                  <Popconfirm
                    title="清空已完成任务"
                    description="仅从列表中移除，不会删除云端文件或本地引用。"
                    icon={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
                    onConfirm={handleClearCompleted}
                    disabled={stats.completedCount === 0}
                  >
                    <Button size="small" icon={<ClearOutlined />} disabled={stats.completedCount === 0}>
                      清空已完成
                    </Button>
                  </Popconfirm>
                </div>
              </Col>
            </Row>
          </>
        )}

        {/* 文件列表 */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 8,
            minHeight: 200,
          }}
        >
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>
          ) : uploadProgress.length === 0 ? (
            <div style={{ padding: 40 }}>
              <Empty
                image={<InboxOutlined style={{ fontSize: 48, color: isDarkMode ? '#434343' : '#d9d9d9' }} />}
                description="暂无上传任务"
              >
                {!config.watched_root_path && (
                  <Button type="primary" icon={<FolderOpenOutlined />} onClick={selectWatchedFolder}>
                    选择要同步的目录
                  </Button>
                )}
              </Empty>
            </div>
          ) : (
            <div style={{ padding: 8 }}>
              {uploadProgress.map(p => {
                // 优先用字节级进度（uploaded_bytes/size）：单块小文件也能平滑推进，
                // 不再出现"全程 0% → 突跳 100%"。size 为 0 时回退到分块比例（兼容旧事件）。
                const ratio = p.size > 0
                  ? p.uploaded_bytes / p.size
                  : p.total_chunks > 0
                    ? p.uploaded_chunks / p.total_chunks
                    : 0;
                const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
                return (
                  <div
                    key={p.file_id}
                    style={{
                      padding: '10px 12px',
                      borderBottom: `1px solid ${rowBorder}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>
                        <span style={{ fontWeight: 500 }}>{p.filename}</span>
                        <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>{p.relative_path}</span>
                      </div>
                      <Space size={8}>
                        <span style={{ color: '#999', fontSize: 12 }}>{formatBytes(p.size)}</span>
                        <Tag
                          color={
                            p.state === 'completed' ? 'success'
                              : p.state === 'uploading' ? 'processing'
                              : p.state === 'error' ? 'error'
                              : p.state === 'paused' ? 'warning'
                              : 'default'
                          }
                        >
                          {p.state === 'completed' ? '完成'
                            : p.state === 'uploading' ? '上传中'
                            : p.state === 'error' ? '失败'
                            : p.state === 'paused' ? '已暂停'
                            : '待上传'}
                        </Tag>

                        {/* 每文件操作 */}
                        <Space size={2}>
                          {p.state === 'error' && (
                            <Tooltip title="重试">
                              <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => retryItem(p.file_id)} />
                            </Tooltip>
                          )}
                          {(p.state === 'uploading' || p.state === 'pending') && (
                            <Tooltip title="暂停">
                              <Button size="small" type="text" icon={<PauseOutlined />} onClick={() => pauseItem(p.file_id)} />
                            </Tooltip>
                          )}
                          {p.state === 'paused' && (
                            <Tooltip title="恢复（断点续传）">
                              <Button size="small" type="text" icon={<CaretRightOutlined />} onClick={() => resumeItem(p.file_id)} />
                            </Tooltip>
                          )}
                          {p.state !== 'completed' && (
                            <Popconfirm
                              title="取消该任务？"
                              description="将删除本地元数据并中止上传。"
                              icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                              onConfirm={() => handleCancel(p.file_id)}
                              okText="取消任务"
                              cancelText="保留"
                              okButtonProps={{ danger: true }}
                            >
                              <Tooltip title="取消">
                                <Button size="small" type="text" danger icon={<CloseOutlined />} />
                              </Tooltip>
                            </Popconfirm>
                          )}
                        </Space>
                      </Space>
                    </div>
                    <Progress
                      percent={percent}
                      size="small"
                      status={
                        p.state === 'completed' ? 'success'
                          : p.state === 'error' ? 'exception'
                          : p.state === 'paused' ? 'normal'
                          : 'active'
                      }
                    />
                    {p.error_message && (
                      <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>{p.error_message}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 下载同步区（第二部分） */}
        {downloadProgress.length > 0 && (
          <>
            {/* 下载区标题 */}
            <div style={{ marginTop: 24, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CloudOutlined style={{ color: '#1890ff' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>下载同步</h3>
              <span style={{ color: subColor, fontSize: 12 }}>从云端落盘到本地</span>
            </div>

            {/* 下载统计概览 + 工具栏 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="待下载" value={downloadStats.pendingCount + downloadStats.pausedCount} />
                </div>
              </Col>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="下载中" value={downloadStats.downloadingCount} />
                </div>
              </Col>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="已完成" value={downloadStats.completedCount} />
                </div>
              </Col>
              <Col span={5}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12 }}>
                  <Statistic title="失败" value={downloadStats.errorCount} valueStyle={{ color: downloadStats.errorCount > 0 ? '#cf1322' : undefined }} />
                </div>
              </Col>
              <Col span={4}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: 12, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Tooltip title="重试全部失败下载">
                    <Button size="small" icon={<ReloadOutlined />} onClick={handleRetryFailedDownloads} disabled={downloadStats.errorCount === 0}>
                      重试失败
                    </Button>
                  </Tooltip>
                  <Popconfirm
                    title="清空已完成下载"
                    description="仅从列表中移除，不会删除云端文件或本地文件。"
                    icon={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
                    onConfirm={handleClearCompletedDownloads}
                    disabled={downloadStats.completedCount === 0}
                  >
                    <Button size="small" icon={<ClearOutlined />} disabled={downloadStats.completedCount === 0}>
                      清空已完成
                    </Button>
                  </Popconfirm>
                </div>
              </Col>
            </Row>

            {/* 下载文件列表 */}
            <div
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderRadius: 8,
                minHeight: 100,
              }}
            >
              <div style={{ padding: 8 }}>
                {downloadProgress.map(p => {
                  const percent = p.size > 0
                    ? Math.max(0, Math.min(100, Math.round((p.downloaded_bytes / p.size) * 100)))
                    : 0;
                  return (
                    <div
                      key={p.file_id}
                      style={{
                        padding: '10px 12px',
                        borderBottom: `1px solid ${rowBorder}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>
                          <span style={{ fontWeight: 500 }}>{p.filename}</span>
                          <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>{p.relative_path}</span>
                        </div>
                        <Space size={8}>
                          <span style={{ color: '#999', fontSize: 12 }}>{formatBytes(p.size)}</span>
                          <Tag
                            color={
                              p.state === 'completed' ? 'success'
                                : p.state === 'downloading' ? 'processing'
                                : p.state === 'error' ? 'error'
                                : p.state === 'paused' ? 'warning'
                                : 'default'
                            }
                          >
                            {p.state === 'completed' ? '完成'
                              : p.state === 'downloading' ? '下载中'
                              : p.state === 'error' ? '失败'
                              : p.state === 'paused' ? '已暂停'
                              : '待下载'}
                          </Tag>

                          {/* 每文件操作 */}
                          <Space size={2}>
                            {p.state === 'error' && (
                              <Tooltip title="重试">
                                <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => retryDownload(p.file_id)} />
                              </Tooltip>
                            )}
                            {p.state === 'pending' && (
                              <Tooltip title="开始下载">
                                <Button size="small" type="text" icon={<CaretRightOutlined />} onClick={() => downloadFile(p.file_id)} />
                              </Tooltip>
                            )}
                            {p.state === 'downloading' && (
                              <Tooltip title="暂停">
                                <Button size="small" type="text" icon={<PauseOutlined />} onClick={() => pauseDownload(p.file_id)} />
                              </Tooltip>
                            )}
                            {p.state === 'paused' && (
                              <Tooltip title="恢复（断点续传）">
                                <Button size="small" type="text" icon={<CaretRightOutlined />} onClick={() => resumeDownload(p.file_id)} />
                              </Tooltip>
                            )}
                            {p.state !== 'completed' && (
                              <Popconfirm
                                title="取消该下载？"
                                description="将删除已下载的部分文件，本地元数据保留。"
                                icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                                onConfirm={() => handleCancelDownload(p.file_id)}
                                okText="取消下载"
                                cancelText="保留"
                                okButtonProps={{ danger: true }}
                              >
                                <Tooltip title="取消">
                                  <Button size="small" type="text" danger icon={<CloseOutlined />} />
                                </Tooltip>
                              </Popconfirm>
                            )}
                          </Space>
                        </Space>
                      </div>
                      <Progress
                        percent={percent}
                        size="small"
                        status={
                          p.state === 'completed' ? 'success'
                            : p.state === 'error' ? 'exception'
                            : p.state === 'paused' ? 'normal'
                            : 'active'
                        }
                      />
                      {p.error_message && (
                        <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>{p.error_message}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
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
