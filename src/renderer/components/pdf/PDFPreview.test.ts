/**
 * @jest-environment node
 * 
 * PDFPreview 属性测试
 * Property 11: PDF Preview Navigation Bounds
 * Validates: Requirements 11.2, 11.3, 13.5
 */

import fc from 'fast-check';

// ============ 导航边界逻辑 ============

/**
 * 计算有效页码（确保在 [1, totalPages] 范围内）
 */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1;
  return Math.max(1, Math.min(page, totalPages));
}

/**
 * 计算有效缩放级别（确保在 [minZoom, maxZoom] 范围内）
 */
export function clampZoom(zoom: number, minZoom: number = 25, maxZoom: number = 400): number {
  return Math.max(minZoom, Math.min(zoom, maxZoom));
}

/**
 * 导航到下一页
 */
export function nextPage(currentPage: number, totalPages: number): number {
  return clampPage(currentPage + 1, totalPages);
}

/**
 * 导航到上一页
 */
export function prevPage(currentPage: number, totalPages: number): number {
  return clampPage(currentPage - 1, totalPages);
}

/**
 * 跳转到指定页
 */
export function goToPage(targetPage: number, totalPages: number): number {
  return clampPage(targetPage, totalPages);
}

/**
 * 放大
 */
export function zoomIn(currentZoom: number, step: number = 25): number {
  return clampZoom(currentZoom + step);
}

/**
 * 缩小
 */
export function zoomOut(currentZoom: number, step: number = 25): number {
  return clampZoom(currentZoom - step);
}

// ============ 属性测试 ============

describe('PDF Preview Navigation Bounds', () => {
  /**
   * Feature: pdf-tools, Property 11: PDF Preview Navigation Bounds
   * For any valid PDF with N pages, navigation should keep the current page within [1, N],
   * and zoom should keep the level within the allowed range.
   * Validates: Requirements 11.2, 11.3, 13.5
   */

  describe('Page Navigation', () => {
    it('clampPage should always return a value within [1, totalPages]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 1000 }),  // any page number
          fc.integer({ min: 1, max: 500 }),       // totalPages (at least 1)
          (page, totalPages) => {
            const result = clampPage(page, totalPages);
            return result >= 1 && result <= totalPages;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('nextPage should never exceed totalPages', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),  // currentPage
          fc.integer({ min: 1, max: 500 }),  // totalPages
          (currentPage, totalPages) => {
            const validCurrentPage = clampPage(currentPage, totalPages);
            const result = nextPage(validCurrentPage, totalPages);
            return result >= 1 && result <= totalPages;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('prevPage should never go below 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),  // currentPage
          fc.integer({ min: 1, max: 500 }),  // totalPages
          (currentPage, totalPages) => {
            const validCurrentPage = clampPage(currentPage, totalPages);
            const result = prevPage(validCurrentPage, totalPages);
            return result >= 1 && result <= totalPages;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('goToPage should clamp any target page to valid range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 1000 }),  // targetPage (can be out of range)
          fc.integer({ min: 1, max: 500 }),       // totalPages
          (targetPage, totalPages) => {
            const result = goToPage(targetPage, totalPages);
            return result >= 1 && result <= totalPages;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('navigation from page 1 with prevPage should stay at page 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),  // totalPages
          (totalPages) => {
            const result = prevPage(1, totalPages);
            return result === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('navigation from last page with nextPage should stay at last page', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),  // totalPages
          (totalPages) => {
            const result = nextPage(totalPages, totalPages);
            return result === totalPages;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Zoom Control', () => {
    const MIN_ZOOM = 25;
    const MAX_ZOOM = 400;

    it('clampZoom should always return a value within [minZoom, maxZoom]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 1000 }),  // any zoom value
          (zoom) => {
            const result = clampZoom(zoom);
            return result >= MIN_ZOOM && result <= MAX_ZOOM;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('zoomIn should never exceed maxZoom', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_ZOOM, max: MAX_ZOOM }),  // currentZoom
          fc.integer({ min: 1, max: 100 }),              // step
          (currentZoom, step) => {
            const result = zoomIn(currentZoom, step);
            return result >= MIN_ZOOM && result <= MAX_ZOOM;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('zoomOut should never go below minZoom', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_ZOOM, max: MAX_ZOOM }),  // currentZoom
          fc.integer({ min: 1, max: 100 }),              // step
          (currentZoom, step) => {
            const result = zoomOut(currentZoom, step);
            return result >= MIN_ZOOM && result <= MAX_ZOOM;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('zoomIn at maxZoom should stay at maxZoom', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),  // step
          (step) => {
            const result = zoomIn(MAX_ZOOM, step);
            return result === MAX_ZOOM;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('zoomOut at minZoom should stay at minZoom', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),  // step
          (step) => {
            const result = zoomOut(MIN_ZOOM, step);
            return result === MIN_ZOOM;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Combined Navigation and Zoom', () => {
    it('any sequence of navigation operations should keep page in valid range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),  // totalPages
          fc.array(
            fc.oneof(
              fc.constant('next'),
              fc.constant('prev'),
              fc.integer({ min: -10, max: 200 }).map(n => ({ type: 'goto', page: n }))
            ),
            { minLength: 1, maxLength: 20 }
          ),
          (totalPages, operations) => {
            let currentPage = 1;
            
            for (const op of operations) {
              if (op === 'next') {
                currentPage = nextPage(currentPage, totalPages);
              } else if (op === 'prev') {
                currentPage = prevPage(currentPage, totalPages);
              } else if (typeof op === 'object' && op.type === 'goto') {
                currentPage = goToPage(op.page, totalPages);
              }
              
              // Check invariant after each operation
              if (currentPage < 1 || currentPage > totalPages) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('any sequence of zoom operations should keep zoom in valid range', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('in'),
              fc.constant('out'),
              fc.integer({ min: -100, max: 1000 }).map(n => ({ type: 'set', zoom: n }))
            ),
            { minLength: 1, maxLength: 20 }
          ),
          (operations) => {
            let currentZoom = 100;
            const MIN_ZOOM = 25;
            const MAX_ZOOM = 400;
            
            for (const op of operations) {
              if (op === 'in') {
                currentZoom = zoomIn(currentZoom);
              } else if (op === 'out') {
                currentZoom = zoomOut(currentZoom);
              } else if (typeof op === 'object' && op.type === 'set') {
                currentZoom = clampZoom(op.zoom);
              }
              
              // Check invariant after each operation
              if (currentZoom < MIN_ZOOM || currentZoom > MAX_ZOOM) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
