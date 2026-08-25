import { VisionDashboardRowSchema } from '../../src/modules/vision-benchmark/core/schemas';
import {
  GET,
  POST,
} from '../../src/app/api/v1/vision-benchmarks/route';

describe('vision benchmark API integration', () => {
  const originalToken = process.env.VISION_BENCHMARK_API_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.VISION_BENCHMARK_API_TOKEN;
    } else {
      process.env.VISION_BENCHMARK_API_TOKEN = originalToken;
    }
  });

  test('returns validated dashboard rows from evidence files', async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);

    // Asserts what the endpoint promises - every row parses and the two
    // controlled fixtures are served - rather than a fixed COUNT. The old
    // assertion was toHaveLength(2), which meant recording a single real
    // benchmark broke the suite: a test that fails when someone uses the
    // product is testing the contents of a directory, not the endpoint.
    const models = payload.data.map(
      (row: { model: string }) => row.model
    );

    expect(models).toContain('gemma4-fixture');
    expect(models).toContain('gemini-3.6-flash-fixture');

    for (const row of payload.data) {
      expect(VisionDashboardRowSchema.safeParse(row).success).toBe(true);
    }

    // Ranked best-accuracy first, whatever else is in the directory.
    const accuracies = payload.data.map(
      (row: { accuracy: number }) => row.accuracy
    );

    expect(accuracies).toEqual([...accuracies].sort((a, b) => b - a));
  });

  test('disables provider execution without a server token', async () => {
    delete process.env.VISION_BENCHMARK_API_TOKEN;

    const response = await POST(
      new Request('http://localhost/api/v1/vision-benchmarks', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response.status).toBe(503);
  });

  test('rejects an invalid bearer token', async () => {
    process.env.VISION_BENCHMARK_API_TOKEN = 'expected-token';

    const response = await POST(
      new Request('http://localhost/api/v1/vision-benchmarks', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-token',
        },
        body: '{}',
      })
    );

    expect(response.status).toBe(401);
  });
});
