import React, { useState } from 'react';
import { Modal, Card, Row, Col, Input, Form, Select, DatePicker, TimePicker } from 'antd';

// 模板变量类型
interface TemplateVariable {
  name: string;
  type: 'text' | 'date' | 'time' | 'datetime' | 'select';
  label: string;
  defaultValue?: string;
  options?: string[];
}

// 笔记模板类型
interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
  variables: TemplateVariable[];
}

// 默认模板（在渲染进程中定义）
const DEFAULT_TEMPLATES: NoteTemplate[] = [
  {
    id: 'blank',
    name: '空白笔记',
    description: '从空白开始',
    icon: '📝',
    content: '',
    variables: [],
  },
  {
    id: 'diary',
    name: '日记',
    description: '每日记录模板',
    icon: '📅',
    content: `# {{date}} 日记

## 今日心情
{{mood}}

## 今日事项
- [ ] 

## 今日总结

## 明日计划
`,
    variables: [
      { name: 'date', type: 'date', label: '日期' },
      { name: 'mood', type: 'select', label: '心情', options: ['😊 开心', '😐 平静', '😔 低落', '😤 烦躁'] },
    ],
  },
  {
    id: 'meeting',
    name: '会议记录',
    description: '会议纪要模板',
    icon: '🤝',
    content: `# {{title}}

**日期**: {{date}}
**参会人员**: {{attendees}}

## 会议议题

## 讨论内容

## 决议事项
- [ ] 

## 后续行动
`,
    variables: [
      { name: 'title', type: 'text', label: '会议主题' },
      { name: 'date', type: 'date', label: '日期' },
      { name: 'attendees', type: 'text', label: '参会人员' },
    ],
  },
  {
    id: 'reading',
    name: '读书笔记',
    description: '书籍阅读笔记',
    icon: '📚',
    content: `# 《{{bookTitle}}》读书笔记

**作者**: {{author}}
**阅读日期**: {{date}}

## 内容摘要

## 精彩摘录
> 

## 个人感悟
`,
    variables: [
      { name: 'bookTitle', type: 'text', label: '书名' },
      { name: 'author', type: 'text', label: '作者' },
      { name: 'date', type: 'date', label: '日期' },
    ],
  },
  {
    id: 'todo',
    name: '待办清单',
    description: '任务清单模板',
    icon: '✅',
    content: `# {{title}}

## 高优先级
- [ ] 

## 中优先级
- [ ] 

## 低优先级
- [ ] 
`,
    variables: [
      { name: 'title', type: 'text', label: '清单标题', defaultValue: '待办事项' },
    ],
  },
];

interface TemplateSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (title: string, content: string) => void;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ open, onClose, onSelect }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [form] = Form.useForm();

  const handleTemplateClick = (template: NoteTemplate) => {
    if (template.variables.length === 0) {
      // 无变量，直接应用
      onSelect(template.name, template.content);
      onClose();
    } else {
      setSelectedTemplate(template);
      form.resetFields();
    }
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplate) return;

    const values = form.getFieldsValue();
    let content = selectedTemplate.content;
    let title = selectedTemplate.name;

    // 替换变量
    for (const variable of selectedTemplate.variables) {
      let value = values[variable.name] || variable.defaultValue || '';
      
      // 处理日期类型
      if (value && value.$d) {
        const date = value.$d;
        if (variable.type === 'date') {
          value = date.toLocaleDateString('zh-CN');
        } else if (variable.type === 'time') {
          value = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
      }
      
      content = content.replace(new RegExp(`{{${variable.name}}}`, 'g'), value);
      
      if (variable.name === 'title' && value) {
        title = value;
      } else if (variable.name === 'bookTitle' && value) {
        title = `《${value}》读书笔记`;
      }
    }

    // 生成标题
    if (selectedTemplate.id === 'diary') {
      title = `${new Date().toLocaleDateString('zh-CN')} 日记`;
    }

    onSelect(title, content);
    setSelectedTemplate(null);
    onClose();
  };

  const renderVariableInput = (variable: TemplateVariable) => {
    switch (variable.type) {
      case 'select':
        return (
          <Select options={variable.options?.map(o => ({ value: o, label: o }))} />
        );
      case 'date':
        return <DatePicker style={{ width: '100%' }} />;
      case 'time':
        return <TimePicker style={{ width: '100%' }} format="HH:mm" />;
      default:
        return <Input placeholder={variable.label} />;
    }
  };

  return (
    <>
      <Modal
        title="选择模板"
        open={open && !selectedTemplate}
        onCancel={onClose}
        footer={null}
        width={600}
      >
        <Row gutter={[16, 16]}>
          {DEFAULT_TEMPLATES.map(template => (
            <Col span={8} key={template.id}>
              <Card
                hoverable
                onClick={() => handleTemplateClick(template)}
                style={{ textAlign: 'center' }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{template.icon}</div>
                <div style={{ fontWeight: 500 }}>{template.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{template.description}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Modal>

      <Modal
        title={`${selectedTemplate?.icon} ${selectedTemplate?.name}`}
        open={!!selectedTemplate}
        onCancel={() => setSelectedTemplate(null)}
        onOk={handleApplyTemplate}
        okText="创建笔记"
      >
        <Form form={form} layout="vertical">
          {selectedTemplate?.variables.map(variable => (
            <Form.Item
              key={variable.name}
              name={variable.name}
              label={variable.label}
              initialValue={variable.defaultValue}
            >
              {renderVariableInput(variable)}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </>
  );
};

export default TemplateSelector;
