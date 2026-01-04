/**
 * Model API - AI 模型管理服务
 * 用于管理本地 AI 模型的下载、加载和状态
 */

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  size: number;
  url: string;
  type: 'onnx' | 'pytorch';
}

export interface ModelStatus {
  id: string;
  downloaded: boolean;
  loaded: boolean;
  progress?: number;
  error?: string;
}

// 获取可用模型列表
export async function getAvailableModels(): Promise<ModelConfig[]> {
  // TODO: 实现模型列表获取
  return [];
}

// 获取模型状态
export async function getModelStatuses(): Promise<ModelStatus[]> {
  // TODO: 实现模型状态获取
  return [];
}

// 下载模型
export async function downloadModel(modelId: string): Promise<boolean> {
  // TODO: 实现模型下载
  return false;
}

// 加载模型
export async function loadModel(modelId: string): Promise<boolean> {
  // TODO: 实现模型加载
  return false;
}

// 卸载模型
export async function unloadModel(modelId: string): Promise<boolean> {
  // TODO: 实现模型卸载
  return false;
}

// 删除模型
export async function deleteModel(modelId: string): Promise<boolean> {
  // TODO: 实现模型删除
  return false;
}
