// Issue #140: every child of a Framework7 Page that can come and go needs a key, and so does everything beside it.
//
// Framework7's Page leaves out children that aren't shown ({x && …}, a ternary with null) and lists the rest by
// position. React matches unkeyed children by position too, so when one comes or goes it rebuilds every unkeyed child
// after it. A popup or sheet rebuilt while open (Framework7 has moved it elsewhere in the page) can't be taken out,
// and the whole app goes blank. This reads every .tsx file in src and lists each Page child without a key that comes
// after one that can come and go. Pages whose children are always there are left alone.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

const tsxFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });

// the bars framework7-react's Page puts outside the page content
const FIXED_TAGS = new Set(['Navbar', 'Toolbar', 'Tabbar', 'Subnavbar', 'Searchbar', 'Messagebar', 'Fab', 'ListIndex', 'Panel']);

const tagName = (el) => {
  if (el.type === 'JSXFragment') return '<>';
  const n = el.openingElement.name;
  return n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${n.object.name}.${n.property.name}` : '?';
};
const hasKey = (el) => el.type === 'JSXElement' && el.openingElement.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'key');
const isElement = (n) => n?.type === 'JSXElement' || n?.type === 'JSXFragment';
const isNothing = (n) => !n || n.type === 'NullLiteral' || (n.type === 'Identifier' && n.name === 'undefined') || (n.type === 'BooleanLiteral' && !n.value);
const unwrap = (n) => (n?.type === 'ParenthesizedExpression' ? unwrap(n.expression) : n);

/**
 * One child of a Page, as Framework7 sees it: the elements it can be, and whether it can be left out (nothing shown).
 * A .map() is one array that's always there, its items keyed by React's own rule, so it's neither.
 */
function child(node) {
  node = unwrap(node);
  if (isElement(node)) return { elements: [node], dropped: false };
  if (node.type === 'LogicalExpression') {
    const right = child(node.right);
    return { elements: right.elements, dropped: true };
  }
  if (node.type === 'ConditionalExpression') {
    const [a, b] = [node.consequent, node.alternate].map((n) => (isNothing(unwrap(n)) ? { elements: [], dropped: true } : child(n)));
    return { elements: [...a.elements, ...b.elements], dropped: a.dropped || b.dropped };
  }
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'map') return { elements: [], dropped: false };
  // anything else (a variable, a call) might be nothing
  return { elements: [], dropped: true };
}

function unkeyedIn(file) {
  const code = readFileSync(file, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'JSXElement' && tagName(node) === 'Page') {
      const ownContent = !node.openingElement.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'pageContent' && a.value?.expression?.value === false);
      const kids = node.children
        .filter((c) => !(c.type === 'JSXText' || (c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression')))
        .map((c) => child(c.type === 'JSXExpressionContainer' ? c.expression : c));
      // Page sorts its children into lists, each by position (framework7-react's page.js): slot="fixed", slot="static",
      // and the rest, whose bars (Navbar, Toolbar…) go in a list of their own unless the Page has no page content
      const listOf = (k) => {
        const el = k.elements[0];
        const slot = el?.type === 'JSXElement' && el.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'slot')?.value?.value;
        if (slot) return slot;
        return ownContent && el && FIXED_TAGS.has(tagName(el)) ? 'bars' : 'default';
      };
      const droppedBefore = new Set();
      for (const k of kids) {
        const list = listOf(k);
        // only what comes after a child that can be left out moves
        if (droppedBefore.has(list)) {
          for (const el of k.elements) if (!hasKey(el)) found.push(`${relative(root, file)}:${el.loc.start.line} <${tagName(el)}> has no key`);
        }
        if (k.dropped) droppedBefore.add(list);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(ast.program);
  return found;
}

describe('Page children (#140)', () => {
  it('every child of a Page whose children come and go has a key', () => {
    const unkeyed = tsxFiles(join(root, 'src')).flatMap(unkeyedIn);
    expect(unkeyed, 'add a key to each (CLAUDE.md → Keys on a Page’s children)').toEqual([]);
  });

  it('finds an unkeyed popup after a block that comes and goes', () => {
    // the check itself, on the shape of #140's Groceries page
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const sample = join(dir, 'fixtures', 'page-keys-sample.tsx');
    expect(unkeyedIn(sample).map((s) => s.replace(/^.*:(\d+) /, '$1 '))).toEqual(['9 <ShopWeekPopup> has no key']);
  });
});
