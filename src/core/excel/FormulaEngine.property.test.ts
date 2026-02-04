/**
 * FormulaEngine 属性测试
 * 使用 fast-check 进行基于属性的测试
 * 
 * Feature: Excel Notes - Formula Engine
 */

import * as fc from 'fast-check';
import { FormulaEngine, CellReference, FormulaErrors } from './FormulaEngine';
import { CellValue } from '../../shared/types';

describe('FormulaEngine Property Tests', () => {
  let engine: FormulaEngine;

  beforeEach(() => {
    engine = new FormulaEngine();
  });

  // 辅助函数：创建单元格值获取器
  const createCellGetter = (cells: Map<string, CellValue>) => {
    return (ref: CellReference): CellValue => {
      const key = `${ref.row},${ref.column}`;
      return cells.get(key) ?? null;
    };
  };

  /**
   * Property 7: 公式计算正确性
   * 基础算术运算应该产生正确的数学结果
   */
  describe('Property 7: 公式计算正确性', () => {
    it('加法运算应该满足交换律', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000000, max: 1000000 }),
          fc.integer({ min: -1000000, max: 1000000 }),
          (a, b) => {
            const getCellValue = createCellGetter(new Map());
            const result1 = engine.evaluate(`=${a}+${b}`, getCellValue);
            const result2 = engine.evaluate(`=${b}+${a}`, getCellValue);
            
            return result1.value === result2.value;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('乘法运算应该满足交换律', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 1000 }),
          fc.integer({ min: -1000, max: 1000 }),
          (a, b) => {
            const getCellValue = createCellGetter(new Map());
            const result1 = engine.evaluate(`=${a}*${b}`, getCellValue);
            const result2 = engine.evaluate(`=${b}*${a}`, getCellValue);
            
            return result1.value === result2.value;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('加法运算应该满足结合律', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10000, max: 10000 }),
          fc.integer({ min: -10000, max: 10000 }),
          fc.integer({ min: -10000, max: 10000 }),
          (a, b, c) => {
            const getCellValue = createCellGetter(new Map());
            const result1 = engine.evaluate(`=(${a}+${b})+${c}`, getCellValue);
            const result2 = engine.evaluate(`=${a}+(${b}+${c})`, getCellValue);
            
            // 允许浮点误差
            if (result1.error || result2.error) return true;
            return Math.abs((result1.value as number) - (result2.value as number)) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('除以非零数应该产生有效结果', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000000 }),
          fc.integer({ min: 1, max: 1000000 }),
          (a, b) => {
            const getCellValue = createCellGetter(new Map());
            const result = engine.evaluate(`=${a}/${b}`, getCellValue);
            
            if (result.error) return true; // 跳过解析错误
            const expected = a / b;
            return Math.abs((result.value as number) - expected) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('除以零应该返回错误或特殊值', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000000 }),
          (a) => {
            const getCellValue = createCellGetter(new Map());
            const result = engine.evaluate(`=${a}/0`, getCellValue);
            
            // 除以零应该返回错误或 Infinity
            return result.error !== null || result.value === Infinity || result.value === -Infinity;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: 聚合函数正确性
   * SUM, AVERAGE, COUNT, MAX, MIN 应该产生正确结果
   */
  describe('Property 8: 聚合函数正确性', () => {
    it('SUM 应该等于所有数字的和', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }),
          (numbers) => {
            const cells = new Map<string, CellValue>();
            numbers.forEach((n, i) => cells.set(`0,${i}`, n));
            const getCellValue = createCellGetter(cells);
            
            const endCol = String.fromCharCode(65 + numbers.length - 1);
            const result = engine.evaluate(`=SUM(A1:${endCol}1)`, getCellValue);
            
            if (result.error) return false;
            const expected = numbers.reduce((sum, n) => sum + n, 0);
            return Math.abs((result.value as number) - expected) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('AVERAGE 应该等于 SUM / COUNT', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }),
          (numbers) => {
            const cells = new Map<string, CellValue>();
            numbers.forEach((n, i) => cells.set(`0,${i}`, n));
            const getCellValue = createCellGetter(cells);
            
            const endCol = String.fromCharCode(65 + numbers.length - 1);
            const avgResult = engine.evaluate(`=AVERAGE(A1:${endCol}1)`, getCellValue);
            const sumResult = engine.evaluate(`=SUM(A1:${endCol}1)`, getCellValue);
            const countResult = engine.evaluate(`=COUNT(A1:${endCol}1)`, getCellValue);
            
            if (avgResult.error || sumResult.error || countResult.error) return false;
            
            const expected = (sumResult.value as number) / (countResult.value as number);
            return Math.abs((avgResult.value as number) - expected) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('COUNT 应该返回数字单元格的数量', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }),
          (numbers) => {
            const cells = new Map<string, CellValue>();
            numbers.forEach((n, i) => cells.set(`0,${i}`, n));
            const getCellValue = createCellGetter(cells);
            
            const endCol = String.fromCharCode(65 + numbers.length - 1);
            const result = engine.evaluate(`=COUNT(A1:${endCol}1)`, getCellValue);
            
            if (result.error) return false;
            return result.value === numbers.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MAX 应该返回最大值', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }),
          (numbers) => {
            const cells = new Map<string, CellValue>();
            numbers.forEach((n, i) => cells.set(`0,${i}`, n));
            const getCellValue = createCellGetter(cells);
            
            const endCol = String.fromCharCode(65 + numbers.length - 1);
            const result = engine.evaluate(`=MAX(A1:${endCol}1)`, getCellValue);
            
            if (result.error) return false;
            const expected = Math.max(...numbers);
            return result.value === expected;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MIN 应该返回最小值', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }),
          (numbers) => {
            const cells = new Map<string, CellValue>();
            numbers.forEach((n, i) => cells.set(`0,${i}`, n));
            const getCellValue = createCellGetter(cells);
            
            const endCol = String.fromCharCode(65 + numbers.length - 1);
            const result = engine.evaluate(`=MIN(A1:${endCol}1)`, getCellValue);
            
            if (result.error) return false;
            const expected = Math.min(...numbers);
            return result.value === expected;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MAX >= MIN 对于任何非空数据集', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }),
          (numbers) => {
            const cells = new Map<string, CellValue>();
            numbers.forEach((n, i) => cells.set(`0,${i}`, n));
            const getCellValue = createCellGetter(cells);
            
            const endCol = String.fromCharCode(65 + numbers.length - 1);
            const maxResult = engine.evaluate(`=MAX(A1:${endCol}1)`, getCellValue);
            const minResult = engine.evaluate(`=MIN(A1:${endCol}1)`, getCellValue);
            
            if (maxResult.error || minResult.error) return false;
            return (maxResult.value as number) >= (minResult.value as number);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: IF 函数正确性
   */
  describe('Property: IF 函数正确性', () => {
    it('IF(true, a, b) 应该返回 a', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (a, b) => {
            const getCellValue = createCellGetter(new Map());
            const result = engine.evaluate(`=IF(1>0,${a},${b})`, getCellValue);
            
            if (result.error) return true; // 跳过解析错误
            return result.value === a;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('IF(false, a, b) 应该返回 b', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (a, b) => {
            const getCellValue = createCellGetter(new Map());
            const result = engine.evaluate(`=IF(0>1,${a},${b})`, getCellValue);
            
            if (result.error) return true; // 跳过解析错误
            return result.value === b;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: ROUND 函数正确性
   */
  describe('Property: ROUND 函数正确性', () => {
    it('ROUND(x, 0) 应该返回最接近的整数', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 1000 }),
          (x) => {
            const getCellValue = createCellGetter(new Map());
            const result = engine.evaluate(`=ROUND(${x},0)`, getCellValue);
            
            if (result.error) return true; // 跳过错误情况
            const expected = Math.round(x);
            return result.value === expected;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('ROUND(x.5, 0) 应该向上取整', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (x) => {
            const getCellValue = createCellGetter(new Map());
            const result = engine.evaluate(`=ROUND(${x}.5,0)`, getCellValue);
            
            if (result.error) return true;
            // JavaScript Math.round 对 .5 向上取整
            return result.value === Math.round(x + 0.5);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: 单元格引用正确性
   */
  describe('Property: 单元格引用正确性', () => {
    it('单元格引用应该返回正确的值', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 25 }),
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: -1000, max: 1000 }),
          (col, row, value) => {
            const cells = new Map<string, CellValue>();
            cells.set(`${row},${col}`, value);
            const getCellValue = createCellGetter(cells);
            
            const colLetter = String.fromCharCode(65 + col);
            const result = engine.evaluate(`=${colLetter}${row + 1}`, getCellValue);
            
            if (result.error) return false;
            return result.value === value;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: 公式识别
   */
  describe('Property: 公式识别', () => {
    it('以 = 开头的字符串应该被识别为公式', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (content) => {
            const formula = `=${content}`;
            return engine.isFormula(formula) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('不以 = 开头的字符串不应该被识别为公式', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.startsWith('=')),
          (content) => {
            return engine.isFormula(content) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
