export function getIterator<T>(source: Iterable<T> | AsyncIterable<T>): Iterator<T> | AsyncIterator<T> {
  return isAsyncIterable(source) ? source[Symbol.asyncIterator]() : source[Symbol.iterator]()
}

function isAsyncIterable<T>(source: Iterable<T> | AsyncIterable<T>): source is AsyncIterable<T> {
  return typeof (source as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
}
