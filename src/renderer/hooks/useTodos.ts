import { useState, useEffect, useCallback } from 'react';
import { ItemBase, TodoPayload, TodoQuadrant } from '@shared/types';
import { itemsApi } from '../services/itemsApi';

export interface Todo {
  id: string;
  title: string;
  description: string;
  quadrant: TodoQuadrant;
  completed: boolean;
  completedAt: number | null;
  dueDate: number | null;
  reminderTime: number | null;
  reminderEnabled: boolean;
  priority: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

function parsePayload<T>(item: ItemBase): T {
  return JSON.parse(item.payload) as T;
}

function itemToTodo(item: ItemBase): Todo {
  const payload = parsePayload<TodoPayload>(item);
  return {
    id: item.id,
    title: payload.title,
    description: payload.description,
    quadrant: payload.quadrant,
    completed: payload.completed,
    completedAt: payload.completed_at,
    dueDate: payload.due_date,
    reminderTime: payload.reminder_time ?? null,
    reminderEnabled: payload.reminder_enabled ?? false,
    priority: payload.priority,
    tags: payload.tags,
    createdAt: item.created_time,
    updatedAt: item.updated_time,
  };
}

// 待办事项 API
export const todosApi = {
  create: (payload: TodoPayload): Promise<ItemBase> =>
    itemsApi.create('todo', payload),

  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('todo'),

  getById: (id: string): Promise<ItemBase | undefined> =>
    itemsApi.getById(id),

  update: (id: string, payload: TodoPayload): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),

  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTodos = useCallback(async () => {
    try {
      setLoading(true);
      const items = await todosApi.getAll();
      if (items && Array.isArray(items)) {
        const list = items
          .filter(item => !item.deleted_time)
          .map(itemToTodo);
        // 按优先级排序
        list.sort((a, b) => a.priority - b.priority);
        setTodos(list);
      }
    } catch (err) {
      console.error('Failed to load todos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const createTodo = useCallback(async (
    title: string,
    quadrant: TodoQuadrant,
    description: string = '',
    dueDate: number | null = null,
    reminderTime: number | null = null
  ) => {
    // 获取该象限的最大优先级
    const quadrantTodos = todos.filter(t => t.quadrant === quadrant);
    const maxPriority = quadrantTodos.length > 0 
      ? Math.max(...quadrantTodos.map(t => t.priority)) 
      : 0;

    const payload: TodoPayload = {
      title,
      description,
      quadrant,
      completed: false,
      completed_at: null,
      due_date: dueDate,
      reminder_time: reminderTime,
      reminder_enabled: reminderTime !== null,
      priority: maxPriority + 1,
      tags: [],
    };
    const item = await todosApi.create(payload);
    if (item) {
      await loadTodos();
      return itemToTodo(item);
    }
    return null;
  }, [todos, loadTodos]);

  const updateTodo = useCallback(async (id: string, updates: Partial<TodoPayload>) => {
    // 先获取现有数据，然后合并更新
    const existingItem = await todosApi.getById(id);
    if (!existingItem) return null;

    const existingPayload = JSON.parse(existingItem.payload) as TodoPayload;
    const mergedPayload: TodoPayload = {
      ...existingPayload,
      ...updates,
    };

    const item = await todosApi.update(id, mergedPayload);
    if (item) {
      await loadTodos();
      return itemToTodo(item);
    }
    return null;
  }, [loadTodos]);

  const deleteTodo = useCallback(async (id: string) => {
    const success = await todosApi.delete(id);
    if (success) {
      await loadTodos();
    }
    return success;
  }, [loadTodos]);

  const toggleComplete = useCallback(async (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (todo) {
      await updateTodo(id, {
        completed: !todo.completed,
        completed_at: !todo.completed ? Date.now() : null,
      });
    }
  }, [todos, updateTodo]);

  const moveTodo = useCallback(async (id: string, targetQuadrant: TodoQuadrant, targetPriority: number) => {
    await updateTodo(id, {
      quadrant: targetQuadrant,
      priority: targetPriority,
    });
  }, [updateTodo]);

  // 按象限分组
  const todosByQuadrant = {
    'urgent-important': todos.filter(t => t.quadrant === 'urgent-important'),
    'not-urgent-important': todos.filter(t => t.quadrant === 'not-urgent-important'),
    'urgent-not-important': todos.filter(t => t.quadrant === 'urgent-not-important'),
    'not-urgent-not-important': todos.filter(t => t.quadrant === 'not-urgent-not-important'),
  };

  return {
    todos,
    todosByQuadrant,
    loading,
    createTodo,
    updateTodo,
    deleteTodo,
    toggleComplete,
    moveTodo,
    refresh: loadTodos,
  };
}
