import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { serverConfig, isServConfigured } from "@/lib/app/config";

export class ServNotConfiguredError extends Error {
  constructor() {
    super("SERV is not configured on this deployment.");
    this.name = "ServNotConfiguredError";
  }
}

export class ServUnavailableError extends Error {
  readonly causeStatus: number | null;
  constructor(message: string, causeStatus: number | null = null) {
    super(message);
    this.name = "ServUnavailableError";
    this.causeStatus = causeStatus;
  }
}

export class ServInvalidOutputError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "ServInvalidOutputError";
    this.issues = issues;
  }
}

export interface ServCallResult<T> {
  data: T;
  responseId: string | null;
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!isServConfigured()) throw new ServNotConfiguredError();
  if (!client) {
    client = new OpenAI({
      apiKey: serverConfig.serv.apiKey,
      baseURL: serverConfig.serv.baseUrl,
      timeout: serverConfig.serv.timeoutMs,
      maxRetries: 0,
    });
  }
  return client;
}

function cleanJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanJsonSchema);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key === "$schema") continue;
    cleaned[key] = cleanJsonSchema(entry);
  }
  return cleaned;
}

function schemaFor(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return cleanJsonSchema(json) as Record<string, unknown>;
}

export interface StructuredCallInput<S extends z.ZodType = z.ZodType> {
  name: string;
  system: string;
  user: string;
  schema: S;
  maxCompletionTokens?: number;
  temperature?: number;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(withoutFence);
}

function isResponseFormatRejection(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  if (error.status !== 400) return false;
  const message = `${error.message} ${JSON.stringify(error.error ?? "")}`.toLowerCase();
  return (
    message.includes("response_format") ||
    message.includes("json_schema") ||
    message.includes("structured")
  );
}

function isTransient(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  return error.status === 429 || (error.status ?? 0) >= 500;
}

/**
 * Performs a SERV Chat Completions call with structured output when supported,
 * then validates the result with Zod. Never returns unvalidated model output.
 */
export async function callServStructured<S extends z.ZodType>(
  input: StructuredCallInput<S>,
): Promise<ServCallResult<z.infer<S>>> {
  const openai = getClient();
  const startedAt = Date.now();
  const jsonSchema = schemaFor(input.schema);
  let structuredMode = true;

  const system = `${input.system}

OUTPUT CONTRACT
Return a single JSON object only. Do not wrap it in markdown. It must satisfy the supplied JSON schema exactly. Use null for a fact that is not stated; never invent a value.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: input.user },
  ];

  let lastPayload: unknown = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: serverConfig.serv.model,
        messages,
        max_completion_tokens: input.maxCompletionTokens ?? 1800,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        response_format: structuredMode
          ? {
              type: "json_schema",
              json_schema: {
                name: input.name,
                strict: true,
                schema: jsonSchema,
              },
            }
          : { type: "json_object" },
      });
    } catch (error) {
      if (isResponseFormatRejection(error) && structuredMode) {
        structuredMode = false;
        continue;
      }
      if (isTransient(error) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }
      if (error instanceof ServNotConfiguredError) throw error;
      const status = error instanceof OpenAI.APIError ? error.status ?? null : null;
      throw new ServUnavailableError(
        status === 401
          ? "SERV rejected the API key."
          : "SERV is currently unavailable. No action was taken.",
        status,
      );
    }

    const content = completion.choices[0]?.message?.content ?? "";
    try {
      lastPayload = parseJsonContent(content);
    } catch {
      lastPayload = null;
    }

    const parsed = input.schema.safeParse(lastPayload);
    if (parsed.success) {
      return {
        data: parsed.data as z.infer<S>,
        responseId: completion.id ?? null,
        model: completion.model ?? serverConfig.serv.model,
        latencyMs: Date.now() - startedAt,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
      };
    }

    const issues = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);

    console.warn("[commitmentguard] SERV output failed validation", {
      attempt,
      issues,
      responseId: completion.id ?? null,
      model: completion.model ?? null,
    });

    messages.push({ role: "assistant", content: content || "{}" });
    messages.push({
      role: "user",
      content: `That response did not satisfy the schema. Fix these issues and return the JSON object only:\n${issues.join(
        "\n",
      )}`,
    });
  }

  throw new ServInvalidOutputError(
    "SERV returned output that failed schema validation. No action was taken.",
  );
}

export interface ServHealth {
  configured: boolean;
  enabled: boolean;
  model: string;
  baseUrl: string;
  reachable: boolean | null;
  latencyMs: number | null;
  responseId: string | null;
  checkedAt: string;
  error: string | null;
}

const healthSchema = z.object({
  reachable: z.boolean(),
  note: z.string(),
});

/** Optional low-token probe. Disabled unless explicitly requested. */
export async function probeServ(): Promise<ServHealth> {
  const base: ServHealth = {
    configured: isServConfigured(),
    enabled: serverConfig.serv.enabled,
    model: serverConfig.serv.model,
    baseUrl: serverConfig.serv.baseUrl,
    reachable: null,
    latencyMs: null,
    responseId: null,
    checkedAt: new Date().toISOString(),
    error: null,
  };
  if (!base.configured) {
    return { ...base, error: "SERV_API_KEY is not set." };
  }
  try {
    const result = await callServStructured({
      name: "commitmentguard_health",
      system:
        "You are a connectivity probe for CommitmentGuard. Treat this as a routing test.",
      user: 'Reply with {"reachable": true, "note": "SERV reachable"}.',
      schema: healthSchema,
      maxCompletionTokens: 120,
    });
    return {
      ...base,
      reachable: result.data.reachable,
      latencyMs: result.latencyMs,
      responseId: result.responseId,
    };
  } catch (error) {
    return {
      ...base,
      reachable: false,
      error:
        error instanceof Error
          ? error.message
          : "SERV health probe failed. No action was taken.",
    };
  }
}
