import { describe, expect, it } from 'vitest'
import { getIterator } from '../../src/utils/GetIterator'

describe('getIterator', () => {
  it('returns a sync iterator for an array', () => {
    const iterator = getIterator([1, 2]) as Iterator<number>
    expect(iterator.next()).toEqual({ value: 1, done: false })
    expect(iterator.next()).toEqual({ value: 2, done: false })
    expect(iterator.next()).toEqual({ value: undefined, done: true })
  })

  it('returns a sync iterator for a string', () => {
    const iterator = getIterator('ab') as Iterator<string>
    expect(iterator.next()).toEqual({ value: 'a', done: false })
  })

  it('returns an async iterator for an async generator', async () => {
    async function* gen() {
      yield 1
    }
    const iterator = getIterator(gen())
    await expect(iterator.next()).resolves.toEqual({ value: 1, done: false })
  })

  it('prefers the async iterator when a source has both', async () => {
    const source = {
      [Symbol.iterator]: () => ['sync'][Symbol.iterator](),
      [Symbol.asyncIterator]: async function* () {
        yield 'async'
      },
    }
    await expect(getIterator(source).next()).resolves.toEqual({ value: 'async', done: false })
  })

  it('returns a fresh iterator for each call on an array', () => {
    const source = [1, 2]
    const first = getIterator(source) as Iterator<number>
    first.next()
    expect((getIterator(source) as Iterator<number>).next()).toEqual({ value: 1, done: false })
  })

  it('throws a TypeError for a non-iterable value', () => {
    // @ts-expect-error deliberately invalid input
    expect(() => getIterator(42)).toThrow(TypeError)
  })
})
