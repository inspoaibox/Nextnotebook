import { ItemsManager } from '../database/ItemsManager';

export interface TemplateVariable {
  name: string;
  type: 'text' | 'date' | 'time' | 'datetime' | 'select';
  label: string;
  defaultValue?: string;
  options?: string[];  // for select type
}

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
  variables: TemplateVariable[];
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
}

// 系统默认模板
export const DEFAULT_TEMPLATES: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '空白笔记',
    description: '从空白开始',
    icon: '📝',
    content: '',
    variables: [],
    isSystem: true,
  },
  {
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
      { name: 'date', type: 'date', label: '日期', defaultValue: '{{TODAY}}' },
      { name: 'mood', type: 'select', label: '心情', options: ['😊 开心', '😐 平静', '😔 低落', '😤 烦躁'] },
    ],
    isSystem: true,
  },
  {
    name: '会议记录',
    description: '会议纪要模板',
    icon: '🤝',
    content: `# {{title}}

**日期**: {{date}}
**时间**: {{time}}
**参会人员**: {{attendees}}

## 会议议题

## 讨论内容

## 决议事项
- [ ] 

## 后续行动
| 事项 | 负责人 | 截止日期 |
|------|--------|----------|
|      |        |          |
`,
    variables: [
      { name: 'title', type: 'text', label: '会议主题' },
      { name: 'date', type: 'date', label: '日期', defaultValue: '{{TODAY}}' },
      { name: 'time', type: 'time', label: '时间', defaultValue: '{{NOW}}' },
      { name: 'attendees', type: 'text', label: '参会人员' },
    ],
    isSystem: true,
  },
  {
    name: '读书笔记',
    description: '书籍阅读笔记',
    icon: '📚',
    content: `# 《{{bookTitle}}》读书笔记

**作者**: {{author}}
**阅读日期**: {{date}}
**评分**: {{rating}}/5

## 内容摘要

## 精彩摘录
> 

## 个人感悟

## 行动计划
`,
    variables: [
      { name: 'bookTitle', type: 'text', label: '书名' },
      { name: 'author', type: 'text', label: '作者' },
      { name: 'date', type: 'date', label: '日期', defaultValue: '{{TODAY}}' },
      { name: 'rating', type: 'select', label: '评分', options: ['1', '2', '3', '4', '5'] },
    ],
    isSystem: true,
  },
  {
    name: '项目计划',
    description: '项目规划模板',
    icon: '🎯',
    content: `# {{projectName}}

## 项目概述
{{description}}

## 目标
- 

## 里程碑
| 阶段 | 目标 | 截止日期 | 状态 |
|------|------|----------|------|
|      |      |          | ⏳   |

## 任务分解
- [ ] 

## 风险与挑战

## 资源需求
`,
    variables: [
      { name: 'projectName', type: 'text', label: '项目名称' },
      { name: 'description', type: 'text', label: '项目描述' },
    ],
    isSystem: true,
  },
  {
    name: '周报',
    description: '每周工作总结',
    icon: '📊',
    content: `# {{date}} 周报

## 本周完成
- 

## 进行中
- 

## 下周计划
- 

## 问题与风险

## 需要支持
`,
    variables: [
      { name: 'date', type: 'date', label: '日期', defaultValue: '{{TODAY}}' },
    ],
    isSystem: true,
  },
];

export class TemplateManager {
  private itemsManager: ItemsManager;
  private templates: Map<string, NoteTemplate> = new Map();

  constructor(itemsManager: ItemsManager) {
    this.itemsManager = itemsManager;
    this.loadTemplates();
  }

  // 加载模板
  private loadTemplates(): void {
    // 加载系统模板
    for (const template of DEFAULT_TEMPLATES) {
      const id = `system-${template.name}`;
      this.templates.set(id, {
        ...template,
        id,
        createdAt: 0,
        updatedAt: 0,
      });
    }

    // 加载用户自定义模板
    const userTemplates = this.itemsManager.getByType('template' as any);
    for (const item of userTemplates) {
      const template = JSON.parse(item.payload) as NoteTemplate;
      this.templates.set(template.id, template);
    }
  }

  // 获取所有模板
  getAllTemplates(): NoteTemplate[] {
    return Array.from(this.templates.values());
  }

  // 获取单个模板
  getTemplate(id: string): NoteTemplate | undefined {
    return this.templates.get(id);
  }

  // 创建自定义模板
  createTemplate(template: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isSystem'>): NoteTemplate {
    const now = Date.now();
    const newTemplate: NoteTemplate = {
      ...template,
      id: `user-${now}`,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };

    // 保存到数据库
    this.itemsManager.create('template' as any, newTemplate);
    this.templates.set(newTemplate.id, newTemplate);

    return newTemplate;
  }

  // 更新模板
  updateTemplate(id: string, updates: Partial<NoteTemplate>): NoteTemplate | null {
    const template = this.templates.get(id);
    if (!template || template.isSystem) return null;

    const updatedTemplate: NoteTemplate = {
      ...template,
      ...updates,
      id: template.id,
      isSystem: false,
      updatedAt: Date.now(),
    };

    this.itemsManager.update(id, updatedTemplate);
    this.templates.set(id, updatedTemplate);

    return updatedTemplate;
  }

  // 删除模板
  deleteTemplate(id: string): boolean {
    const template = this.templates.get(id);
    if (!template || template.isSystem) return false;

    this.itemsManager.softDelete(id);
    this.templates.delete(id);
    return true;
  }

  // 应用模板生成笔记内容
  applyTemplate(templateId: string, variables: Record<string, string> = {}): { title: string; content: string } {
    const template = this.templates.get(templateId);
    if (!template) {
      return { title: '新建笔记', content: '' };
    }

    let content = template.content;

    // 替换内置变量
    const now = new Date();
    const builtinVars: Record<string, string> = {
      '{{TODAY}}': now.toLocaleDateString('zh-CN'),
      '{{NOW}}': now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      '{{DATETIME}}': now.toLocaleString('zh-CN'),
      '{{YEAR}}': now.getFullYear().toString(),
      '{{MONTH}}': (now.getMonth() + 1).toString().padStart(2, '0'),
      '{{DAY}}': now.getDate().toString().padStart(2, '0'),
    };

    for (const [key, value] of Object.entries(builtinVars)) {
      content = content.replace(new RegExp(key, 'g'), value);
    }

    // 替换用户变量
    for (const variable of template.variables) {
      const value = variables[variable.name] || variable.defaultValue || '';
      // 先替换默认值中的内置变量
      let finalValue = value;
      for (const [key, val] of Object.entries(builtinVars)) {
        finalValue = finalValue.replace(new RegExp(key, 'g'), val);
      }
      content = content.replace(new RegExp(`{{${variable.name}}}`, 'g'), finalValue);
    }

    // 生成标题
    let title = template.name;
    if (variables['title']) {
      title = variables['title'];
    } else if (template.name === '日记') {
      title = `${builtinVars['{{TODAY}}']} 日记`;
    }

    return { title, content };
  }

  // 从现有笔记创建模板
  createTemplateFromNote(noteContent: string, name: string, description: string): NoteTemplate {
    // 检测可能的变量
    const variablePattern = /\{\{(\w+)\}\}/g;
    const matches = [...noteContent.matchAll(variablePattern)];
    const variables: TemplateVariable[] = [];

    const seenVars = new Set<string>();
    for (const match of matches) {
      const varName = match[1];
      if (!seenVars.has(varName) && !['TODAY', 'NOW', 'DATETIME', 'YEAR', 'MONTH', 'DAY'].includes(varName)) {
        seenVars.add(varName);
        variables.push({
          name: varName,
          type: 'text',
          label: varName,
        });
      }
    }

    return this.createTemplate({
      name,
      description,
      icon: '📄',
      content: noteContent,
      variables,
    });
  }
}

export default TemplateManager;
