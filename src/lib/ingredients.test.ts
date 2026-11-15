import { describe, expect, test } from 'vitest';
import {
  amountValue,
  formatIngredient,
  formatNumber,
  headerText,
  isHeaderLine,
  isStepLabel,
  parseLine,
  pastedLines,
  readAmount,
  readNumber,
  scaleAmount,
  stepText,
  unitFor,
} from './ingredients';

describe('readNumber', () => {
  test.each([
    ['2', 2],
    ['1.5', 1.5],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['½', 0.5],
    ['1½', 1.5],
    ['1 ½', 1.5],
    ['1 / 2', 0.5],
    ['⅓', 1 / 3],
  ])('%s → %d', (text, n) => expect(readNumber(text)).toBeCloseTo(n));

  test.each(['', 'pinch', 'a', '1/0', '2 cups'])('%s is not a number', (text) => expect(readNumber(text)).toBeNull());
});

describe('readAmount', () => {
  test('ranges', () => {
    expect(readAmount('1-2')).toEqual({ low: 1, high: 2 });
    expect(readAmount('1 – 2')).toEqual({ low: 1, high: 2 });
    expect(readAmount('2 to 3')).toEqual({ low: 2, high: 3 });
    expect(readAmount('1 or 2')).toEqual({ low: 1, high: 2 });
    expect(readAmount('½-1')).toEqual({ low: 0.5, high: 1 });
  });
  test('words are not amounts', () => {
    expect(readAmount('a pinch')).toBeNull();
    expect(readAmount('to taste')).toBeNull();
    expect(readAmount('')).toBeNull();
    expect(readAmount('1-')).toBeNull();
  });
});

describe('formatNumber', () => {
  test.each([
    [2, '2'],
    [1.5, '1½'],
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [2 / 3, '⅔'],
    [0.125, '⅛'],
    [2.75, '2¾'],
    [1.999, '2'],
    [1.15, '1.15'],
    [0.1, '0.1'],
  ])('%d → %s', (n, text) => expect(formatNumber(n)).toBe(text));
});

describe('scaleAmount (R5)', () => {
  test('ranges scale at both ends', () => {
    expect(scaleAmount('1-2', 2)).toBe('2–4');
    expect(scaleAmount('1 to 2', 3)).toBe('3–6');
    expect(scaleAmount('2-4', 0.5)).toBe('1–2');
  });
  test('fractions and mixed numbers', () => {
    expect(scaleAmount('1 1/2', 2)).toBe('3');
    expect(scaleAmount('1/2', 3)).toBe('1½');
    expect(scaleAmount('½', 0.5)).toBe('¼');
    expect(scaleAmount('3/4', 2)).toBe('1½');
    expect(scaleAmount('1', 1 / 3)).toBe('⅓');
    expect(scaleAmount('2', 1.5)).toBe('3');
    expect(scaleAmount('1.5', 2)).toBe('3');
  });
  test('×1 keeps the amount exactly as typed', () => {
    expect(scaleAmount('1 1/2', 1)).toBe('1 1/2');
    expect(scaleAmount('1-2', 1)).toBe('1-2');
  });
  test('amounts that are not numbers are never scaled', () => {
    expect(scaleAmount('a pinch', 2)).toBe('a pinch');
    expect(scaleAmount('to taste', 3)).toBe('to taste');
    expect(scaleAmount('', 2)).toBe('');
    expect(scaleAmount('a few', 2)).toBe('a few');
  });
});

describe('amountValue', () => {
  test('first number of an amount', () => {
    expect(amountValue('1-2')).toBe(1);
    expect(amountValue('1 1/2')).toBe(1.5);
    expect(amountValue('pinch')).toBeNull();
    expect(amountValue('0')).toBeNull();
  });
});

describe('unitFor', () => {
  test('agrees with the amount', () => {
    expect(unitFor('cup', '3')).toBe('cups');
    expect(unitFor('cups', '½')).toBe('cup');
    expect(unitFor('cup', '1–2')).toBe('cups');
    expect(unitFor('Cloves', '1')).toBe('Clove');
    expect(unitFor('pinch', '2')).toBe('pinches');
  });
  test('abbreviations and unknown amounts stay as typed', () => {
    expect(unitFor('tsp', '3')).toBe('tsp');
    expect(unitFor('oz', '½')).toBe('oz');
    expect(unitFor('cups', 'a few')).toBe('cups');
    expect(unitFor('', '2')).toBe('');
  });
});

describe('parseLine', () => {
  test.each([
    ['1-2 tsp kosher salt, divided', { amount: '1-2', unit: 'tsp', name: 'kosher salt', note: 'divided' }],
    ['1 1/2 cups all-purpose flour', { amount: '1 1/2', unit: 'cups', name: 'all-purpose flour', note: '' }],
    ['½ cup sugar', { amount: '½', unit: 'cup', name: 'sugar', note: '' }],
    ['2 Tablespoons olive oil', { amount: '2', unit: 'Tablespoons', name: 'olive oil', note: '' }],
    ['3 large eggs, at room temperature', { amount: '3', unit: '', name: 'large eggs', note: 'at room temperature' }],
    ['2 cloves garlic, minced', { amount: '2', unit: 'cloves', name: 'garlic', note: 'minced' }],
    ['Salt and pepper, to taste', { amount: '', unit: '', name: 'Salt and pepper', note: 'to taste' }],
    ['1 onion', { amount: '1', unit: '', name: 'onion', note: '' }],
    ['2 to 3 lbs chicken thighs', { amount: '2 to 3', unit: 'lbs', name: 'chicken thighs', note: '' }],
    ['• 1 cup milk', { amount: '1', unit: 'cup', name: 'milk', note: '' }],
    ['1 tbsp. butter', { amount: '1', unit: 'tbsp', name: 'butter', note: '' }],
  ])('%s', (line, parts) => expect(parseLine(line)).toEqual(parts));

  test('words that start like units are not cut', () => {
    expect(parseLine('2 tomatoes').name).toBe('tomatoes');
    expect(parseLine('1 orange, zested')).toEqual({ amount: '1', unit: '', name: 'orange', note: 'zested' });
    expect(parseLine('4 cans chickpeas').unit).toBe('cans');
  });

  test('the parts read back as the line', () => {
    for (const line of ['1-2 tsp kosher salt, divided', '1 1/2 cups flour', '3 large eggs', '2 cloves garlic, minced'])
      expect(formatIngredient(parseLine(line))).toBe(line);
  });
});

describe('pasting (R6)', () => {
  test('blank lines are skipped', () => {
    expect(pastedLines('1 cup milk\n\n  \n2 eggs\r\n')).toEqual(['1 cup milk', '2 eggs']);
  });
  test.each(['For the sauce:', 'Topping:', 'For the dressing', 'FOR THE GLAZE', '## Sauce'])('%s is a header', (line) =>
    expect(isHeaderLine(line)).toBe(true),
  );
  test.each(['1 cup milk', 'Salt and pepper', 'Heat the oven to 350°F.', '2 eggs', 'OK.', ''])('%s is not a header', (line) =>
    expect(isHeaderLine(line)).toBe(false),
  );
  test('header text', () => {
    expect(headerText('For the sauce:')).toBe('For the sauce');
    expect(headerText('## Sauce')).toBe('Sauce');
  });
  test('step labels and numbers', () => {
    expect(isStepLabel('Step 1')).toBe(true);
    expect(isStepLabel('Step 1: Stir')).toBe(false);
    expect(stepText('1. Heat the oven')).toBe('Heat the oven');
    expect(stepText('Step 2: Stir')).toBe('Stir');
    expect(stepText('2) Stir')).toBe('Stir');
    expect(stepText('350°F oven')).toBe('350°F oven');
  });
});
