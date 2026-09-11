import {
  GeminiVisionProvider,
  GroqVisionProvider,
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
      // This mock sends no timings, and every field is null rather than 0.
      // A zero here would read as "instant" instead of "not reported".
      runtime: {
        totalMs: null,
        loadMs: null,
        promptEvalMs: null,
        promptTokens: null,
        evalMs: null,
        outputTokens: null,
      },
    });
  });

  test('converts the runtime timings Ollama reports from nanoseconds', async () => {
    // A real /api/chat reply carries these even with stream: false. They were
    // being parsed away and discarded. The conversion is the part worth
    // pinning: an off-by-1e6 here would look plausible and be wrong by a
    // thousand times.
    const provider = new OllamaVisionProvider({
      model: 'llava:latest',
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            message: { content: 'hardhat' },
            total_duration: 1_500_000_000,
            load_duration: 300_000_000,
            prompt_eval_count: 614,
            prompt_eval_duration: 900_000_000,
            eval_count: 7,
            eval_duration: 250_000_000,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ),
      clock: sequenceClock([100, 125]),
    });

    const response = await provider.classify(createRequest());

    expect(response.runtime).toEqual({
      totalMs: 1500,
      loadMs: 300,
      promptEvalMs: 900,
      promptTokens: 614,
      evalMs: 250,
      outputTokens: 7,
    });
    // Our own wall clock stays separate from what the runtime reported.
    expect(response.latencyMs).toBe(25);
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
  /**
   * These assert against GOOGLE'S documented contract, not against whatever
   * this file happens to send. The previous version of this test mirrored the
   * provider's own (wrong) request shape, so both agreed on an endpoint that
   * does not exist and every hosted run 404'd with the suite green.
   */
  test('posts the image to models/{model}:generateContent', async () => {
    let capturedInput: string | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: VisionFetch = async (input, init) => {
      capturedInput = input;
      capturedInit = init;

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '{"label":"hardhat"}' }] },
              finishReason: 'STOP',
            },
          ],
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

    // The model belongs in the PATH on this API. Putting it in the body is
    // what produced the 404.
    expect(String(capturedInput)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'
    );
    expect(headers.get('x-goog-api-key')).toBe('test-key');
    expect(body.contents[0].parts[0].text).toBeDefined();
    expect(body.contents[0].parts[1].inline_data).toMatchObject({
      data: 'AQID',
      mime_type: 'image/png',
    });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(
      body.generationConfig.responseSchema.properties.label.enum
    ).toContain('safety_cone');
    // Gemini REJECTS additionalProperties in a response schema.
    expect(
      body.generationConfig.responseSchema.additionalProperties
    ).toBeUndefined();
    expect(response).toEqual({
      rawOutput: 'hardhat',
      latencyMs: 75,
      success: true,
      errorMessage: null,
    });
  });

  test('accepts a model id already prefixed with models/', async () => {
    let capturedInput: string | URL | undefined;
    const provider = new GeminiVisionProvider({
      apiKey: 'test-key',
      model: 'models/gemini-2.5-flash',
      fetchImplementation: async (input) => {
        capturedInput = input;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"label":"hardhat"}' }] } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
      clock: sequenceClock([0, 10]),
    });

    await provider.classify(createRequest());

    expect(String(capturedInput)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    );
  });

  test('reports a filtered or empty answer as a failed request, not a wrong label', async () => {
    // A safety block returns 200 with no text. Scoring that as an incorrect
    // prediction would blame the model for an answer it was never allowed to
    // give; it belongs in the failed-request rate instead.
    const provider = new GeminiVisionProvider({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ),
      clock: sequenceClock([0, 30]),
    });

    await expect(provider.classify(createRequest())).resolves.toEqual({
      rawOutput: '',
      latencyMs: 30,
      success: false,
      errorMessage: 'Gemini returned no text (SAFETY).',
    });
  });

  test('preserves malformed structured output for evaluator rejection', async () => {
    const provider = new GeminiVisionProvider({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'unknown item' }] } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ),
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

describe('Groq vision provider', () => {
  test('sends the image as a data URL through the chat-completions API', async () => {
    let capturedInput: string | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: VisionFetch = async (input, init) => {
      capturedInput = input;
      capturedInit = init;

      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'hardhat' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };
    const provider = new GroqVisionProvider({
      apiKey: 'gsk_test',
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      fetchImplementation,
      clock: sequenceClock([100, 160]),
    });

    const response = await provider.classify(createRequest());
    const headers = new Headers(capturedInit?.headers);
    const body = JSON.parse(String(capturedInit?.body));

    expect(String(capturedInput)).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(headers.get('authorization')).toBe('Bearer gsk_test');
    expect(String(capturedInput)).not.toContain('gsk_test');
    expect(body.model).toBe('meta-llama/llama-4-scout-17b-16e-instruct');
    expect(body.temperature).toBe(0);
    expect(body.messages[0].content[0]).toEqual({ type: 'text', text: createRequest().prompt });
    expect(body.messages[0].content[1].image_url.url).toBe('data:image/png;base64,AQID');
    expect(response).toEqual({
      rawOutput: 'hardhat',
      latencyMs: 60,
      success: true,
      errorMessage: null,
    });
  });

  test('reports a provider failure without throwing', async () => {
    const provider = new GroqVisionProvider({
      apiKey: 'gsk_test',
      model: 'llama-3.1-8b-instant',
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: { message: 'model does not support images' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      clock: sequenceClock([0, 5]),
    });

    const response = await provider.classify(createRequest());

    expect(response.success).toBe(false);
    expect(response.errorMessage).toContain('does not support images');
  });

  test('requires a Groq API key', () => {
    expect(
      () => new GroqVisionProvider({ apiKey: '  ', model: 'x' })
    ).toThrow('GROQ_API_KEY is required.');
  });
});
