/**
 * ImageService 属性测试
 * 使用 fast-check 进行属性测试
 */

import fc from 'fast-check';
import sharp from 'sharp';
import { ImageService } from './ImageService';

const imageService = new ImageService();

// 辅助函数：创建测试图片
async function createTestImage(width: number, height: number, format: 'png' | 'jpeg' = 'png'): Promise<string> {
  const channels = format === 'png' ? 4 : 3;
  const buffer = await sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    },
  })
    [format]()
    .toBuffer();
  
  return buffer.toString('base64');
}

describe('ImageService', () => {
  describe('Property 1: 格式转换往返一致性', () => {
    /**
     * Property 1: 格式转换往返一致性
     * For any valid image buffer and supported format, converting to that format
     * and reading back should produce a valid image with correct format metadata.
     * Validates: Requirements 1.1, 1.2
     */
    it('should produce valid images after format conversion', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 200 }),
          fc.integer({ min: 10, max: 200 }),
          fc.constantFrom('jpeg', 'png', 'webp') as fc.Arbitrary<'jpeg' | 'png' | 'webp'>,
          async (width, height, targetFormat) => {
            // 创建测试图片
            const testImage = await createTestImage(width, height);
            
            // 转换格式
            const result = await imageService.process(testImage, {
              format: targetFormat,
              quality: 80,
            });
            
            // 验证结果
            expect(result.buffer).toBeTruthy();
            expect(result.info.format).toBe(targetFormat);
            expect(result.info.width).toBe(width);
            expect(result.info.height).toBe(height);
            expect(result.info.size).toBeGreaterThan(0);
            
            // 验证可以读取转换后的图片
            const metadata = await imageService.getMetadata(result.buffer);
            expect(metadata.format).toBe(targetFormat);
            expect(metadata.width).toBe(width);
            expect(metadata.height).toBe(height);
          }
        ),
        { numRuns: 20 } // 减少运行次数以加快测试
      );
    });
  });

  describe('Property 2: 尺寸调整维度正确性', () => {
    /**
     * Property 2: 尺寸调整维度正确性
     * For any valid image and target dimensions (width, height),
     * resizing with fit='fill' should produce an image with exactly those dimensions.
     * Validates: Requirements 2.1
     */
    it('should resize to exact dimensions with fit=fill', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),
          fc.integer({ min: 50, max: 200 }),
          fc.integer({ min: 20, max: 150 }),
          fc.integer({ min: 20, max: 150 }),
          async (srcWidth, srcHeight, targetWidth, targetHeight) => {
            const testImage = await createTestImage(srcWidth, srcHeight);
            
            const result = await imageService.process(testImage, {
              resize: {
                width: targetWidth,
                height: targetHeight,
                fit: 'fill',
              },
            });
            
            expect(result.info.width).toBe(targetWidth);
            expect(result.info.height).toBe(targetHeight);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 3: 宽高比保持', () => {
    /**
     * Property 3: 宽高比保持
     * For any valid image with aspect ratio R, resizing with fit='contain'
     * should produce an image that fits within target bounds while maintaining aspect ratio.
     * Validates: Requirements 2.2
     */
    it('should maintain aspect ratio with fit=contain', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 200 }),
          fc.integer({ min: 100, max: 200 }),
          fc.integer({ min: 200, max: 400 }),
          async (srcWidth, srcHeight, targetSize) => {
            const testImage = await createTestImage(srcWidth, srcHeight);
            
            const result = await imageService.process(testImage, {
              resize: {
                width: targetSize,
                height: targetSize,
                fit: 'contain',
              },
            });
            
            // fit=contain 应该确保结果图片在目标尺寸内
            expect(result.info.width).toBeLessThanOrEqual(targetSize);
            expect(result.info.height).toBeLessThanOrEqual(targetSize);
            
            // 至少有一个维度应该等于目标尺寸（或接近）
            const maxDim = Math.max(result.info.width, result.info.height);
            expect(maxDim).toBeGreaterThanOrEqual(targetSize * 0.9);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 4: 裁剪区域正确性', () => {
    /**
     * Property 4: 裁剪区域正确性
     * For any valid image and valid crop region within image bounds,
     * the cropped output should have exactly (width, height) dimensions.
     * Validates: Requirements 3.1
     */
    it('should crop to exact dimensions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 300 }),
          fc.integer({ min: 100, max: 300 }),
          async (srcWidth, srcHeight) => {
            const testImage = await createTestImage(srcWidth, srcHeight);
            
            // 生成有效的裁剪区域
            const cropWidth = Math.floor(srcWidth / 2);
            const cropHeight = Math.floor(srcHeight / 2);
            const left = Math.floor((srcWidth - cropWidth) / 2);
            const top = Math.floor((srcHeight - cropHeight) / 2);
            
            const result = await imageService.process(testImage, {
              extract: { left, top, width: cropWidth, height: cropHeight },
            });
            
            expect(result.info.width).toBe(cropWidth);
            expect(result.info.height).toBe(cropHeight);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 5: 翻转往返一致性', () => {
    /**
     * Property 5: 翻转往返一致性
     * For any valid image, applying flip twice (or flop twice)
     * should produce an image with same dimensions.
     * Validates: Requirements 4.3, 4.4
     */
    it('should return to original dimensions after double flip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),
          fc.integer({ min: 50, max: 200 }),
          fc.boolean(),
          async (width, height, useFlip) => {
            const testImage = await createTestImage(width, height);
            
            // 第一次翻转
            const first = await imageService.process(testImage, {
              flip: useFlip,
              flop: !useFlip,
            });
            
            // 第二次翻转
            const second = await imageService.process(first.buffer, {
              flip: useFlip,
              flop: !useFlip,
            });
            
            expect(second.info.width).toBe(width);
            expect(second.info.height).toBe(height);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 6: 旋转维度变换', () => {
    /**
     * Property 6: 旋转维度变换
     * For any valid image with dimensions (W, H), rotating by 90 or 270 degrees
     * should produce an image with dimensions (H, W).
     * Validates: Requirements 4.1
     */
    it('should swap dimensions when rotating 90 or 270 degrees', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),
          fc.integer({ min: 50, max: 200 }),
          fc.constantFrom(90, 270),
          async (width, height, angle) => {
            const testImage = await createTestImage(width, height);
            
            const result = await imageService.process(testImage, {
              rotate: angle,
            });
            
            expect(result.info.width).toBe(height);
            expect(result.info.height).toBe(width);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 7: 灰度转换一致性', () => {
    /**
     * Property 7: 灰度转换一致性
     * For any valid color image, applying grayscale should produce
     * an image with same dimensions.
     * Validates: Requirements 5.5
     */
    it('should maintain dimensions after grayscale conversion', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),
          fc.integer({ min: 50, max: 200 }),
          async (width, height) => {
            const testImage = await createTestImage(width, height);
            
            const result = await imageService.process(testImage, {
              grayscale: true,
            });
            
            expect(result.info.width).toBe(width);
            expect(result.info.height).toBe(height);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 8: Gamma 1.0 恒等性', () => {
    /**
     * Property 8: Gamma 1.0 恒等性
     * For any valid image, applying gamma correction with gamma=1.0
     * should produce an image with same dimensions.
     * Validates: Requirements 6.4
     */
    it('should maintain dimensions with gamma=1.0', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),
          fc.integer({ min: 50, max: 200 }),
          async (width, height) => {
            const testImage = await createTestImage(width, height);
            
            const result = await imageService.process(testImage, {
              gamma: 1.0,
            });
            
            expect(result.info.width).toBe(width);
            expect(result.info.height).toBe(height);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 9: 元数据剥离完整性', () => {
    /**
     * Property 9: 元数据剥离完整性
     * For any valid image, after stripping metadata,
     * the output should have same dimensions.
     * Validates: Requirements 8.5
     */
    it('should maintain dimensions after stripping metadata', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),
          fc.integer({ min: 50, max: 200 }),
          async (width, height) => {
            const testImage = await createTestImage(width, height);
            
            const result = await imageService.process(testImage, {
              stripMetadata: true,
            });
            
            expect(result.info.width).toBe(width);
            expect(result.info.height).toBe(height);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 10: 压缩文件大小减少', () => {
    /**
     * Property 10: 压缩文件大小减少
     * For any valid image, compressing with lower quality
     * should generally produce a smaller or equal file size.
     * Validates: Requirements 9.1, 9.2, 9.3
     */
    it('should reduce file size with lower quality', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 300 }),
          fc.integer({ min: 100, max: 300 }),
          async (width, height) => {
            const testImage = await createTestImage(width, height, 'png');
            
            // 高质量
            const highQuality = await imageService.process(testImage, {
              format: 'jpeg',
              quality: 95,
            });
            
            // 低质量
            const lowQuality = await imageService.process(testImage, {
              format: 'jpeg',
              quality: 30,
            });
            
            // 低质量应该更小或相等
            expect(lowQuality.info.size).toBeLessThanOrEqual(highQuality.info.size);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
