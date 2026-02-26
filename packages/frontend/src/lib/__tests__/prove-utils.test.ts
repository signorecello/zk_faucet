import { describe, test, expect } from 'vitest';
import {
  padRight,
  padLeft,
  bigintToMinimalBytes,
  bytesToInputArray,
  bytesToHex,
} from '../prove';

describe('padRight', () => {
  test('pads shorter data with zeros on the right', () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = padRight(data, 5);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 0, 0]));
    expect(result.length).toBe(5);
  });

  test('truncates data longer than target', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const result = padRight(data, 3);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('returns exact copy when lengths match', () => {
    const data = new Uint8Array([10, 20, 30]);
    const result = padRight(data, 3);
    expect(result).toEqual(new Uint8Array([10, 20, 30]));
  });

  test('returns all zeros for empty input', () => {
    const result = padRight(new Uint8Array([]), 4);
    expect(result).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  test('returns empty array for target length 0', () => {
    const result = padRight(new Uint8Array([1, 2]), 0);
    expect(result.length).toBe(0);
  });
});

describe('padLeft', () => {
  test('pads shorter data with zeros on the left', () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = padLeft(data, 5);
    expect(result).toEqual(new Uint8Array([0, 0, 1, 2, 3]));
  });

  test('truncates data longer than target', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const result = padLeft(data, 3);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('returns exact copy when lengths match', () => {
    const data = new Uint8Array([10, 20, 30]);
    const result = padLeft(data, 3);
    expect(result).toEqual(data);
  });

  test('returns all zeros for empty input', () => {
    const result = padLeft(new Uint8Array([]), 3);
    expect(result).toEqual(new Uint8Array([0, 0, 0]));
  });
});

describe('bigintToMinimalBytes', () => {
  test('returns empty array for 0n', () => {
    const result = bigintToMinimalBytes(0n);
    expect(result).toEqual(new Uint8Array([]));
  });

  test('encodes small value as single byte', () => {
    const result = bigintToMinimalBytes(255n);
    expect(result).toEqual(new Uint8Array([0xff]));
  });

  test('encodes 256 as two bytes', () => {
    const result = bigintToMinimalBytes(256n);
    expect(result).toEqual(new Uint8Array([0x01, 0x00]));
  });

  test('encodes large value correctly', () => {
    // 0x0100 = 256
    const result = bigintToMinimalBytes(0xdeadbeefn);
    expect(bytesToHex(result)).toBe('deadbeef');
  });

  test('handles odd-length hex (pads to even)', () => {
    // 0xf = 15, should be encoded as [0x0f]
    const result = bigintToMinimalBytes(15n);
    expect(result).toEqual(new Uint8Array([0x0f]));
  });
});

describe('bytesToInputArray', () => {
  test('converts bytes to decimal string array', () => {
    const bytes = new Uint8Array([0, 127, 255]);
    expect(bytesToInputArray(bytes)).toEqual(['0', '127', '255']);
  });

  test('handles empty array', () => {
    expect(bytesToInputArray(new Uint8Array([]))).toEqual([]);
  });

  test('handles single byte', () => {
    expect(bytesToInputArray(new Uint8Array([42]))).toEqual(['42']);
  });
});

describe('bytesToHex', () => {
  test('converts bytes to lowercase hex string', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(bytesToHex(bytes)).toBe('deadbeef');
  });

  test('pads single digits with leading zero', () => {
    const bytes = new Uint8Array([0x0a, 0x0b]);
    expect(bytesToHex(bytes)).toBe('0a0b');
  });

  test('handles empty array', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('');
  });

  test('handles all zeros', () => {
    expect(bytesToHex(new Uint8Array([0, 0, 0]))).toBe('000000');
  });
});
