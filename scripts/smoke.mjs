import { createPreprocessor } from '../dist/index.js';

const pre = createPreprocessor({
  echo: { call: (...args) => JSON.stringify(args) },
});
const out = pre('{{ echo({ x: 1 }) }}');

if (!out.includes('{"x":1}')) {
  console.error('FAIL (esm): object-expression parsing broken in built artifact:', out);
  process.exit(1);
}
console.log('smoke (esm) OK:', out);
