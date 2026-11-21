export function assertNumber(name: string, value: unknown, isValid: (value: number) => boolean, requirement: string): asserts value is number {
  if (typeof value !== 'number') throw new TypeError(`[curfew] ${name} must be a number, got ${describe(value)}`);
  if (!isValid(value)) throw new RangeError(`[curfew] ${name} ${requirement}, got ${value}`);
}

export const isNotNaN = (value: number): boolean => !Number.isNaN(value);

export const isFiniteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
