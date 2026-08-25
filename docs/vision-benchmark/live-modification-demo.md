# Live Modification Demo

## Goal

Demonstrate a small, test-driven modification in under two minutes by accepting
the provider alias `helmet` as `hardhat`.

## Step 1: Add the alias

Open:

```text
src/modules/vision-benchmark/core/normalization.ts
```

Add one line inside `LABEL_ALIASES`:

```ts
helmet: 'hardhat',
```

## Step 2: Add the test

Open:

```text
tests/vision-benchmark/vision-benchmark.test.ts
```

Add this test inside `vision label normalization`:

```ts
test('normalizes the helmet alias', () => {
  expect(normalizeVisionLabel('helmet')).toBe('hardhat');
});
```

## Step 3: Run the focused suite

```bash
npm test -- --runInBand tests/vision-benchmark/vision-benchmark.test.ts
```

## What to explain

The external provider vocabulary can vary, but the evaluator uses one canonical
label set. The normalization layer absorbs a safe alias without changing
ground-truth labels, metric formulas, evidence schemas, or provider adapters.
The new test proves the behavior and prevents regression.

After the demonstration, keep the change only if the team approves the alias.
