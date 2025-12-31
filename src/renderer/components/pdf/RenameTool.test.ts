/**
 * @jest-environment jsdom
 * 
 * RenameTool 属性测试
 * Property 10: Filename Template Substitution
 * Validates: Requirements 9.4, 9.5, 9.6
 */

import fc from 'fast-check';
import { applyTemplate } from './RenameTool';

// 默认配置
const defaultConfig = {
  rule: 'template' as const,
  template: '{name}_{nn}',
  prefix: 'new_',
  suffix: '_copy',
  searchText: '',
  replaceText: '',
  startNumber: 1,
  padding: 2,
};

describe('RenameTool', () => {
  describe('applyTemplate', () => {
    /**
     * Feature: pdf-tools, Property 10: Filename Template Substitution
     * 
     * *For any* valid filename and template string, template substitution should:
     * 1. Replace all placeholders correctly
     * 2. Always produce a valid filename ending with .pdf
     * 3. Preserve the original filename when using {name} placeholder
     * 4. Generate correct sequence numbers
     * 
     * **Validates: Requirements 9.4, 9.5, 9.6**
     */
    describe('Property 10: Filename Template Substitution', () => {
      it('should always produce filename ending with .pdf', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),  // template
            fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),  // original name
            fc.integer({ min: 0, max: 100 }),  // index
            fc.integer({ min: 1, max: 100 }),  // startNumber
            (template, originalName, index, startNumber) => {
              const config = { ...defaultConfig, template, startNumber };
              const result = applyTemplate(template, `${originalName}.pdf`, index, config);
              
              return result.toLowerCase().endsWith('.pdf');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly replace {name} placeholder with original filename', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),  // original name
            fc.integer({ min: 0, max: 50 }),  // index
            (originalName, index) => {
              const template = '{name}';
              const config = { ...defaultConfig, template };
              const result = applyTemplate(template, `${originalName}.pdf`, index, config);
              
              // Result should be originalName.pdf
              return result === `${originalName}.pdf`;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly replace {n} placeholder with sequence number', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 100 }),  // index
            fc.integer({ min: 1, max: 100 }),  // startNumber
            (index, startNumber) => {
              const template = '{n}';
              const config = { ...defaultConfig, template, startNumber };
              const result = applyTemplate(template, 'test.pdf', index, config);
              
              const expectedNum = startNumber + index;
              return result === `${expectedNum}.pdf`;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly replace {nn} placeholder with zero-padded sequence number', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 100 }),  // index
            fc.integer({ min: 1, max: 99 }),  // startNumber (keep < 100 for 2-digit padding)
            (index, startNumber) => {
              const template = '{nn}';
              const config = { ...defaultConfig, template, startNumber };
              const result = applyTemplate(template, 'test.pdf', index, config);
              
              const expectedNum = startNumber + index;
              const paddedNum = String(expectedNum).padStart(2, '0');
              return result === `${paddedNum}.pdf`;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly replace {nnn} placeholder with 3-digit zero-padded number', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 100 }),  // index
            fc.integer({ min: 1, max: 999 }),  // startNumber
            (index, startNumber) => {
              const template = '{nnn}';
              const config = { ...defaultConfig, template, startNumber };
              const result = applyTemplate(template, 'test.pdf', index, config);
              
              const expectedNum = startNumber + index;
              const paddedNum = String(expectedNum).padStart(3, '0');
              return result === `${paddedNum}.pdf`;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle multiple placeholders in template', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),  // original name
            fc.integer({ min: 0, max: 50 }),  // index
            fc.integer({ min: 1, max: 50 }),  // startNumber
            (originalName, index, startNumber) => {
              const template = '{name}_{nn}';
              const config = { ...defaultConfig, template, startNumber };
              const result = applyTemplate(template, `${originalName}.pdf`, index, config);
              
              const expectedNum = startNumber + index;
              const paddedNum = String(expectedNum).padStart(2, '0');
              const expected = `${originalName}_${paddedNum}.pdf`;
              
              return result === expected;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should replace {date} with valid date format', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 10 }),  // index
            (index) => {
              const template = '{date}';
              const config = { ...defaultConfig, template };
              const result = applyTemplate(template, 'test.pdf', index, config);
              
              // Remove .pdf extension and check date format
              const dateStr = result.replace('.pdf', '');
              // Date format should be YYYY-MM-DD
              const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
              return dateRegex.test(dateStr);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should replace {time} with valid time format', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 10 }),  // index
            (index) => {
              const template = '{time}';
              const config = { ...defaultConfig, template };
              const result = applyTemplate(template, 'test.pdf', index, config);
              
              // Remove .pdf extension and check time format
              const timeStr = result.replace('.pdf', '');
              // Time format should be HH-mm-ss
              const timeRegex = /^\d{2}-\d{2}-\d{2}$/;
              return timeRegex.test(timeStr);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should replace {ext} with pdf', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 10 }),  // index
            (index) => {
              const template = 'file.{ext}';
              const config = { ...defaultConfig, template };
              const result = applyTemplate(template, 'test.pdf', index, config);
              
              // Should be file.pdf.pdf (because we always add .pdf if not present)
              // Actually, the template replaces {ext} with 'pdf', then adds .pdf if needed
              return result === 'file.pdf';
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle complex templates with all placeholders', () => {
        fc.assert(
          fc.property(
            // Use only alphanumeric names without underscores to avoid split issues
            fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
            fc.integer({ min: 0, max: 20 }),
            fc.integer({ min: 1, max: 20 }),
            (originalName, index, startNumber) => {
              const template = '{name}_{nnn}_{date}';
              const config = { ...defaultConfig, template, startNumber };
              const result = applyTemplate(template, `${originalName}.pdf`, index, config);
              
              // Verify the result contains expected parts
              const expectedNum = String(startNumber + index).padStart(3, '0');
              
              // Check that result starts with originalName_
              if (!result.startsWith(`${originalName}_`)) return false;
              
              // Check that result contains the sequence number
              if (!result.includes(`_${expectedNum}_`)) return false;
              
              // Check that result ends with date pattern and .pdf
              const dateRegex = /\d{4}-\d{2}-\d{2}\.pdf$/;
              if (!dateRegex.test(result)) return false;
              
              return true;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should not produce empty filename', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 0, maxLength: 50 }),  // template (can be empty)
            fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
            fc.integer({ min: 0, max: 50 }),
            (template, originalName, index) => {
              const config = { ...defaultConfig, template };
              const result = applyTemplate(template, `${originalName}.pdf`, index, config);
              
              // Result should never be empty (at minimum it should be .pdf)
              return result.length > 0;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('sequence numbers should be monotonically increasing', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),  // startNumber
            fc.integer({ min: 2, max: 20 }),  // count
            (startNumber, count) => {
              const template = '{n}';
              const config = { ...defaultConfig, template, startNumber };
              
              const results: number[] = [];
              for (let i = 0; i < count; i++) {
                const result = applyTemplate(template, 'test.pdf', i, config);
                const num = parseInt(result.replace('.pdf', ''), 10);
                results.push(num);
              }
              
              // Verify monotonically increasing
              for (let i = 1; i < results.length; i++) {
                if (results[i] <= results[i - 1]) return false;
              }
              
              // Verify correct sequence
              for (let i = 0; i < results.length; i++) {
                if (results[i] !== startNumber + i) return false;
              }
              
              return true;
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    // Unit tests
    describe('Unit tests', () => {
      it('should handle simple name template', () => {
        const result = applyTemplate('{name}', 'document.pdf', 0, defaultConfig);
        expect(result).toBe('document.pdf');
      });

      it('should handle name with sequence', () => {
        const result = applyTemplate('{name}_{nn}', 'report.pdf', 4, { ...defaultConfig, startNumber: 1 });
        expect(result).toBe('report_05.pdf');
      });

      it('should handle pure sequence template', () => {
        const result = applyTemplate('{nnn}', 'anything.pdf', 0, { ...defaultConfig, startNumber: 1 });
        expect(result).toBe('001.pdf');
      });

      it('should add .pdf extension if missing', () => {
        const result = applyTemplate('{name}', 'test.pdf', 0, defaultConfig);
        expect(result.endsWith('.pdf')).toBe(true);
      });

      it('should not double .pdf extension', () => {
        const result = applyTemplate('{name}.pdf', 'test.pdf', 0, defaultConfig);
        expect(result).toBe('test.pdf');
        expect(result.match(/\.pdf/g)?.length).toBe(1);
      });

      it('should handle template with literal text', () => {
        const result = applyTemplate('prefix_{name}_suffix', 'doc.pdf', 0, defaultConfig);
        expect(result).toBe('prefix_doc_suffix.pdf');
      });

      it('should handle startNumber offset', () => {
        const config = { ...defaultConfig, startNumber: 100 };
        const result = applyTemplate('{n}', 'test.pdf', 5, config);
        expect(result).toBe('105.pdf');
      });

      it('should handle date placeholder', () => {
        const result = applyTemplate('{date}', 'test.pdf', 0, defaultConfig);
        // Should match YYYY-MM-DD format
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}\.pdf$/);
      });

      it('should handle time placeholder', () => {
        const result = applyTemplate('{time}', 'test.pdf', 0, defaultConfig);
        // Should match HH-mm-ss format
        expect(result).toMatch(/^\d{2}-\d{2}-\d{2}\.pdf$/);
      });

      it('should handle ext placeholder', () => {
        const result = applyTemplate('file.{ext}', 'test.pdf', 0, defaultConfig);
        expect(result).toBe('file.pdf');
      });

      it('should handle empty template', () => {
        const result = applyTemplate('', 'test.pdf', 0, defaultConfig);
        expect(result).toBe('.pdf');
      });

      it('should handle template without placeholders', () => {
        const result = applyTemplate('fixed_name', 'test.pdf', 0, defaultConfig);
        expect(result).toBe('fixed_name.pdf');
      });
    });
  });
});
