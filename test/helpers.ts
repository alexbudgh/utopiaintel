import assert from "node:assert/strict";

export function assertApprox(
  actual: number | null | undefined,
  expected: number,
  epsilon = 0.01,
  message?: string,
): void {
  assert.ok(actual != null, message ?? `expected ${expected}, got ${actual}`);
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    message ?? `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}
