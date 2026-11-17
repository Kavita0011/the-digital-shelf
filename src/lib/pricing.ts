/**
 * Split an integer amount (cents/credits) proportionally across line items.
 * Any rounding remainder goes to the final item so the parts always sum to
 * exactly the original amount.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const parts = weights.map((weight) => Math.round(total * weight / sum));
  parts[parts.length - 1] = Math.max(0, total - parts.slice(0, -1).reduce((a, b) => a + b, 0));
  return parts;
}
