import { describe, it, expect } from 'vitest';
import { GetFunction } from '../../src/functions/GetFunction';

describe('GetFunction', () => {
  it('returns a present variable', () => {
    expect(new GetFunction({ name: 'Ada' }).call('name')).toBe('Ada');
  });

  it('walks nested variables', () => {
    expect(new GetFunction({ user: { name: 'Ada' } }).call('user.name')).toBe('Ada');
  });

  it('returns a missing-variable message for an absent key', () => {
    expect(new GetFunction({}).call('nope')).toBe('Missing variable: nope');
  });

  it('treats a blocked prototype key as missing', () => {
    expect(new GetFunction({ a: 1 }).call('__proto__')).toBe('Missing variable: __proto__');
  });

  it('returns a falsy value (0) rather than the fallback', () => {
    expect(new GetFunction({ count: 0 }).call('count')).toBe(0);
  });
});
