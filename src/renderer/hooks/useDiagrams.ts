import { useState, useEffect, useCallback } from 'react';
import { ItemBase, DiagramPayload, DiagramType } from '@shared/types';
import { itemsApi } from '../services/itemsApi';

export interface Diagram extends Omit<ItemBase, 'payload'> {
  payload: DiagramPayload;
}

// 解析 ItemBase 为 Diagram
function parseDiagram(item: ItemBase): Diagram {
  return {
    ...item,
    payload: JSON.parse(item.payload) as DiagramPayload,
  };
}

export function useDiagrams() {
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载所有图表
  const loadDiagrams = useCallback(async () => {
    try {
      const items = await itemsApi.getByType('diagram');
      setDiagrams(items.map(parseDiagram));
    } catch (error) {
      console.error('Failed to load diagrams:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagrams();
  }, [loadDiagrams]);

  // 创建图表
  const createDiagram = useCallback(async (
    name: string,
    diagramType: DiagramType,
    data: string = '{}'
  ): Promise<Diagram | null> => {
    try {
      const payload: DiagramPayload = {
        name,
        diagram_type: diagramType,
        data,
        thumbnail: null,
        folder_id: null,
      };
      const item = await itemsApi.create('diagram', payload);
      if (!item) {
        console.error('Failed to create diagram: API returned null');
        return null;
      }
      const diagram = parseDiagram(item);
      setDiagrams(prev => [diagram, ...prev]);
      return diagram;
    } catch (error) {
      console.error('Failed to create diagram:', error);
      return null;
    }
  }, []);

  // 更新图表
  const updateDiagram = useCallback(async (
    id: string,
    updates: Partial<DiagramPayload>
  ): Promise<boolean> => {
    try {
      const existing = diagrams.find(d => d.id === id);
      if (!existing) return false;

      const newPayload = { ...existing.payload, ...updates };
      const updated = await itemsApi.update(id, newPayload);
      if (updated) {
        setDiagrams(prev => prev.map(d => 
          d.id === id ? parseDiagram(updated) : d
        ));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to update diagram:', error);
      return false;
    }
  }, [diagrams]);

  // 删除图表（软删除）
  const deleteDiagram = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await itemsApi.delete(id);
      if (success) {
        setDiagrams(prev => prev.filter(d => d.id !== id));
      }
      return success;
    } catch (error) {
      console.error('Failed to delete diagram:', error);
      return false;
    }
  }, []);

  // 按类型筛选
  const getDiagramsByType = useCallback((type: DiagramType): Diagram[] => {
    return diagrams.filter(d => d.payload.diagram_type === type);
  }, [diagrams]);

  // 获取单个图表
  const getDiagramById = useCallback((id: string): Diagram | undefined => {
    return diagrams.find(d => d.id === id);
  }, [diagrams]);

  return {
    diagrams,
    loading,
    createDiagram,
    updateDiagram,
    deleteDiagram,
    getDiagramsByType,
    getDiagramById,
    refresh: loadDiagrams,
  };
}
