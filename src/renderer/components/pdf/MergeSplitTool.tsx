/**
 * MergeSplitTool - PDF 合并拆分工具组件
 * 采用上下布局：上方为文件上传和操作按钮，下方为页面缩略图网格
 */

import React, { useState, useCallback } from 'react';
import { Card, Row, Col, Typography, Upload, Button, Space, message, Input, Tabs, List, Tooltip } from 'antd';
import {
  UploadOutlined,
  InboxOutlined,
  DeleteOutlined,
  MergeCellsOutlined,
  ScissorOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';
import PDFThumbnails from './PDFThumbnails';
import { generateId, downloadFile } from './utils';

const { Text } = Typography;
const { Dragger } = Upload;
const { TabPane } = Tabs;

// ============ 类型定义 ============

interface PDFFile {
  id: string;
  name: string;
  data: ArrayBuffer;
  pageCount: number;
  selectedPages: number[];
}

// ============ MergeSplitTool 组件 ============

const MergeSplitTool: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'merge' | 'split'>('merge');
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [splitFile, setSplitFile] = useState<PDFFile | null>(null);
  const [splitRanges, setSplitRanges] = useState('');
  const [processing, setProcessing] = useState(false);

  // ============ 合并功能 ============

  // 添加文件（合并模式）
  const handleAddFile = useCallback(async (file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 复制 ArrayBuffer 以避免 detached 问题
      const bufferCopy = arrayBuffer.slice(0);
      
      const header = new Uint8Array(bufferCopy.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      // 获取页数 - 使用新的副本
      const infoBuffer = bufferCopy.slice(0);
      const info = await pdfApi.getInfo(infoBuffer);
      
      const newFile: PDFFile = {
        id: generateId(),
        name: file.name,
        data: bufferCopy,
        pageCount: info.pageCount,
        selectedPages: Array.from({ length: info.pageCount }, (_, i) => i + 1),
      };

      setFiles(prev => [...prev, newFile]);
      message.success(`已添加: ${file.name}`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);

  // 移除文件
  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // 移动文件顺序
  const handleMoveFile = useCallback((id: string, direction: 'up' | 'down') => {
    setFiles(prev => {
      const index = prev.findIndex(f => f.id === id);
      if (index === -1) return prev;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newFiles = [...prev];
      [newFiles[index], newFiles[newIndex]] = [newFiles[newIndex], newFiles[index]];
      return newFiles;
    });
  }, []);

  // 更新文件的选中页面
  const handlePageSelect = useCallback((fileId: string, pages: number[]) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, selectedPages: pages } : f
    ));
  }, []);

  // 执行合并
  const handleMerge = useCallback(async () => {
    if (files.length < 2) {
      message.warning('请至少添加两个 PDF 文件');
      return;
    }

    setProcessing(true);
    try {
      // 复制所有 ArrayBuffer 以避免 detached 问题
      const result = await pdfApi.merge({
        files: files.map(f => f.data.slice(0)),
        pageSelections: files.map((f, index) => ({
          fileIndex: index,
          pages: f.selectedPages,
        })),
      });

      // 下载合并后的文件
      downloadFile(result, 'merged.pdf');

      message.success('合并完成');
    } catch (error) {
      console.error('Merge failed:', error);
      message.error('合并失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [files]);

  // ============ 拆分功能 ============

  // 上传拆分文件
  const handleSplitFileUpload = useCallback(async (file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 复制 ArrayBuffer 以避免 detached 问题
      const bufferCopy = arrayBuffer.slice(0);
      
      const header = new Uint8Array(bufferCopy.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      // 获取页数 - 使用新的副本
      const infoBuffer = bufferCopy.slice(0);
      const info = await pdfApi.getInfo(infoBuffer);
      
      setSplitFile({
        id: generateId(),
        name: file.name,
        data: bufferCopy,
        pageCount: info.pageCount,
        selectedPages: [],
      });

      // 默认拆分范围
      setSplitRanges(`1-${info.pageCount}`);
      message.success(`已加载: ${file.name} (${info.pageCount} 页)`);
      return true;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    }
  }, []);

  // 执行拆分
  const handleSplit = useCallback(async () => {
    if (!splitFile) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (!splitRanges.trim()) {
      message.warning('请输入拆分范围');
      return;
    }

    setProcessing(true);
    try {
      // 复制 ArrayBuffer 以避免 detached 问题
      const results = await pdfApi.split({
        file: splitFile.data.slice(0),
        ranges: splitRanges,
      });

      if (results.length === 0) {
        message.warning('没有生成任何文件，请检查页面范围');
        return;
      }

      // 下载所有拆分后的文件
      const baseName = splitFile.name.replace('.pdf', '');
      results.forEach((data, index) => {
        downloadFile(data, `${baseName}_part${index + 1}.pdf`);
      });

      message.success(`拆分完成，生成 ${results.length} 个文件`);
    } catch (error) {
      console.error('Split failed:', error);
      message.error('拆分失败: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [splitFile, splitRanges]);

  // ============ 渲染 ============

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as 'merge' | 'split')}>
        {/* 合并标签页 */}
        <TabPane tab={<span><MergeCellsOutlined /> 合并 PDF</span>} key="merge">
          {/* 上方：文件上传和操作 */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Upload
                  accept=".pdf"
                  multiple
                  showUploadList={false}
                  beforeUpload={handleAddFile}
                >
                  <Button icon={<UploadOutlined />}>添加 PDF 文件</Button>
                </Upload>
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  已添加 {files.length} 个文件
                </Text>
              </Col>
              <Col>
                <Button
                  type="primary"
                  icon={<MergeCellsOutlined />}
                  onClick={handleMerge}
                  loading={processing}
                  disabled={files.length < 2}
                >
                  合并
                </Button>
              </Col>
            </Row>
          </Card>

          {/* 下方：文件列表 */}
          {files.length === 0 ? (
            <Dragger
              accept=".pdf"
              multiple
              showUploadList={false}
              beforeUpload={handleAddFile}
              style={{ padding: 40 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽 PDF 文件到此处</p>
              <p className="ant-upload-hint">支持多个文件，将按添加顺序合并</p>
            </Dragger>
          ) : (
            <List
              dataSource={files}
              renderItem={(file, index) => (
                <Card size="small" style={{ marginBottom: 8 }}>
                  <Row gutter={8} align="middle">
                    <Col>
                      <Space direction="vertical" size={0}>
                        <Button
                          type="text"
                          size="small"
                          icon={<ArrowUpOutlined />}
                          disabled={index === 0}
                          onClick={() => handleMoveFile(file.id, 'up')}
                        />
                        <Button
                          type="text"
                          size="small"
                          icon={<ArrowDownOutlined />}
                          disabled={index === files.length - 1}
                          onClick={() => handleMoveFile(file.id, 'down')}
                        />
                      </Space>
                    </Col>
                    <Col flex="auto">
                      <Text strong>{index + 1}. {file.name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {file.pageCount} 页 | 已选择 {file.selectedPages.length} 页
                      </Text>
                    </Col>
                    <Col>
                      <Tooltip title="移除">
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveFile(file.id)}
                        />
                      </Tooltip>
                    </Col>
                  </Row>
                  {/* 页面缩略图 */}
                  <div style={{ marginTop: 8 }}>
                    <PDFThumbnails
                      pdfData={file.data}
                      selectedPages={file.selectedPages}
                      onPageSelect={(pages) => handlePageSelect(file.id, pages)}
                      multiSelect={true}
                      thumbnailWidth={80}
                      style={{ maxHeight: 200 }}
                    />
                  </div>
                </Card>
              )}
            />
          )}
        </TabPane>

        {/* 拆分标签页 */}
        <TabPane tab={<span><ScissorOutlined /> 拆分 PDF</span>} key="split">
          {/* 上方：文件上传和拆分设置 */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <Row gutter={16} align="middle">
              <Col span={8}>
                <Upload
                  accept=".pdf"
                  showUploadList={false}
                  beforeUpload={handleSplitFileUpload}
                >
                  <Button icon={<UploadOutlined />}>
                    {splitFile ? '更换文件' : '上传 PDF'}
                  </Button>
                </Upload>
                {splitFile && (
                  <Text style={{ marginLeft: 8 }}>
                    {splitFile.name} ({splitFile.pageCount} 页)
                  </Text>
                )}
              </Col>
              <Col span={10}>
                <Input
                  placeholder="如: 1-3;4-6;7-10"
                  value={splitRanges}
                  onChange={(e) => setSplitRanges(e.target.value)}
                  disabled={!splitFile}
                  addonBefore="页面范围"
                />
              </Col>
              <Col span={6}>
                <Button
                  type="primary"
                  icon={<ScissorOutlined />}
                  onClick={handleSplit}
                  loading={processing}
                  disabled={!splitFile}
                >
                  拆分
                </Button>
              </Col>
            </Row>
            {splitFile && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
                <Text strong style={{ color: '#1890ff' }}>📋 拆分示例：</Text>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#666' }}>
                  <li><Text code>1-3;4-6</Text> → 生成2个文件：第1-3页、第4-6页</li>
                  <li><Text code>1;2;3</Text> → 每页单独一个文件</li>
                  <li><Text code>1-{splitFile.pageCount}</Text> → 提取全部页面为一个文件</li>
                </ul>
              </div>
            )}
          </Card>

          {/* 下方：页面缩略图 */}
          {!splitFile ? (
            <Dragger
              accept=".pdf"
              showUploadList={false}
              beforeUpload={handleSplitFileUpload}
              style={{ padding: 40 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽 PDF 文件到此处</p>
              <p className="ant-upload-hint">上传后可选择要拆分的页面范围</p>
            </Dragger>
          ) : (
            <Card size="small" title="页面预览">
              <PDFThumbnails
                pdfData={splitFile.data}
                selectedPages={splitFile.selectedPages}
                onPageSelect={(pages) => setSplitFile(prev => prev ? { ...prev, selectedPages: pages } : null)}
                multiSelect={true}
                thumbnailWidth={100}
              />
            </Card>
          )}
        </TabPane>
      </Tabs>
    </div>
  );
};

export default MergeSplitTool;
