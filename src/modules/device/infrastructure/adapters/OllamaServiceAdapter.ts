/**
 * Ollama Service Adapter - Infrastructure adapter for AI service.
 *
 * This adapter implements the AIServicePort using Ollama
 * for local AI inference. It provides intelligent insights
 * about device readiness and deployment decisions.
 */

import type { AIServicePort } from '../../core/ports/DeviceRepository';

/**
 * Ollama service adapter implementation
 */
export class OllamaServiceAdapter implements AIServicePort {
  private host: string;
  private model: string;

  constructor(host: string = 'http://localhost:11434', model: string = 'gemma4') {
    this.host = host;
    this.model = model;
  }

  async getInsight(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return data.message?.content?.trim() ?? 'No response from AI.';
    } catch (error) {
      // Graceful degradation when Ollama is offline
      return 'Local AI is offline right now. Please check Ollama service.';
    }
  }
}
