import { describe, expect, test } from 'vitest';
import { conversions, convertTo, formatConverted, neaterAmount, unitId } from './units';

const neat = (amount: string, unit: string) => {
  const c = neaterAmount(amount, unit);
  return c ? formatConverted(c) : null;
};
const all = (amount: string, unit: string) => conversions(amount, unit).map(formatConverted);

describe('unitId', () => {
  test.each([
    ['tsp', 'teaspoon'],
    ['T', 'tablespoon'],
    ['Tbsp', 'tablespoon'],
    ['tbsp.', 'tablespoon'],
    ['cups', 'cup'],
    ['lbs', 'pound'],
    ['fl oz', 'fluid ounce'],
    ['mL', 'milliliter'],
  ])('%s → %s', (unit, id) => expect(unitId(unit)).toBe(id));
  test.each(['can', 'clove', 'pinch', '', 'large'])('%s does not convert', (unit) => expect(unitId(unit)).toBeNull());
});

describe('neaterAmount (issue #6)', () => {
  test('moves up to a bigger unit when it reads cleanly', () => {
    expect(neat('12', 'tbsp')).toBe('¾ cup');
    expect(neat('16', 'tbsp')).toBe('1 cup');
    expect(neat('9', 'tsp')).toBe('3 tbsp');
    expect(neat('3', 'tsp')).toBe('1 tbsp');
    expect(neat('4', 'tbsp')).toBe('¼ cup');
    expect(neat('16', 'oz')).toBe('1 lb');
    expect(neat('24', 'oz')).toBe('1½ lb');
    expect(neat('1500', 'g')).toBe('1.5 kg');
    expect(neat('2000', 'ml')).toBe('2 l');
  });
  test('moves down when the amount is too small for its unit', () => {
    expect(neat('1/8', 'cup')).toBe('2 tbsp');
    expect(neat('1/2', 'lb')).toBe('8 oz');
    expect(neat('1/2', 'tbsp')).toBe('1½ tsp');
  });
  test('ranges convert at both ends', () => {
    expect(neat('8-12', 'tbsp')).toBe('½–¾ cup');
  });
  test('nothing when it is already the neatest', () => {
    for (const [a, u] of [['6', 'tbsp'], ['1/2', 'cup'], ['2', 'tbsp'], ['1 1/2', 'tsp'], ['12', 'oz'], ['500', 'g'], ['1/3', 'cup']])
      expect(neat(a, u)).toBeNull();
  });
  test('nothing for amounts and units that do not convert', () => {
    expect(neat('a pinch', 'tsp')).toBeNull();
    expect(neat('2', 'cans')).toBeNull();
    expect(neat('3', '')).toBeNull();
  });
});

describe('conversions', () => {
  test('volume', () => {
    expect(all('12', 'tbsp')).toEqual(['36 tsp', '¾ cup', '6 fl oz', '175 ml']);
    expect(all('1', 'cup')).toEqual(['48 tsp', '16 tbsp', '8 fl oz', '235 ml']);
  });
  test('weight', () => {
    expect(all('1', 'lb')).toEqual(['16 oz', '455 g']);
    expect(all('500', 'g')).toEqual(['17½ oz', '1⅛ lb']);
  });
  test('metric volume to cups', () => {
    expect(all('250', 'ml')).toEqual(['17 tbsp', 'about 1 cup', '8½ fl oz']);
  });
  test('small amounts', () => {
    expect(all('1 1/2', 'tsp')).toEqual(['½ tbsp', '7.4 ml']);
  });
  test('nothing that is more than 10% off', () => {
    expect(all('3', 'tbsp')).toEqual(['9 tsp', '1½ fl oz', '44 ml']);
  });
  test('ranges', () => {
    expect(all('1-2', 'cups')).toContain('8–16 fl oz');
  });
  test('nothing for amounts and units that do not convert', () => {
    expect(all('pinch', 'tsp')).toEqual([]);
    expect(all('2', 'cloves')).toEqual([]);
  });
});

describe('convertTo (a picked unit replaces the recipe\'s)', () => {
  test('converts, ranges too', () => {
    expect(formatConverted(convertTo('4', 'tbsp', 'cup')!)).toBe('¼ cup');
    expect(formatConverted(convertTo('8-12', 'tbsp', 'cup')!)).toBe('½–¾ cup');
    expect(convertTo('4', 'tbsp', 'cup')!.id).toBe('cup');
  });
  test('nothing for the same unit, the other kind, or an amount that is not a number', () => {
    expect(convertTo('4', 'tbsp', 'tablespoon')).toBeNull();
    expect(convertTo('4', 'tbsp', 'gram')).toBeNull();
    expect(convertTo('a pinch', 'tsp', 'tablespoon')).toBeNull();
    expect(convertTo('2', 'cans', 'cup')).toBeNull();
  });
});
