/**
 * CropBox 属性测试
 * 使用 fast-check 进行属性测试
 * @jest-environment jsdom
 */

import * as fc from 'fast-check';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import CropBox, { CropBoxState } from './CropBox';

describe('CropBox Properties', () => {
  /**
   * Property 1: 裁剪框边界约束
   * 对于任意裁剪框状态变化，裁剪框应始终保持在图片边界内
   * **Validates: Requirements 1.2, 1.3**
   */
  it('Property 1: crop box stays within image bounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 2000 }), // 图片宽度
        fc.integer({ min: 100, max: 2000 }), // 图片高度
        fc.integer({ min: 0, max: 1000 }),   // 初始 left
        fc.integer({ min: 0, max: 1000 }),   // 初始 top
        fc.integer({ min: 10, max: 500 }),   // 初始 width
        fc.integer({ min: 10, max: 500 }),   // 初始 height
        (imageWidth, imageHeight, left, top, width, height) => {
          let capturedState: CropBoxState | null = null;
          
          const handleChange = (state: CropBoxState) => {
            capturedState = state;
          };

          const initialState: CropBoxState = {
            left: Math.min(left, imageWidth - 10),
            top: Math.min(top, imageHeight - 10),
            width: Math.min(width, imageWidth),
            height: Math.min(height, imageHeight),
          };

          const { container, unmount } = render(
            <CropBox
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              cropState={initialState}
              onChange={handleChange}
              containerWidth={400}
              containerHeight={300}
            />
          );

          // 模拟拖拽裁剪框
          const cropBox = container.querySelector('[style*="cursor: move"]');
          if (cropBox) {
            fireEvent.mouseDown(cropBox, { clientX: 100, clientY: 100 });
            fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
            fireEvent.mouseUp(window);
          }

          // 验证边界约束
          if (capturedState !== null) {
            const state = capturedState as CropBoxState;
            // 裁剪框不应超出图片边界
            expect(state.left).toBeGreaterThanOrEqual(0);
            expect(state.top).toBeGreaterThanOrEqual(0);
            expect(state.left + state.width).toBeLessThanOrEqual(imageWidth);
            expect(state.top + state.height).toBeLessThanOrEqual(imageHeight);
            // 尺寸应大于最小值
            expect(state.width).toBeGreaterThanOrEqual(10);
            expect(state.height).toBeGreaterThanOrEqual(10);
          }

          unmount();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: 裁剪框状态同步
   * 对于任意输入状态，组件应正确反映该状态
   * **Validates: Requirements 1.4, 1.6**
   */
  it('Property 2: crop box state synchronization', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 1000 }), // 图片宽度
        fc.integer({ min: 200, max: 1000 }), // 图片高度
        fc.integer({ min: 0, max: 100 }),    // left
        fc.integer({ min: 0, max: 100 }),    // top
        fc.integer({ min: 50, max: 150 }),   // width
        fc.integer({ min: 50, max: 150 }),   // height
        (imageWidth, imageHeight, left, top, width, height) => {
          const cropState: CropBoxState = {
            left: Math.min(left, imageWidth - width),
            top: Math.min(top, imageHeight - height),
            width: Math.min(width, imageWidth - left),
            height: Math.min(height, imageHeight - top),
          };

          const { container, unmount } = render(
            <CropBox
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              cropState={cropState}
              onChange={() => {}}
              containerWidth={400}
              containerHeight={300}
            />
          );

          // 查找尺寸标签
          const sizeLabel = container.querySelector('[style*="bottom: -24px"]');
          if (sizeLabel) {
            const labelText = sizeLabel.textContent || '';
            // 验证尺寸标签显示正确的尺寸
            expect(labelText).toContain(String(Math.round(cropState.width)));
            expect(labelText).toContain(String(Math.round(cropState.height)));
          }

          unmount();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('CropBox Unit Tests', () => {
  it('should render with initial state', () => {
    const cropState: CropBoxState = {
      left: 10,
      top: 10,
      width: 100,
      height: 100,
    };

    const { container } = render(
      <CropBox
        imageWidth={500}
        imageHeight={400}
        cropState={cropState}
        onChange={() => {}}
      />
    );

    // 应该渲染裁剪框
    const cropBox = container.querySelector('[style*="cursor: move"]');
    expect(cropBox).toBeTruthy();
  });

  it('should display size label', () => {
    const cropState: CropBoxState = {
      left: 0,
      top: 0,
      width: 200,
      height: 150,
    };

    const { container } = render(
      <CropBox
        imageWidth={500}
        imageHeight={400}
        cropState={cropState}
        onChange={() => {}}
      />
    );

    // 查找尺寸标签
    const sizeLabel = container.querySelector('[style*="bottom: -24px"]');
    expect(sizeLabel?.textContent).toContain('200');
    expect(sizeLabel?.textContent).toContain('150');
  });

  it('should call onChange when dragging', () => {
    const handleChange = jest.fn();
    const cropState: CropBoxState = {
      left: 50,
      top: 50,
      width: 100,
      height: 100,
    };

    const { container } = render(
      <CropBox
        imageWidth={500}
        imageHeight={400}
        cropState={cropState}
        onChange={handleChange}
      />
    );

    const cropBox = container.querySelector('[style*="cursor: move"]');
    if (cropBox) {
      fireEvent.mouseDown(cropBox, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(window);
    }

    expect(handleChange).toHaveBeenCalled();
  });

  it('should not allow dragging when disabled', () => {
    const handleChange = jest.fn();
    const cropState: CropBoxState = {
      left: 50,
      top: 50,
      width: 100,
      height: 100,
    };

    const { container } = render(
      <CropBox
        imageWidth={500}
        imageHeight={400}
        cropState={cropState}
        onChange={handleChange}
        disabled={true}
      />
    );

    const cropBox = container.querySelector('[style*="cursor: default"]');
    if (cropBox) {
      fireEvent.mouseDown(cropBox, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(window);
    }

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('should constrain crop box to image bounds', () => {
    let capturedState: CropBoxState | null = null;
    const handleChange = (state: CropBoxState) => {
      capturedState = state;
    };

    const cropState: CropBoxState = {
      left: 400,
      top: 300,
      width: 100,
      height: 100,
    };

    const { container } = render(
      <CropBox
        imageWidth={500}
        imageHeight={400}
        cropState={cropState}
        onChange={handleChange}
      />
    );

    const cropBox = container.querySelector('[style*="cursor: move"]');
    if (cropBox) {
      // 尝试拖拽到边界外
      fireEvent.mouseDown(cropBox, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });
      fireEvent.mouseUp(window);
    }

    if (capturedState !== null) {
      const state = capturedState as CropBoxState;
      // 验证边界约束
      expect(state.left + state.width).toBeLessThanOrEqual(500);
      expect(state.top + state.height).toBeLessThanOrEqual(400);
    }
  });

  it('should render resize handles', () => {
    const cropState: CropBoxState = {
      left: 50,
      top: 50,
      width: 100,
      height: 100,
    };

    const { container } = render(
      <CropBox
        imageWidth={500}
        imageHeight={400}
        cropState={cropState}
        onChange={() => {}}
      />
    );

    // 检查角落手柄
    const nwHandle = container.querySelector('[style*="cursor: nw-resize"]');
    const neHandle = container.querySelector('[style*="cursor: ne-resize"]');
    const swHandle = container.querySelector('[style*="cursor: sw-resize"]');
    const seHandle = container.querySelector('[style*="cursor: se-resize"]');

    expect(nwHandle).toBeTruthy();
    expect(neHandle).toBeTruthy();
    expect(swHandle).toBeTruthy();
    expect(seHandle).toBeTruthy();
  });

  it('should not render resize handles when disabled', () => {
    const cropState: CropBoxState = {
      left: 50,
      top: 50,
      width: 100,
      height: 100,
    };

    const { container } = render(
      <CropBox
        imageWidth={500}
        imageHeight={400}
        cropState={cropState}
        onChange={() => {}}
        disabled={true}
      />
    );

    // 禁用时不应该有调整大小的手柄
    const nwHandle = container.querySelector('[style*="cursor: nw-resize"]');
    expect(nwHandle).toBeFalsy();
  });
});
