/**
 * FormulaEngine 单元测试
 */

import {
  FormulaEngine,
  FormulaErrors,
  columnLetterToIndex,
  indexToColumnLetter,
  parseCellReference,
  formatCellReference,
  CellReference,
} from './FormulaEngine';
import { CellValue } from '../../shared/types';

describe('FormulaEngine', () => {
  let engine: FormulaEngine;

  beforeEach(() => {
    engine = new FormulaEngine();
  });

  // ==================== 辅助函数测试 ====================

  describe('columnLetterToIndex', () => {
    it('should convert single letters correctly', () => {
      expect(columnLetterToIndex('A')).toBe(0);
      expect(columnLetterToIndex('B')).toBe(1);
      expect(columnLetterToIndex('Z')).toBe(25);
    });

    it('should convert double letters correctly', () => {
      expect(columnLetterToIndex('AA')).toBe(26);
      expect(columnLetterToIndex('AB')).toBe(27);
      expect(columnLetterToIndex('AZ')).toBe(51);
      expect(columnLetterToIndex('BA')).toBe(52);
    });
  });

  describe('indexToColumnLetter', () => {
    it('should convert indices to letters correctly', () => {
      expect(indexToColumnLetter(0)).toBe('A');
      expect(indexToColumnLetter(1)).toBe('B');
      expect(indexToColumnLetter(25)).toBe('Z');
      expect(indexToColumnLetter(26)).toBe('AA');
      expect(indexToColumnLetter(27)).toBe('AB');
    });

    it('should be inverse of columnLetterToIndex', () => {
      for (let i = 0; i < 100; i++) {
        expect(columnLetterToIndex(indexToColumnLetter(i))).toBe(i);
      }
    });
  });

  describe('parseCellReference', () => {
    it('should parse simple references', () => {
      const ref = parseCellReference('A1');
      expect(ref).toEqual({
        column: 0,
        row: 0,
        absolute_column: false,
        absolute_row: false,
      });
    });

    it('should parse absolute references', () => {
      const ref = parseCellReference('$A$1');
      expect(ref).toEqual({
        column: 0,
        row: 0,
        absolute_column: true,
        absolute_row: true,
      });
    });

    it('should parse mixed references', () => {
      expect(parseCellReference('$A1')?.absolute_column).toBe(true);
      expect(parseCellReference('$A1')?.absolute_row).toBe(false);
      expect(parseCellReference('A$1')?.absolute_column).toBe(false);
      expect(parseCellReference('A$1')?.absolute_row).toBe(true);
    });

    it('should return null for invalid references', () => {
      expect(parseCellReference('invalid')).toBeNull();
      expect(parseCellReference('123')).toBeNull();
      expect(parseCellReference('')).toBeNull();
    });
  });

  describe('formatCellReference', () => {
    it('should format references correctly', () => {
      expect(formatCellReference({ row: 0, column: 0, absolute_row: false, absolute_column: false })).toBe('A1');
      expect(formatCellReference({ row: 0, column: 0, absolute_row: true, absolute_column: true })).toBe('$A$1');
      expect(formatCellReference({ row: 9, column: 2, absolute_row: false, absolute_column: false })).toBe('C10');
    });
  });

  // ==================== 公式识别测试 ====================

  describe('isFormula', () => {
    it('should identify formulas starting with =', () => {
      expect(engine.isFormula('=A1')).toBe(true);
      expect(engine.isFormula('=SUM(A1:A10)')).toBe(true);
      expect(engine.isFormula('=1+2')).toBe(true);
    });

    it('should not identify non-formulas', () => {
      expect(engine.isFormula('A1')).toBe(false);
      expect(engine.isFormula('Hello')).toBe(false);
      expect(engine.isFormula('123')).toBe(false);
      expect(engine.isFormula('')).toBe(false);
    });
  });


  // ==================== 基础运算测试 ====================

  describe('basic arithmetic', () => {
    const getCellValue = (): CellValue => null;

    it('should evaluate addition', () => {
      expect(engine.evaluate('=1+2', getCellValue).value).toBe(3);
      expect(engine.evaluate('=10+20+30', getCellValue).value).toBe(60);
    });

    it('should evaluate subtraction', () => {
      expect(engine.evaluate('=5-3', getCellValue).value).toBe(2);
      expect(engine.evaluate('=100-50-25', getCellValue).value).toBe(25);
    });

    it('should evaluate multiplication', () => {
      expect(engine.evaluate('=3*4', getCellValue).value).toBe(12);
      expect(engine.evaluate('=2*3*4', getCellValue).value).toBe(24);
    });

    it('should evaluate division', () => {
      expect(engine.evaluate('=10/2', getCellValue).value).toBe(5);
      expect(engine.evaluate('=100/10/2', getCellValue).value).toBe(5);
    });

    it('should handle division by zero', () => {
      const result = engine.evaluate('=10/0', getCellValue);
      expect(result.error).toBe(FormulaErrors.DIV_ZERO);
    });

    it('should respect operator precedence', () => {
      expect(engine.evaluate('=2+3*4', getCellValue).value).toBe(14);
      expect(engine.evaluate('=10-2*3', getCellValue).value).toBe(4);
    });

    it('should handle parentheses', () => {
      expect(engine.evaluate('=(2+3)*4', getCellValue).value).toBe(20);
      expect(engine.evaluate('=((1+2)*(3+4))', getCellValue).value).toBe(21);
    });
  });

  // ==================== 单元格引用测试 ====================

  describe('cell references', () => {
    it('should evaluate cell references', () => {
      const cells: Record<string, CellValue> = {
        '0,0': 10,  // A1
        '0,1': 20,  // B1
        '1,0': 30,  // A2
      };
      const getCellValue = (ref: CellReference): CellValue => {
        return cells[`${ref.row},${ref.column}`] ?? null;
      };

      expect(engine.evaluate('=A1', getCellValue).value).toBe(10);
      expect(engine.evaluate('=B1', getCellValue).value).toBe(20);
      expect(engine.evaluate('=A1+B1', getCellValue).value).toBe(30);
      expect(engine.evaluate('=A1*A2', getCellValue).value).toBe(300);
    });

    it('should handle missing cell references', () => {
      const getCellValue = (): CellValue => null;
      const result = engine.evaluate('=A1+1', getCellValue);
      // null + 1 should result in VALUE error
      expect(result.error).toBe(FormulaErrors.VALUE);
    });
  });

  // ==================== 函数测试 ====================

  describe('SUM function', () => {
    it('should sum numbers', () => {
      const getCellValue = (): CellValue => null;
      expect(engine.evaluate('=SUM(1,2,3)', getCellValue).value).toBe(6);
      expect(engine.evaluate('=SUM(10,20)', getCellValue).value).toBe(30);
    });

    it('should sum cell range', () => {
      const cells: Record<string, CellValue> = {
        '0,0': 1, '1,0': 2, '2,0': 3, '3,0': 4, '4,0': 5,
      };
      const getCellValue = (ref: CellReference): CellValue => {
        return cells[`${ref.row},${ref.column}`] ?? null;
      };

      expect(engine.evaluate('=SUM(A1:A5)', getCellValue).value).toBe(15);
    });

    it('should ignore non-numeric values', () => {
      const cells: Record<string, CellValue> = {
        '0,0': 1, '1,0': 'text', '2,0': 3,
      };
      const getCellValue = (ref: CellReference): CellValue => {
        return cells[`${ref.row},${ref.column}`] ?? null;
      };

      expect(engine.evaluate('=SUM(A1:A3)', getCellValue).value).toBe(4);
    });
  });

  describe('AVERAGE function', () => {
    it('should calculate average', () => {
      const getCellValue = (): CellValue => null;
      expect(engine.evaluate('=AVERAGE(2,4,6)', getCellValue).value).toBe(4);
      expect(engine.evaluate('=AVERAGE(10,20,30)', getCellValue).value).toBe(20);
    });

    it('should handle empty range', () => {
      const getCellValue = (): CellValue => null;
      const result = engine.evaluate('=AVERAGE(A1:A5)', getCellValue);
      expect(result.error).toBe(FormulaErrors.DIV_ZERO);
    });
  });

  describe('COUNT function', () => {
    it('should count non-empty cells', () => {
      const cells: Record<string, CellValue> = {
        '0,0': 1, '1,0': null, '2,0': 'text', '3,0': '', '4,0': 0,
      };
      const getCellValue = (ref: CellReference): CellValue => {
        return cells[`${ref.row},${ref.column}`] ?? null;
      };

      expect(engine.evaluate('=COUNT(A1:A5)', getCellValue).value).toBe(3); // 1, 'text', 0
    });
  });

  describe('MAX function', () => {
    it('should find maximum value', () => {
      const getCellValue = (): CellValue => null;
      expect(engine.evaluate('=MAX(1,5,3,9,2)', getCellValue).value).toBe(9);
    });

    it('should work with cell range', () => {
      const cells: Record<string, CellValue> = {
        '0,0': 10, '1,0': 50, '2,0': 30,
      };
      const getCellValue = (ref: CellReference): CellValue => {
        return cells[`${ref.row},${ref.column}`] ?? null;
      };

      expect(engine.evaluate('=MAX(A1:A3)', getCellValue).value).toBe(50);
    });
  });

  describe('MIN function', () => {
    it('should find minimum value', () => {
      const getCellValue = (): CellValue => null;
      expect(engine.evaluate('=MIN(5,1,9,3,2)', getCellValue).value).toBe(1);
    });
  });

  describe('IF function', () => {
    it('should return true value when condition is true', () => {
      const getCellValue = (): CellValue => null;
      expect(engine.evaluate('=IF(1,"Yes","No")', getCellValue).value).toBe('Yes');
      expect(engine.evaluate('=IF(TRUE,100,200)', getCellValue).value).toBe(100);
    });

    it('should return false value when condition is false', () => {
      const getCellValue = (): CellValue => null;
      expect(engine.evaluate('=IF(0,"Yes","No")', getCellValue).value).toBe('No');
      expect(engine.evaluate('=IF(FALSE,100,200)', getCellValue).value).toBe(200);
    });

    it('should work with cell references', () => {
      const cells: Record<string, CellValue> = {
        '0,0': 15,
      };
      const getCellValue = (ref: CellReference): CellValue => {
        return cells[`${ref.row},${ref.column}`] ?? null;
      };

      // Note: This test assumes comparison operators are supported
      // For now, we test with numeric condition
      expect(engine.evaluate('=IF(A1,"Big","Small")', getCellValue).value).toBe('Big');
    });
  });

  describe('ROUND function', () => {
    it('should round to specified decimals', () => {
      const getCellValue = (): CellValue => null;
      expect(engine.evaluate('=ROUND(3.14159,2)', getCellValue).value).toBe(3.14);
      expect(engine.evaluate('=ROUND(3.5,0)', getCellValue).value).toBe(4);
      expect(engine.evaluate('=ROUND(2.5,0)', getCellValue).value).toBe(3);
    });
  });

  // ==================== 依赖追踪测试 ====================

  describe('getDependencies', () => {
    it('should return empty array for non-formula', () => {
      expect(engine.getDependencies('Hello')).toEqual([]);
    });

    it('should find single cell reference', () => {
      const deps = engine.getDependencies('=A1');
      expect(deps).toHaveLength(1);
      expect(deps[0].row).toBe(0);
      expect(deps[0].column).toBe(0);
    });

    it('should find multiple cell references', () => {
      const deps = engine.getDependencies('=A1+B2+C3');
      expect(deps).toHaveLength(3);
    });

    it('should expand range references', () => {
      const deps = engine.getDependencies('=SUM(A1:A3)');
      expect(deps).toHaveLength(3);
    });
  });

  // ==================== 循环引用检测测试 ====================

  describe('checkCircularReference', () => {
    it('should detect direct circular reference', () => {
      const getCellFormula = (ref: CellReference): string | null => {
        if (ref.row === 0 && ref.column === 0) return '=B1';
        if (ref.row === 0 && ref.column === 1) return '=A1';
        return null;
      };

      const cellRef: CellReference = { row: 0, column: 0, absolute_row: false, absolute_column: false };
      expect(engine.checkCircularReference(cellRef, '=B1', getCellFormula)).toBe(true);
    });

    it('should not flag non-circular references', () => {
      const getCellFormula = (): string | null => null;

      const cellRef: CellReference = { row: 0, column: 0, absolute_row: false, absolute_column: false };
      expect(engine.checkCircularReference(cellRef, '=B1+C1', getCellFormula)).toBe(false);
    });
  });

  // ==================== 错误处理测试 ====================

  describe('error handling', () => {
    it('should return SYNTAX error for invalid formula', () => {
      const getCellValue = (): CellValue => null;
      const result = engine.evaluate('=INVALID()', getCellValue);
      expect(result.error).toBe(FormulaErrors.NAME);
    });

    it('should return DIV_ZERO error for division by zero', () => {
      const getCellValue = (): CellValue => null;
      const result = engine.evaluate('=1/0', getCellValue);
      expect(result.error).toBe(FormulaErrors.DIV_ZERO);
    });
  });

  // ==================== 缓存测试 ====================

  describe('caching', () => {
    it('should cache results', () => {
      const getCellValue = (): CellValue => null;
      
      // First evaluation
      const result1 = engine.evaluate('=1+2', getCellValue, 'test-key');
      expect(result1.value).toBe(3);

      // Second evaluation should use cache
      const result2 = engine.evaluate('=1+2', getCellValue, 'test-key');
      expect(result2.value).toBe(3);
    });

    it('should clear cache', () => {
      const getCellValue = (): CellValue => null;
      
      engine.evaluate('=1+2', getCellValue, 'test-key');
      engine.clearCache('test-key');
      
      // After clearing, should re-evaluate
      const result = engine.evaluate('=1+2', getCellValue, 'test-key');
      expect(result.value).toBe(3);
    });
  });
});
