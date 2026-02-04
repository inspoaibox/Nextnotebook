/**
 * Excel 公式引擎
 * 支持基础算术运算、单元格引用和常用函数
 */

import { CellValue } from '../../shared/types';

// 公式计算结果
export interface FormulaResult {
  value: CellValue;
  error: string | null;
}

// 单元格引用
export interface CellReference {
  sheet_id?: string;
  row: number;
  column: number;
  absolute_row: boolean;
  absolute_column: boolean;
}

// 范围引用
export interface RangeReference {
  start: CellReference;
  end: CellReference;
}

// 解析后的公式
export interface ParsedFormula {
  type: 'value' | 'reference' | 'range' | 'function' | 'operation' | 'error';
  value?: CellValue;
  reference?: CellReference;
  range?: RangeReference;
  functionName?: string;
  args?: ParsedFormula[];
  operator?: string;
  left?: ParsedFormula;
  right?: ParsedFormula;
  error?: string;
}

// 公式错误类型
export const FormulaErrors = {
  SYNTAX: '#SYNTAX!',
  REF: '#REF!',
  DIV_ZERO: '#DIV/0!',
  VALUE: '#VALUE!',
  CIRCULAR: '#CIRCULAR!',
  NAME: '#NAME?',
} as const;

// 支持的函数
export type FormulaFunction = 'SUM' | 'AVERAGE' | 'COUNT' | 'MAX' | 'MIN' | 'IF' | 'ROUND';

// 列字母转数字 (A=0, B=1, ..., Z=25, AA=26, ...)
export function columnLetterToIndex(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result - 1;
}

// 数字转列字母
export function indexToColumnLetter(index: number): string {
  let result = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// 解析单元格引用 (如 A1, $A$1, B2)
export function parseCellReference(ref: string): CellReference | null {
  const match = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i);
  if (!match) return null;
  
  const [, absCol, col, absRow, row] = match;
  return {
    column: columnLetterToIndex(col.toUpperCase()),
    row: parseInt(row, 10) - 1,
    absolute_column: absCol === '$',
    absolute_row: absRow === '$',
  };
}

// 格式化单元格引用为字符串
export function formatCellReference(ref: CellReference): string {
  const col = ref.absolute_column ? '$' : '';
  const row = ref.absolute_row ? '$' : '';
  return `${col}${indexToColumnLetter(ref.column)}${row}${ref.row + 1}`;
}


/**
 * 公式引擎类
 */
export class FormulaEngine {
  private cache: Map<string, FormulaResult> = new Map();
  private evaluating: Set<string> = new Set(); // 用于检测循环引用

  /**
   * 判断输入是否为公式
   */
  isFormula(input: string): boolean {
    return typeof input === 'string' && input.startsWith('=');
  }

  /**
   * 解析公式字符串
   */
  parse(formula: string): ParsedFormula {
    if (!this.isFormula(formula)) {
      return { type: 'value', value: formula };
    }

    const expr = formula.substring(1).trim();
    try {
      return this.parseExpression(expr);
    } catch (e) {
      return { type: 'error', error: FormulaErrors.SYNTAX };
    }
  }

  /**
   * 解析表达式
   */
  private parseExpression(expr: string): ParsedFormula {
    expr = expr.trim();
    
    // 处理括号
    if (expr.startsWith('(') && this.findMatchingParen(expr, 0) === expr.length - 1) {
      return this.parseExpression(expr.slice(1, -1));
    }

    // 查找最低优先级的运算符
    const opIndex = this.findLowestPriorityOperator(expr);
    if (opIndex !== -1) {
      const op = expr[opIndex];
      const left = expr.substring(0, opIndex).trim();
      const right = expr.substring(opIndex + 1).trim();
      return {
        type: 'operation',
        operator: op,
        left: this.parseExpression(left),
        right: this.parseExpression(right),
      };
    }

    // 检查是否为函数调用
    const funcMatch = expr.match(/^([A-Z]+)\s*\((.*)\)$/i);
    if (funcMatch) {
      const [, funcName, argsStr] = funcMatch;
      const args = this.parseArguments(argsStr);
      return {
        type: 'function',
        functionName: funcName.toUpperCase(),
        args,
      };
    }

    // 检查是否为范围引用 (A1:B10)
    const rangeMatch = expr.match(/^([A-Z$]+\d+):([A-Z$]+\d+)$/i);
    if (rangeMatch) {
      const start = parseCellReference(rangeMatch[1]);
      const end = parseCellReference(rangeMatch[2]);
      if (start && end) {
        return { type: 'range', range: { start, end } };
      }
    }

    // 检查是否为单元格引用
    const cellRef = parseCellReference(expr);
    if (cellRef) {
      return { type: 'reference', reference: cellRef };
    }

    // 尝试解析为数字
    const num = parseFloat(expr);
    if (!isNaN(num)) {
      return { type: 'value', value: num };
    }

    // 字符串值（带引号）
    if ((expr.startsWith('"') && expr.endsWith('"')) || 
        (expr.startsWith("'") && expr.endsWith("'"))) {
      return { type: 'value', value: expr.slice(1, -1) };
    }

    // 布尔值
    if (expr.toUpperCase() === 'TRUE') {
      return { type: 'value', value: true };
    }
    if (expr.toUpperCase() === 'FALSE') {
      return { type: 'value', value: false };
    }

    return { type: 'error', error: FormulaErrors.SYNTAX };
  }

  /**
   * 查找匹配的括号
   */
  private findMatchingParen(expr: string, start: number): number {
    let depth = 0;
    for (let i = start; i < expr.length; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  /**
   * 查找最低优先级的运算符（从左到右结合）
   */
  private findLowestPriorityOperator(expr: string): number {
    let depth = 0;
    let lowestPriority = Infinity;
    let lowestIndex = -1;
    // 比较运算符优先级最低 (0)，然后是加减 (1)，然后是乘除 (2)
    const priorities: Record<string, number> = { 
      '>': 0, '<': 0, '=': 0,  // 比较运算符
      '+': 1, '-': 1,          // 加减
      '*': 2, '/': 2           // 乘除
    };

    // 从右向左扫描，找到最右边的最低优先级运算符（实现左结合）
    for (let i = expr.length - 1; i >= 0; i--) {
      const char = expr[i];
      if (char === ')') depth++;
      else if (char === '(') depth--;
      else if (depth === 0 && priorities[char] !== undefined) {
        // 检查是否是多字符比较运算符 (>=, <=, <>)
        if ((char === '>' || char === '<') && i + 1 < expr.length && expr[i + 1] === '=') {
          continue; // 跳过，让下一个字符处理
        }
        if (char === '=' && i > 0 && (expr[i - 1] === '>' || expr[i - 1] === '<' || expr[i - 1] === '!')) {
          continue; // 这是 >=, <=, != 的一部分
        }
        // 使用 < 而不是 <= 来确保找到最右边的运算符
        if (priorities[char] < lowestPriority) {
          lowestPriority = priorities[char];
          lowestIndex = i;
        }
      }
    }
    return lowestIndex;
  }

  /**
   * 解析函数参数
   */
  private parseArguments(argsStr: string): ParsedFormula[] {
    const args: ParsedFormula[] = [];
    let depth = 0;
    let current = '';

    for (const char of argsStr) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      
      if (char === ',' && depth === 0) {
        if (current.trim()) {
          args.push(this.parseExpression(current.trim()));
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(this.parseExpression(current.trim()));
    }

    return args;
  }


  /**
   * 计算公式结果
   */
  evaluate(
    formula: string,
    getCellValue: (ref: CellReference) => CellValue,
    cacheKey?: string
  ): FormulaResult {
    // 检查缓存
    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 检测循环引用
    if (cacheKey && this.evaluating.has(cacheKey)) {
      return { value: null, error: FormulaErrors.CIRCULAR };
    }

    if (cacheKey) {
      this.evaluating.add(cacheKey);
    }

    try {
      const parsed = this.parse(formula);
      const result = this.evaluateParsed(parsed, getCellValue);

      // 缓存结果
      if (cacheKey) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } finally {
      if (cacheKey) {
        this.evaluating.delete(cacheKey);
      }
    }
  }

  /**
   * 计算解析后的公式
   */
  private evaluateParsed(
    parsed: ParsedFormula,
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    switch (parsed.type) {
      case 'value':
        return { value: parsed.value ?? null, error: null };

      case 'error':
        return { value: null, error: parsed.error ?? FormulaErrors.SYNTAX };

      case 'reference':
        if (!parsed.reference) {
          return { value: null, error: FormulaErrors.REF };
        }
        try {
          const value = getCellValue(parsed.reference);
          return { value, error: null };
        } catch {
          return { value: null, error: FormulaErrors.REF };
        }

      case 'range':
        // 范围本身不能直接求值，需要在函数中处理
        return { value: null, error: FormulaErrors.VALUE };

      case 'operation':
        return this.evaluateOperation(parsed, getCellValue);

      case 'function':
        return this.evaluateFunction(parsed, getCellValue);

      default:
        return { value: null, error: FormulaErrors.SYNTAX };
    }
  }

  /**
   * 计算运算表达式
   */
  private evaluateOperation(
    parsed: ParsedFormula,
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    if (!parsed.left || !parsed.right || !parsed.operator) {
      return { value: null, error: FormulaErrors.SYNTAX };
    }

    const leftResult = this.evaluateParsed(parsed.left, getCellValue);
    if (leftResult.error) return leftResult;

    const rightResult = this.evaluateParsed(parsed.right, getCellValue);
    if (rightResult.error) return rightResult;

    // 比较运算符可以处理任意类型
    if (['>', '<', '='].includes(parsed.operator)) {
      const left = leftResult.value;
      const right = rightResult.value;
      
      switch (parsed.operator) {
        case '>':
          return { value: this.compareValues(left, right) > 0, error: null };
        case '<':
          return { value: this.compareValues(left, right) < 0, error: null };
        case '=':
          return { value: left === right, error: null };
        default:
          return { value: null, error: FormulaErrors.SYNTAX };
      }
    }

    // 算术运算符需要数字
    const left = this.toNumber(leftResult.value);
    const right = this.toNumber(rightResult.value);

    if (left === null || right === null) {
      return { value: null, error: FormulaErrors.VALUE };
    }

    switch (parsed.operator) {
      case '+':
        return { value: left + right, error: null };
      case '-':
        return { value: left - right, error: null };
      case '*':
        return { value: left * right, error: null };
      case '/':
        if (right === 0) {
          return { value: null, error: FormulaErrors.DIV_ZERO };
        }
        return { value: left / right, error: null };
      default:
        return { value: null, error: FormulaErrors.SYNTAX };
    }
  }

  /**
   * 比较两个值
   */
  private compareValues(left: CellValue, right: CellValue): number {
    const leftNum = this.toNumber(left);
    const rightNum = this.toNumber(right);
    
    if (leftNum !== null && rightNum !== null) {
      return leftNum - rightNum;
    }
    
    // 字符串比较
    const leftStr = String(left ?? '');
    const rightStr = String(right ?? '');
    return leftStr.localeCompare(rightStr);
  }

  /**
   * 计算函数
   */
  private evaluateFunction(
    parsed: ParsedFormula,
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    const funcName = parsed.functionName?.toUpperCase() as FormulaFunction;
    const args = parsed.args || [];

    switch (funcName) {
      case 'SUM':
        return this.evalSum(args, getCellValue);
      case 'AVERAGE':
        return this.evalAverage(args, getCellValue);
      case 'COUNT':
        return this.evalCount(args, getCellValue);
      case 'MAX':
        return this.evalMax(args, getCellValue);
      case 'MIN':
        return this.evalMin(args, getCellValue);
      case 'IF':
        return this.evalIf(args, getCellValue);
      case 'ROUND':
        return this.evalRound(args, getCellValue);
      default:
        return { value: null, error: FormulaErrors.NAME };
    }
  }

  /**
   * 获取范围内的所有值
   */
  private getRangeValues(
    range: RangeReference,
    getCellValue: (ref: CellReference) => CellValue
  ): CellValue[] {
    const values: CellValue[] = [];
    const { start, end } = range;
    
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.column, end.column);
    const maxCol = Math.max(start.column, end.column);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const value = getCellValue({
          row,
          column: col,
          absolute_row: false,
          absolute_column: false,
        });
        values.push(value);
      }
    }

    return values;
  }

  /**
   * 展开参数（处理范围引用）
   */
  private expandArgs(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): CellValue[] {
    const values: CellValue[] = [];

    for (const arg of args) {
      if (arg.type === 'range' && arg.range) {
        values.push(...this.getRangeValues(arg.range, getCellValue));
      } else {
        const result = this.evaluateParsed(arg, getCellValue);
        if (!result.error) {
          values.push(result.value);
        }
      }
    }

    return values;
  }

  /**
   * 转换为数字
   */
  private toNumber(value: CellValue): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }
    return null;
  }


  // ==================== 函数实现 ====================

  /**
   * SUM - 求和
   */
  private evalSum(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    const values = this.expandArgs(args, getCellValue);
    let sum = 0;

    for (const v of values) {
      const num = this.toNumber(v);
      if (num !== null) {
        sum += num;
      }
    }

    return { value: sum, error: null };
  }

  /**
   * AVERAGE - 平均值
   */
  private evalAverage(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    const values = this.expandArgs(args, getCellValue);
    let sum = 0;
    let count = 0;

    for (const v of values) {
      const num = this.toNumber(v);
      if (num !== null) {
        sum += num;
        count++;
      }
    }

    if (count === 0) {
      return { value: null, error: FormulaErrors.DIV_ZERO };
    }

    return { value: sum / count, error: null };
  }

  /**
   * COUNT - 计数非空单元格
   */
  private evalCount(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    const values = this.expandArgs(args, getCellValue);
    let count = 0;

    for (const v of values) {
      if (v !== null && v !== '') {
        count++;
      }
    }

    return { value: count, error: null };
  }

  /**
   * MAX - 最大值
   */
  private evalMax(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    const values = this.expandArgs(args, getCellValue);
    let max: number | null = null;

    for (const v of values) {
      const num = this.toNumber(v);
      if (num !== null) {
        if (max === null || num > max) {
          max = num;
        }
      }
    }

    return { value: max ?? 0, error: null };
  }

  /**
   * MIN - 最小值
   */
  private evalMin(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    const values = this.expandArgs(args, getCellValue);
    let min: number | null = null;

    for (const v of values) {
      const num = this.toNumber(v);
      if (num !== null) {
        if (min === null || num < min) {
          min = num;
        }
      }
    }

    return { value: min ?? 0, error: null };
  }

  /**
   * IF - 条件判断
   * IF(condition, value_if_true, value_if_false)
   */
  private evalIf(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    if (args.length < 2 || args.length > 3) {
      return { value: null, error: FormulaErrors.SYNTAX };
    }

    const conditionResult = this.evaluateParsed(args[0], getCellValue);
    if (conditionResult.error) return conditionResult;

    const condition = this.toBoolean(conditionResult.value);

    if (condition) {
      return this.evaluateParsed(args[1], getCellValue);
    } else if (args.length === 3) {
      return this.evaluateParsed(args[2], getCellValue);
    } else {
      return { value: false, error: null };
    }
  }

  /**
   * ROUND - 四舍五入
   * ROUND(number, decimals)
   */
  private evalRound(
    args: ParsedFormula[],
    getCellValue: (ref: CellReference) => CellValue
  ): FormulaResult {
    if (args.length !== 2) {
      return { value: null, error: FormulaErrors.SYNTAX };
    }

    const numResult = this.evaluateParsed(args[0], getCellValue);
    if (numResult.error) return numResult;

    const decimalsResult = this.evaluateParsed(args[1], getCellValue);
    if (decimalsResult.error) return decimalsResult;

    const num = this.toNumber(numResult.value);
    const decimals = this.toNumber(decimalsResult.value);

    if (num === null || decimals === null) {
      return { value: null, error: FormulaErrors.VALUE };
    }

    const factor = Math.pow(10, Math.floor(decimals));
    return { value: Math.round(num * factor) / factor, error: null };
  }

  /**
   * 转换为布尔值
   */
  private toBoolean(value: CellValue): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    return false;
  }

  // ==================== 依赖追踪 ====================

  /**
   * 获取公式依赖的单元格
   */
  getDependencies(formula: string): CellReference[] {
    const deps: CellReference[] = [];
    const parsed = this.parse(formula);
    this.collectDependencies(parsed, deps);
    return deps;
  }

  /**
   * 递归收集依赖
   */
  private collectDependencies(parsed: ParsedFormula, deps: CellReference[]): void {
    switch (parsed.type) {
      case 'reference':
        if (parsed.reference) {
          deps.push(parsed.reference);
        }
        break;
      case 'range':
        if (parsed.range) {
          // 展开范围为所有单元格引用
          const { start, end } = parsed.range;
          const minRow = Math.min(start.row, end.row);
          const maxRow = Math.max(start.row, end.row);
          const minCol = Math.min(start.column, end.column);
          const maxCol = Math.max(start.column, end.column);

          for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
              deps.push({
                row,
                column: col,
                absolute_row: false,
                absolute_column: false,
              });
            }
          }
        }
        break;
      case 'operation':
        if (parsed.left) this.collectDependencies(parsed.left, deps);
        if (parsed.right) this.collectDependencies(parsed.right, deps);
        break;
      case 'function':
        if (parsed.args) {
          for (const arg of parsed.args) {
            this.collectDependencies(arg, deps);
          }
        }
        break;
    }
  }

  /**
   * 检查循环引用
   */
  checkCircularReference(
    cellRef: CellReference,
    formula: string,
    getCellFormula: (ref: CellReference) => string | null
  ): boolean {
    const visited = new Set<string>();
    const cellKey = `${cellRef.row},${cellRef.column}`;
    
    const check = (ref: CellReference): boolean => {
      const key = `${ref.row},${ref.column}`;
      if (key === cellKey) return true;
      if (visited.has(key)) return false;
      visited.add(key);

      const refFormula = getCellFormula(ref);
      if (!refFormula || !this.isFormula(refFormula)) return false;

      const deps = this.getDependencies(refFormula);
      return deps.some(dep => check(dep));
    };

    const deps = this.getDependencies(formula);
    return deps.some(dep => check(dep));
  }

  /**
   * 清除缓存
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 使依赖于指定单元格的缓存失效
   */
  invalidateDependents(
    cellRef: CellReference,
    getAllFormulas: () => Array<{ key: string; formula: string }>
  ): void {
    const cellKey = `${cellRef.row},${cellRef.column}`;
    const formulas = getAllFormulas();

    for (const { key, formula } of formulas) {
      const deps = this.getDependencies(formula);
      const isDependentOn = deps.some(
        dep => `${dep.row},${dep.column}` === cellKey
      );
      if (isDependentOn) {
        this.cache.delete(key);
      }
    }
  }
}

// 导出单例
export const formulaEngine = new FormulaEngine();
