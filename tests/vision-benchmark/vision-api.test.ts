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
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0].executionMode).toBe('controlled');
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
