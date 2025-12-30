import React, { useState, useCallback, useEffect } from 'react';
import { Input, Button, Checkbox, Empty, Modal, message, Tooltip, Dropdown, Tag, DatePicker, Switch, notification } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, 
  CheckOutlined, ClockCircleOutlined, MenuOutlined,
  FireOutlined, StarOutlined, CoffeeOutlined, BellOutlined,
} from '@ant-design/icons';
import { useTodos, Todo } from '../hooks/useTodos';
import { TodoQuadrant } from '@shared/types';
import dayjs from 'dayjs';

const { TextArea } = Input;

// 象限配置
const QUADRANT_CONFIG: Record<TodoQuadrant, { title: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  'urgent-important': {
    title: '紧急且重要',
    icon: <FireOutlined />,
    color: '#ff4d4f',
    bgColor: '#fff2f0',
  },
  'not-urgent-important': {
    title: '重要不紧急',
    icon: <StarOutlined />,
    color: '#faad14',
    bgColor: '#fffbe6',
  },
  'urgent-not-important': {
    title: '紧急不重要',
    icon: <ClockCircleOutlined />,
    color: '#1890ff',
    bgColor: '#e6f7ff',
  },
  'not-urgent-not-important': {
    title: '不紧急不重要',
    icon: <CoffeeOutlined />,
    color: '#52c41a',
    bgColor: '#f6ffed',
  },
};

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, todo: Todo) => void;
}

const TodoItem: React.FC<TodoItemProps> = ({ todo, onToggle, onEdit, onDelete, onDragStart }) => {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, todo)}
      className="todo-item"
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        marginBottom: 8,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        opacity: todo.completed ? 0.6 : 1,
      }}
    >
      <Checkbox
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
        style={{ marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          textDecoration: todo.completed ? 'line-through' : 'none',
          color: todo.completed ? '#999' : '#333',
          fontSize: 13,
          wordBreak: 'break-word',
        }}>
          {todo.title}
        </div>
        {todo.description && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {todo.description}
          </div>
        )}
        {todo.dueDate && (
          <div style={{ fontSize: 11, color: '#999', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {new Date(todo.dueDate).toLocaleString()}
            </span>
            {todo.reminderEnabled && todo.reminderTime && (
              <span style={{ color: '#1890ff' }}>
                <BellOutlined style={{ marginRight: 2 }} />
                {new Date(todo.reminderTime).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>
      <Dropdown
        menu={{
          items: [
            { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => onEdit(todo) },
            { type: 'divider' },
            { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => onDelete(todo.id) },
          ],
        }}
        trigger={['click']}
      >
        <Button type="text" size="small" icon={<MenuOutlined />} />
      </Dropdown>
    </div>
  );
};

interface QuadrantBoxProps {
  quadrant: TodoQuadrant;
  todos: Todo[];
  onToggle: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onAdd: (quadrant: TodoQuadrant) => void;
  onDragStart: (e: React.DragEvent, todo: Todo) => void;
  onDrop: (e: React.DragEvent, quadrant: TodoQuadrant) => void;
}

const QuadrantBox: React.FC<QuadrantBoxProps> = ({
  quadrant, todos, onToggle, onEdit, onDelete, onAdd, onDragStart, onDrop,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const config = QUADRANT_CONFIG[quadrant];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(e, quadrant);
  };

  const activeTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`quadrant-box quadrant-${quadrant}`}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 200,
        borderRadius: 8,
        border: `2px ${isDragOver ? 'dashed' : 'solid'} ${isDragOver ? config.color : 'var(--border-color, #f0f0f0)'}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s',
      }}
    >
      {/* 标题栏 */}
      <div className={`quadrant-header quadrant-header-${quadrant}`} style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-color, #f0f0f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '6px 6px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: config.color }}>{config.icon}</span>
          <span style={{ fontWeight: 500, fontSize: 13 }}>{config.title}</span>
          <Tag style={{ marginLeft: 4 }}>{activeTodos.length}</Tag>
        </div>
        <Tooltip title="添加待办">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAdd(quadrant)}
          />
        </Tooltip>
      </div>

      {/* 待办列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {activeTodos.length === 0 && completedTodos.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无待办"
            style={{ marginTop: 20 }}
          />
        ) : (
          <>
            {activeTodos.map(todo => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onDragStart={onDragStart}
              />
            ))}
            {completedTodos.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: '#999', margin: '12px 0 8px', paddingLeft: 4 }}>
                  已完成 ({completedTodos.length})
                </div>
                {completedTodos.map(todo => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onDragStart={onDragStart}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const TodoPanel: React.FC = () => {
  const { todos, todosByQuadrant, createTodo, updateTodo, deleteTodo, toggleComplete, moveTodo } = useTodos();
  
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addQuadrant, setAddQuadrant] = useState<TodoQuadrant>('urgent-important');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState<dayjs.Dayjs | null>(null);
  const [newReminderTime, setNewReminderTime] = useState<dayjs.Dayjs | null>(null);
  const [newReminderEnabled, setNewReminderEnabled] = useState(false);
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState<dayjs.Dayjs | null>(null);
  const [editReminderTime, setEditReminderTime] = useState<dayjs.Dayjs | null>(null);
  const [editReminderEnabled, setEditReminderEnabled] = useState(false);
  
  const [draggingTodo, setDraggingTodo] = useState<Todo | null>(null);

  // 检查提醒
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      todos.forEach(todo => {
        if (todo.reminderEnabled && todo.reminderTime && !todo.completed) {
          const diff = todo.reminderTime - now;
          // 提前1分钟内提醒
          if (diff > 0 && diff < 60000) {
            notification.info({
              message: '待办提醒',
              description: todo.title,
              icon: <BellOutlined style={{ color: '#1890ff' }} />,
              duration: 10,
            });
            // 关闭提醒避免重复
            updateTodo(todo.id, { reminder_enabled: false });
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 30000);
    checkReminders();
    return () => clearInterval(interval);
  }, [todos, updateTodo]);

  const handleAdd = (quadrant: TodoQuadrant) => {
    setAddQuadrant(quadrant);
    setNewTitle('');
    setNewDescription('');
    setNewDueDate(null);
    setNewReminderTime(null);
    setNewReminderEnabled(false);
    setAddModalOpen(true);
  };

  const handleCreateTodo = async () => {
    if (!newTitle.trim()) {
      message.warning('请输入待办标题');
      return;
    }
    await createTodo(
      newTitle.trim(), 
      addQuadrant, 
      newDescription.trim(),
      newDueDate?.valueOf() || null,
      newReminderEnabled && newReminderTime ? newReminderTime.valueOf() : null
    );
    setAddModalOpen(false);
    message.success('待办已创建');
  };

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setEditTitle(todo.title);
    setEditDescription(todo.description);
    setEditDueDate(todo.dueDate ? dayjs(todo.dueDate) : null);
    setEditReminderTime(todo.reminderTime ? dayjs(todo.reminderTime) : null);
    setEditReminderEnabled(todo.reminderEnabled);
    setEditModalOpen(true);
  };

  const handleUpdateTodo = async () => {
    if (!editingTodo || !editTitle.trim()) {
      message.warning('请输入待办标题');
      return;
    }
    await updateTodo(editingTodo.id, {
      title: editTitle.trim(),
      description: editDescription.trim(),
      due_date: editDueDate?.valueOf() || null,
      reminder_time: editReminderEnabled && editReminderTime ? editReminderTime.valueOf() : null,
      reminder_enabled: editReminderEnabled && editReminderTime !== null,
    });
    setEditModalOpen(false);
    setEditingTodo(null);
    message.success('待办已更新');
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '删除待办',
      content: '确定要删除这个待办吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await deleteTodo(id);
        message.success('待办已删除');
      },
    });
  };

  const handleDragStart = (e: React.DragEvent, todo: Todo) => {
    setDraggingTodo(todo);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetQuadrant: TodoQuadrant) => {
    if (!draggingTodo) return;
    
    if (draggingTodo.quadrant !== targetQuadrant) {
      // 获取目标象限的最大优先级
      const targetTodos = todosByQuadrant[targetQuadrant];
      const maxPriority = targetTodos.length > 0
        ? Math.max(...targetTodos.map(t => t.priority))
        : 0;
      
      await moveTodo(draggingTodo.id, targetQuadrant, maxPriority + 1);
      message.success('待办已移动');
    }
    setDraggingTodo(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }} className="todo-panel">
      {/* 标题栏 */}
      <div className="todo-header" style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-color, #f0f0f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckOutlined style={{ fontSize: 18, color: '#1890ff' }} />
          <span style={{ fontWeight: 500, fontSize: 15 }}>待办事项</span>
        </div>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => handleAdd('urgent-important')}
        >
          新建待办
        </Button>
      </div>

      {/* 四象限区域 */}
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 16, height: '100%', minHeight: 500 }}>
          <QuadrantBox
            quadrant="urgent-important"
            todos={todosByQuadrant['urgent-important']}
            onToggle={toggleComplete}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
          <QuadrantBox
            quadrant="not-urgent-important"
            todos={todosByQuadrant['not-urgent-important']}
            onToggle={toggleComplete}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
          <QuadrantBox
            quadrant="urgent-not-important"
            todos={todosByQuadrant['urgent-not-important']}
            onToggle={toggleComplete}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
          <QuadrantBox
            quadrant="not-urgent-not-important"
            todos={todosByQuadrant['not-urgent-not-important']}
            onToggle={toggleComplete}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        </div>
      </div>

      {/* 新建待办弹窗 */}
      <Modal
        title={`新建待办 - ${QUADRANT_CONFIG[addQuadrant].title}`}
        open={addModalOpen}
        onOk={handleCreateTodo}
        onCancel={() => setAddModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="待办标题"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <TextArea
            placeholder="描述（可选）"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>截止时间</label>
          <DatePicker
            showTime
            value={newDueDate}
            onChange={setNewDueDate}
            placeholder="选择截止时间"
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Switch
            checked={newReminderEnabled}
            onChange={setNewReminderEnabled}
            size="small"
          />
          <span style={{ fontSize: 13 }}>启用提醒</span>
          {newReminderEnabled && (
            <DatePicker
              showTime
              value={newReminderTime}
              onChange={setNewReminderTime}
              placeholder="提醒时间"
              style={{ flex: 1 }}
            />
          )}
        </div>
      </Modal>

      {/* 编辑待办弹窗 */}
      <Modal
        title="编辑待办"
        open={editModalOpen}
        onOk={handleUpdateTodo}
        onCancel={() => { setEditModalOpen(false); setEditingTodo(null); }}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="待办标题"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <TextArea
            placeholder="描述（可选）"
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>截止时间</label>
          <DatePicker
            showTime
            value={editDueDate}
            onChange={setEditDueDate}
            placeholder="选择截止时间"
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Switch
            checked={editReminderEnabled}
            onChange={setEditReminderEnabled}
            size="small"
          />
          <span style={{ fontSize: 13 }}>启用提醒</span>
          {editReminderEnabled && (
            <DatePicker
              showTime
              value={editReminderTime}
              onChange={setEditReminderTime}
              placeholder="提醒时间"
              style={{ flex: 1 }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default TodoPanel;
