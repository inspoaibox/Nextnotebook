/**
 * SecurityTool - PDF 安全与加密工具
 * 支持设置密码保护和权限控制
 */

import React, { useState, useCallback } from 'react';
import {
  Upload,
  Button,
  Space,
  Typography,
  Card,
  Row,
  Col,
  message,
  Spin,
  Input,
  Checkbox,
  Form,
  Alert,
  Tabs,
  Divider,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  LockOutlined,
  UnlockOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { pdfApi } from '../../services/pdfApi';

const { Text, Title } = Typography;
const { Dragger } = Upload;
const { Password } = Input;

// ============ 类型定义 ============

interface SecuritySettings {
  userPassword: string;
  ownerPassword: string;
  permissions: {
    printing: boolean;
    copying: boolean;
    modifying: boolean;
  };
}

// ============ 主组件 ============

const SecurityTool: React.FC = () => {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'encrypt' | 'decrypt'>('encrypt');
  
  // 加密设置
  const [settings, setSettings] = useState<SecuritySettings>({
    userPassword: '',
    ownerPassword: '',
    permissions: {
      printing: true,
      copying: true,
      modifying: true,
    },
  });

  // 解密密码
  const [decryptPassword, setDecryptPassword] = useState('');

  // 处理文件上传
  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return false;
    }

    try {
      setLoading(true);
      const arrayBuffer = await file.arrayBuffer();
      
      // 复制 ArrayBuffer 以避免 detached 问题
      const bufferCopy = arrayBuffer.slice(0);
      
      // 验证 PDF
      const header = new Uint8Array(bufferCopy.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      if (!pdfHeader.startsWith('%PDF-')) {
        message.error('无效的 PDF 文件');
        return false;
      }

      setPdfData(bufferCopy);
      setFileName(file.name);
      message.success('PDF 加载成功');
      return false;
    } catch (error) {
      console.error('Failed to load PDF:', error);
      message.error('PDF 加载失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 加密 PDF
  const handleEncrypt = useCallback(async () => {
    if (!pdfData) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    if (!settings.userPassword && !settings.ownerPassword) {
      message.warning('请至少设置一个密码');
      return;
    }

    try {
      setProcessing(true);
      // 复制 ArrayBuffer 以避免 detached 问题
      const encryptedPdf = await pdfApi.setSecurity({
        file: pdfData.slice(0),
        userPassword: settings.userPassword || undefined,
        ownerPassword: settings.ownerPassword || undefined,
        permissions: settings.permissions,
      });

      // 下载文件
      const blob = new Blob([encryptedPdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.pdf', '_encrypted.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      message.success('PDF 加密成功');
    } catch (error) {
      console.error('Failed to encrypt PDF:', error);
      message.error('加密失败');
    } finally {
      setProcessing(false);
    }
  }, [pdfData, settings, fileName]);

  // 解密 PDF
  const handleDecrypt = useCallback(async () => {
    if (!pdfData) {
      message.warning('请先上传 PDF 文件');
      return;
    }

    try {
      setProcessing(true);
      // 复制 ArrayBuffer 以避免 detached 问题
      const decryptedPdf = await pdfApi.removeSecurity(pdfData.slice(0), decryptPassword);

      // 下载文件
      const blob = new Blob([decryptedPdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.pdf', '_decrypted.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      message.success('PDF 解密成功');
    } catch (error) {
      console.error('Failed to decrypt PDF:', error);
      message.error('解密失败，请检查密码是否正确');
    } finally {
      setProcessing(false);
    }
  }, [pdfData, decryptPassword, fileName]);

  // 渲染加密面板
  const renderEncryptPanel = () => (
    <Form layout="vertical" size="small">
      <Form.Item label="用户密码（打开文档时需要）">
        <Password
          value={settings.userPassword}
          onChange={e => setSettings(prev => ({ ...prev, userPassword: e.target.value }))}
          placeholder="留空则不设置用户密码"
          prefix={<KeyOutlined />}
        />
      </Form.Item>

      <Form.Item label="所有者密码（修改权限时需要）">
        <Password
          value={settings.ownerPassword}
          onChange={e => setSettings(prev => ({ ...prev, ownerPassword: e.target.value }))}
          placeholder="留空则不设置所有者密码"
          prefix={<KeyOutlined />}
        />
      </Form.Item>

      <Divider style={{ margin: '12px 0' }}>权限设置</Divider>

      <Form.Item>
        <Space direction="vertical">
          <Checkbox
            checked={settings.permissions.printing}
            onChange={e => setSettings(prev => ({
              ...prev,
              permissions: { ...prev.permissions, printing: e.target.checked },
            }))}
          >
            允许打印
          </Checkbox>
          <Checkbox
            checked={settings.permissions.copying}
            onChange={e => setSettings(prev => ({
              ...prev,
              permissions: { ...prev.permissions, copying: e.target.checked },
            }))}
          >
            允许复制内容
          </Checkbox>
          <Checkbox
            checked={settings.permissions.modifying}
            onChange={e => setSettings(prev => ({
              ...prev,
              permissions: { ...prev.permissions, modifying: e.target.checked },
            }))}
          >
            允许修改
          </Checkbox>
        </Space>
      </Form.Item>

      <Form.Item>
        <Button
          type="primary"
          icon={<LockOutlined />}
          onClick={handleEncrypt}
          disabled={!pdfData}
          block
        >
          加密并下载
        </Button>
      </Form.Item>

      <Alert
        type="warning"
        showIcon
        message="注意"
        description="pdf-lib 库对加密支持有限，某些 PDF 阅读器可能无法正确识别权限设置。建议使用专业工具进行重要文档的加密。"
      />
    </Form>
  );

  // 渲染解密面板
  const renderDecryptPanel = () => (
    <Form layout="vertical" size="small">
      <Form.Item label="输入密码">
        <Password
          value={decryptPassword}
          onChange={e => setDecryptPassword(e.target.value)}
          placeholder="输入 PDF 密码"
          prefix={<KeyOutlined />}
        />
      </Form.Item>

      <Form.Item>
        <Button
          type="primary"
          icon={<UnlockOutlined />}
          onClick={handleDecrypt}
          disabled={!pdfData}
          block
        >
          解密并下载
        </Button>
      </Form.Item>

      <Alert
        type="info"
        showIcon
        message="提示"
        description="如果 PDF 设置了用户密码，需要输入正确的密码才能解密。如果只设置了所有者密码，可能可以直接打开但无法修改。"
      />
    </Form>
  );

  const tabItems = [
    {
      key: 'encrypt',
      label: (
        <span>
          <LockOutlined />
          加密
        </span>
      ),
      children: renderEncryptPanel(),
    },
    {
      key: 'decrypt',
      label: (
        <span>
          <UnlockOutlined />
          解密
        </span>
      ),
      children: renderDecryptPanel(),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Spin spinning={loading || processing}>
        {/* 文件上传区 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 12]} align="middle">
            {!pdfData ? (
              <Col span={24}>
                <Dragger
                  accept=".pdf"
                  showUploadList={false}
                  beforeUpload={handleUpload}
                  style={{ padding: '12px 0' }}
                >
                  <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                    <InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} />
                  </p>
                  <p className="ant-upload-text" style={{ marginBottom: 4 }}>
                    点击或拖拽 PDF 文件到此处
                  </p>
                  <p className="ant-upload-hint">支持加密或解密 PDF 文件</p>
                </Dragger>
              </Col>
            ) : (
              <>
                <Col flex="auto">
                  <Text strong>{fileName}</Text>
                </Col>
                <Col>
                  <Upload accept=".pdf" showUploadList={false} beforeUpload={handleUpload}>
                    <Button>更换文件</Button>
                  </Upload>
                </Col>
              </>
            )}
          </Row>
        </Card>

        {/* 加密/解密选项 */}
        {pdfData && (
          <Card size="small">
            <Tabs
              activeKey={activeTab}
              onChange={key => setActiveTab(key as 'encrypt' | 'decrypt')}
              items={tabItems}
            />
          </Card>
        )}
      </Spin>
    </div>
  );
};

export default SecurityTool;
