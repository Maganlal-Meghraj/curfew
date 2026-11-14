export interface Estimator {
  record(ms: number): void;
  estimateMs(): number;
}
