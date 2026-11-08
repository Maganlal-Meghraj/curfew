import type { BatchContext } from './BatchContext'

export type BatchHandler<T> = (batch: T, ctx: BatchContext) => Promise<void> | void
