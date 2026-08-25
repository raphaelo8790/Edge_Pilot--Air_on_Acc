/**
 * The ten-case matrix artefact, held against what the page renders from it.
 *
 * The page reads `evidence/evaluation/ten-case-matrix.json` directly and
 * renders it category by category. That has one silent failure mode worth
 * pinning: a case carrying a category the page does not know about is dropped
 * from the render while still being counted in the totals — so the page would
 * say "10 cases" and show nine. A pass count cannot catch that; these can.
 *
 * These tests read the committed artefact rather than regenerating it, so
 * they also fail if `npm run eval:matrix` starts emitting a different shape.
 */
import fs from "node:fs";
import path from "node:path";

import { CATEGORY_ORDER, CATEGORY_LABEL, CATEGORY_BLURB } from "@/app/evaluation/categories";

interface MatrixCase {
  id: number;
  category: string;
  name: string;
  sent: unknown;
  expected: string;
  observed: unknown;
  passed: boolean;
}

interface Matrix {
  artefact: string;
  generated_by: string;
  what_this_proves: string;
  what_this_does_not_prove: string;
  injection_threat_model: string;
  case_count: number;
  cases_by_category: Record<string, number>;
  all_cases_behaved_as_documented: boolean;
  failed_case_ids: number[];
  cases: MatrixCase[];
}

const matrix = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "evidence", "evaluation", "ten-case-matrix.json"),
    "utf8",
  ),
) as Matrix;

describe("ten-case matrix artefact", () => {
  test("carries every field the page renders", () => {
    for (const field of [
      "artefact",
      "generated_by",
      "what_this_proves",
      "what_this_does_not_prove",
      "injection_threat_model",
    ] as const) {
      expect(typeof matrix[field]).toBe("string");
      expect(matrix[field].length).toBeGreaterThan(0);
    }
    expect(Array.isArray(matrix.cases)).toBe(true);
    expect(Array.isArray(matrix.failed_case_ids)).toBe(true);
  });

  test("is still a TEN-case matrix", () => {
    expect(matrix.cases).toHaveLength(10);
    expect(matrix.case_count).toBe(matrix.cases.length);
  });

  test("every case is complete", () => {
    matrix.cases.forEach((entry) => {
      expect(Number.isInteger(entry.id)).toBe(true);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.expected.length).toBeGreaterThan(0);
      expect(typeof entry.passed).toBe("boolean");
      // sent/observed are rendered as JSON blocks; they must be renderable.
      expect(entry.sent).toBeDefined();
      expect(entry.observed).toBeDefined();
      expect(() => JSON.stringify(entry.sent)).not.toThrow();
      expect(() => JSON.stringify(entry.observed)).not.toThrow();
    });
  });

  test("case ids are unique", () => {
    const ids = matrix.cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** The silent one: an unknown category never reaches the screen. */
  test("every category used is one the page knows how to render", () => {
    const known = new Set<string>(CATEGORY_ORDER);
    const used = new Set(matrix.cases.map((entry) => entry.category));
    used.forEach((category) => {
      expect(known.has(category)).toBe(true);
      expect(CATEGORY_LABEL[category]).toBeTruthy();
      expect(CATEGORY_BLURB[category]).toBeTruthy();
    });
  });

  test("grouping by the page's category order shows all ten cases", () => {
    const rendered = CATEGORY_ORDER.reduce(
      (total, category) =>
        total + matrix.cases.filter((entry) => entry.category === category).length,
      0,
    );
    expect(rendered).toBe(matrix.cases.length);
  });

  test("cases_by_category agrees with the cases themselves", () => {
    Object.entries(matrix.cases_by_category).forEach(([category, count]) => {
      const actual = matrix.cases.filter(
        (entry) => entry.category === category,
      ).length;
      expect(actual).toBe(count);
    });
  });

  test("the pass summary agrees with the individual cases", () => {
    const failed = matrix.cases
      .filter((entry) => !entry.passed)
      .map((entry) => entry.id);
    expect(matrix.failed_case_ids.sort()).toEqual(failed.sort());
    expect(matrix.all_cases_behaved_as_documented).toBe(failed.length === 0);
  });

  test("the adversarial categories are actually present", () => {
    // The matrix exists to show more than the happy path; if these ever drop
    // to zero the artefact has lost the part worth showing.
    const count = (category: string) =>
      matrix.cases.filter((entry) => entry.category === category).length;
    expect(count("injection")).toBeGreaterThanOrEqual(3);
    expect(count("malformed")).toBeGreaterThanOrEqual(1);
    expect(count("provider-failure")).toBeGreaterThanOrEqual(1);
  });
});
