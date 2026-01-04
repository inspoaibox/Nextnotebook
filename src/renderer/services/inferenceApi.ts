/**
 * Inference API - AI 推理服务
 * 用于执行 AI 模型推理任务
 */

export interface RemoveBackgroundResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

// 去除图片背景
export async function removeBackground(
  imagePath: string,
  modelId: string
): Promise<RemoveBackgroundResult> {
  // TODO: 实现去背景推理
  return {
    success: false,
    error: '功能尚未实现',
  };
}
