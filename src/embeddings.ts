/**
 * Cortex Embeddings Module
 * Vector generation using @xenova/transformers (pure JS ONNX runtime)
 */

// ============================================================================
// Configuration
// ============================================================================

const MODEL_NAME = 'nomic-ai/nomic-embed-text-v1.5';
const EMBEDDING_DIM = 768;

// Prefixes for Nomic Embed v1.5 (requires task prefixes)
const PASSAGE_PREFIX = 'search_document: ';
const QUERY_PREFIX = 'search_query: ';

// ============================================================================
// Embedder State
// ============================================================================

// Use 'any' for dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelineFunc: any = null;

/**
 * Dynamically import @xenova/transformers (ESM-only package)
 */
async function loadTransformers() {
  if (pipelineFunc) return pipelineFunc;

  // Use dynamic import for ESM-only package
  const transformers = await import('@xenova/transformers');
  pipelineFunc = transformers.pipeline;
  return pipelineFunc;
}

/**
 * Initialize the embedding pipeline
 * Uses singleton pattern to avoid loading model multiple times
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initEmbedder(): Promise<any> {
  if (embedder) {
    return embedder;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const pipeline = await loadTransformers();
      embedder = await pipeline('feature-extraction', MODEL_NAME, {
        quantized: true,
      });
      return embedder;
    } catch (error) {
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if embedder is initialized
 */
export function isEmbedderReady(): boolean {
  return embedder !== null;
}

/**
 * Get embedding dimension
 */
export function getEmbeddingDim(): number {
  return EMBEDDING_DIM;
}

/**
 * Get model name
 */
export function getModelName(): string {
  return MODEL_NAME;
}

// ============================================================================
// Embedding Functions
// ============================================================================

/**
 * Generate embeddings for passages (content to be stored)
 * Uses "passage: " prefix as per BGE model convention
 */
export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
  const pipe = await initEmbedder();

  const prefixedTexts = texts.map((t) => PASSAGE_PREFIX + t);

  const results: Float32Array[] = [];

  for (const text of prefixedTexts) {
    const output = await pipe(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Extract embedding from tensor
    const embedding = new Float32Array(output.data);
    results.push(embedding);
  }

  return results;
}

/**
 * Generate embedding for a single passage
 */
export async function embedPassage(text: string): Promise<Float32Array> {
  const results = await embedPassages([text]);
  return results[0];
}

/**
 * Generate embedding for a search query
 * Uses "query: " prefix as per BGE model convention
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  const pipe = await initEmbedder();

  const prefixedText = QUERY_PREFIX + text;

  const output = await pipe(prefixedText, {
    pooling: 'mean',
    normalize: true,
  });

  return new Float32Array(output.data);
}

/**
 * Embedding batch result with error tracking
 */
export interface EmbedBatchResult {
  embeddings: Float32Array[];
  errors: Array<{ index: number; text: string; error: string }>;
  successCount: number;
  failCount: number;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate embedding for a single text with retry logic
 */
async function embedSingleWithRetry(
  pipe: unknown,
  text: string,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<{ success: true; embedding: Float32Array } | { success: false; error: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const output = await (pipe as any)(text, {
        pooling: 'mean',
        normalize: true,
      });
      return { success: true, embedding: new Float32Array(output.data) };
    } catch (error) {
      if (attempt < maxRetries - 1) {
        // Exponential backoff
        await sleep(baseDelayMs * Math.pow(2, attempt));
      } else {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Generate embeddings in batches with progress callback
 * Includes retry logic and partial results support
 */
export async function embedBatch(
  texts: string[],
  options: {
    batchSize?: number;
    onProgress?: (completed: number, total: number) => void;
    isQuery?: boolean;
    allowPartialResults?: boolean;
    maxRetries?: number;
  } = {}
): Promise<Float32Array[]> {
  const result = await embedBatchWithResult(texts, options);

  // For backwards compatibility, throw if we have failures and partial results not allowed
  if (result.failCount > 0 && !options.allowPartialResults) {
    const firstError = result.errors[0];
    throw new Error(`Embedding failed for text at index ${firstError.index}: ${firstError.error}`);
  }

  return result.embeddings;
}

/**
 * Generate embeddings in batches with full result tracking
 * Returns detailed results including errors for each failed embedding
 */
export async function embedBatchWithResult(
  texts: string[],
  options: {
    batchSize?: number;
    onProgress?: (completed: number, total: number) => void;
    isQuery?: boolean;
    allowPartialResults?: boolean;
    maxRetries?: number;
  } = {}
): Promise<EmbedBatchResult> {
  const {
    batchSize = 32,
    onProgress,
    isQuery = false,
    allowPartialResults = false,
    maxRetries = 3,
  } = options;
  const prefix = isQuery ? QUERY_PREFIX : PASSAGE_PREFIX;

  const pipe = await initEmbedder();
  const result: EmbedBatchResult = {
    embeddings: [],
    errors: [],
    successCount: 0,
    failCount: 0,
  };

  // Zero embedding placeholder for failures (when partial results allowed)
  const zeroEmbedding = new Float32Array(EMBEDDING_DIM);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    for (let j = 0; j < batch.length; j++) {
      const globalIndex = i + j;
      const prefixedText = prefix + batch[j];

      const embedResult = await embedSingleWithRetry(pipe, prefixedText, maxRetries);

      if (embedResult.success) {
        result.embeddings.push(embedResult.embedding);
        result.successCount++;
      } else {
        result.errors.push({
          index: globalIndex,
          text: batch[j].substring(0, 100) + (batch[j].length > 100 ? '...' : ''),
          error: embedResult.error,
        });
        result.failCount++;

        if (allowPartialResults) {
          // Use zero embedding as placeholder
          result.embeddings.push(zeroEmbedding);
        }
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }
  }

  return result;
}

// ============================================================================
// Testing / Verification
// ============================================================================

/**
 * Test embedding generation
 */
export async function testEmbed(text: string): Promise<{
  model: string;
  dimensions: number;
  sample: number[];
}> {
  const embedding = await embedPassage(text);

  return {
    model: MODEL_NAME,
    dimensions: embedding.length,
    sample: Array.from(embedding.slice(0, 5)),
  };
}

/**
 * Verify model is loaded and working
 */
export async function verifyModel(): Promise<{
  success: boolean;
  model: string;
  dimensions: number;
  error?: string;
}> {
  try {
    await initEmbedder();

    const testEmbedding = await embedPassage('test');

    return {
      success: true,
      model: MODEL_NAME,
      dimensions: testEmbedding.length,
    };
  } catch (error) {
    return {
      success: false,
      model: MODEL_NAME,
      dimensions: EMBEDDING_DIM,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
