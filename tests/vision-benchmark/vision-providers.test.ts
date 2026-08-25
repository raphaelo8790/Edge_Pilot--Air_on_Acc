import {
  GeminiVisionProvider,
  OllamaVisionProvider,
  PreparedVisionImage,
  VisionBenchmarkSample,
  VisionFetch,
  VisionProviderRequest,
} from '../../src/modules/vision-benchmark';

const VALID_SHA = 'a'.repeat(64);

function createRequest(): VisionProviderRequest {
  const sample: VisionBenchmarkSample = {
    id: 'sample-001',
    imagePath: 'datasets/vision-benchmark/images/hardhat-01.png',
    expectedLabel: 'hardhat',
    sourceId: 'synthetic-hardhat-v1',
    licenseSpdx: 'MIT',
    licenseVerified: true,
    privacyReviewed: true,
    containsPeople: false,
    containsFaces: false,
    containsPersonalData: false,
    exifPresent: false,
    sha256: VALID_SHA,
  };
  const image: PreparedVisionImage = {
    data: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png',
    width: 32,
    height: 32,
    sourceBytes: 3,
    processedBytes: 3,
    sourceSha256: VALID_SHA,
    processedSha256: VALID_SHA,
  };

  return {
    sample,
    image,
    prompt: 'Return one supported label.',
  };
}

function sequenceClock(values: number[]): () => number {
  let index = 0;

  return () => {
    const value = values[index];
    index += 1;

    if (value === undefined) {
      throw new Error('No clock value remains.');
    }

    return value;
  };
}

describe('Ollama vision provider', () => {
  test('sends image bytes to the local vision chat API', async () => {
    let capturedInput: string | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: VisionFetch = async (input, init) => {
      capturedInput = input;
      capturedInit = init;

      return new Response(
        JSON.stringify({
          message: {
            content: 'hardhat',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    };
    const provider = new OllamaVisionProvider({
      model: 'gemma4',
      baseUrl: 'http://localhost:11434',
      fetchImplementation,
      clock: sequenceClock([100, 125]),
    });

    const response = await provider.classify(createRequest());
    const body = JSON.parse(String(capturedInit?.body));

    expect(String(capturedInput)).toBe(
      'http://localhost:11434/api/chat'
    );
    expect(body.model).toBe('gemma4');
    expect(body.stream).toBe(false);
    expect(body.options).toEqual({
      temperature: 0,
      seed: 42,
    });
    expect(body.messages[0].images).toEqual(['AQID']);
    expect(response).toEqual({
      rawOutput: 'hardhat',
      latencyMs: 25,
      success: true,
      errorMessage: null,
    });
  });

  test('turns an Ollama HTTP error into structured failure', async () => {
    const provider = new OllamaVisionProvider({
      model: 'gemma4',
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: 'model not found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'application/json' },
        }),
      clock: sequenceClock([0, 10]),
    });

    await expect(provider.classify(createRequest())).resolves.toEqual({
      rawOutput: '',
      latencyMs: 10,
      success: false,
      errorMessage: 'model not found',
    });
  });
});

describe('Gemini vision provider', () => {
  test('sends inline image data through the cloud interactions API', async () => {
    let capturedInput: string | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: VisionFetch = async (input, init) => {
      capturedInput = input;
      capturedInit = init;

      return new Response(
        JSON.stringify({
          output_text: '{"label":"hardhat"}',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    };
    const provider = new GeminiVisionProvider({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      fetchImplementation,
      clock: sequenceClock([200, 275]),
    });

    const response = await provider.classify(createRequest());
    const headers = new Headers(capturedInit?.headers);
    const body = JSON.parse(String(capturedInit?.body));

    expect(String(capturedInput)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions'
    );
    expect(headers.get('x-goog-api-key')).toBe('test-key');
    expect(body.model).toBe('gemini-3.6-flash');
    expect(body.input[0].type).toBe('text');
    expect(body.input[1]).toMatchObject({
      type: 'image',
      data: 'AQID',
      mime_type: 'image/png',
    });
    expect(body.response_format.schema.properties.label.enum).toContain(
      'safety_cone'
    );
    expect(response).toEqual({
      rawOutput: 'hardhat',
      latencyMs: 75,
      success: true,
      errorMessage: null,
    });
  });

  test('preserves malformed structured output for evaluator rejection', async () => {
    const provider = new GeminiVisionProvider({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      fetchImplementation: async () =>
        new Response(JSON.stringify({ output_text: 'unknown item' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      clock: sequenceClock([0, 20]),
    });

    await expect(provider.classify(createRequest())).resolves.toEqual({
      rawOutput: 'unknown item',
      latencyMs: 20,
      success: true,
      errorMessage: null,
    });
  });

  test('requires a Gemini API key', () => {
    expect(
      () =>
        new GeminiVisionProvider({
          apiKey: ' ',
          model: 'gemini-3.6-flash',
        })
    ).toThrow('GEMINI_API_KEY is required');
  });

  test('turns a Gemini API error into structured failure', async () => {
    const provider = new GeminiVisionProvider({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'quota exceeded',
            },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'content-type': 'application/json' },
          }
        ),
      clock: sequenceClock([10, 45]),
    });

    await expect(provider.classify(createRequest())).resolves.toEqual({
      rawOutput: '',
      latencyMs: 35,
      success: false,
      errorMessage: 'quota exceeded',
    });
  });
});
