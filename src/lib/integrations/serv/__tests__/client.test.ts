import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests replace the OpenAI SDK with a controllable transport so the SERV
 * contract itself is exercised: strict JSON-schema requests, Zod validation,
 * schema-feedback repair, bounded retries and provenance capture. No network
 * call is made and no test asserts that a fake model response is a decision.
 */
const { createMock, MockApiError } = vi.hoisted(() => {
  process.env.SERV_ENABLED = "1";
  process.env.SERV_API_KEY = "test-serv-key";
  process.env.SERV_MODEL = "gpt-5.4-mini-2026-03-17";

  class MockApiError extends Error {
    readonly status: number | undefined;
    readonly error: unknown;
    constructor(status: number, message: string, error?: unknown) {
      super(message);
      this.name = "APIError";
      this.status = status;
      this.error = error;
    }
  }

  return { createMock: vi.fn(), MockApiError };
});

vi.mock("openai", () => {
  class MockOpenAI {
    static APIError = MockApiError;
    readonly chat = { completions: { create: createMock } };
    constructor() {}
  }
  return { default: MockOpenAI, APIError: MockApiError };
});

import { ServIntentSchema } from "@/lib/domain/schemas";
import { serverConfig } from "@/lib/app/config";
import { getDatabase, resetDatabase } from "@/lib/store/database";
import { policy } from "@/lib/fixtures/demo";
import {
  ServInvalidOutputError,
  ServUnavailableError,
  callServStructured,
} from "../client";
import { extractIntent } from "../service";

const MODEL = "gpt-5.4-mini-2026-03-17";
const RESPONSE_ID = "chatcmpl-serv-test";

const validIntent = {
  goal: "Lower the household broadband cost without losing the mobile bundle discount.",
  serviceTypes: ["broadband"],
  currency: "USD",
  minimumMonthlySavingMinor: 1_000,
  maxContractMonths: 12,
  mustKeepBenefits: ["family_mobile_discount"],
  mustHave: [],
  mustNotHave: [],
  softPreferences: [],
  approvalRequiredFor: ["contract"],
  unknownCriticalTermsPolicy: "review",
  ambiguities: [],
} as const;

function completion(content: string, id = RESPONSE_ID) {
  return {
    id,
    model: MODEL,
    choices: [{ message: { role: "assistant", content } }],
    usage: { prompt_tokens: 120, completion_tokens: 64 },
  };
}

function intentRequest() {
  return {
    name: "trycommit_intent",
    system: "test system prompt",
    user: "Switch broadband but keep the family mobile discount.",
    schema: ServIntentSchema,
  };
}

type RecordedRequest = {
  messages: { role: string; content: string }[];
  response_format: Record<string, unknown>;
};

beforeEach(() => {
  createMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SERV structured call contract", () => {
  it("validates the payload against the supplied schema and keeps provenance", async () => {
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validIntent)));

    const result = await callServStructured(intentRequest());

    expect(result.data).toEqual(validIntent);
    expect(result.responseId).toBe(RESPONSE_ID);
    expect(result.model).toBe(MODEL);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.promptTokens).toBe(120);
    expect(result.completionTokens).toBe(64);

    const request = createMock.mock.calls[0][0] as RecordedRequest;
    expect(request.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "trycommit_intent", strict: true },
    });
    expect(serverConfig.serv.model).toBe(MODEL);
  });

  it("rejects model output that carries a decision field, so SERV cannot vote", async () => {
    createMock.mockResolvedValueOnce(
      completion(
        JSON.stringify({ ...validIntent, decision: "block", allowed: false }),
      ),
    );

    const result = await callServStructured(intentRequest());

    expect(Object.keys(ServIntentSchema.shape)).not.toContain("decision");
    expect(result.data).not.toHaveProperty("decision");
    expect(result.data).not.toHaveProperty("allowed");
    expect(result.data.goal).toBe(validIntent.goal);
  });

  it("feeds validation issues back to SERV and repairs instead of accepting invalid output", async () => {
    createMock
      .mockResolvedValueOnce(
        completion(JSON.stringify({ ...validIntent, maxContractMonths: "twelve" })),
      )
      .mockResolvedValueOnce(completion(JSON.stringify(validIntent)));

    const result = await callServStructured(intentRequest());

    expect(result.data.maxContractMonths).toBe(12);
    expect(createMock).toHaveBeenCalledTimes(2);
    const retry = createMock.mock.calls[1][0] as RecordedRequest;
    expect(retry.messages.at(-1)?.content).toContain(
      "did not satisfy the schema",
    );
    expect(retry.messages.at(-1)?.content).toContain("maxContractMonths");
  });

  it("refuses a result that never validates within three attempts", async () => {
    createMock.mockResolvedValue(completion("{}"));

    await expect(callServStructured(intentRequest())).rejects.toBeInstanceOf(
      ServInvalidOutputError,
    );
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it("accepts a fenced JSON payload without a repair round-trip", async () => {
    createMock.mockResolvedValueOnce(
      completion("```json\n" + JSON.stringify(validIntent) + "\n```"),
    );

    const result = await callServStructured(intentRequest());

    expect(result.data).toEqual(validIntent);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to json_object when the provider rejects json_schema", async () => {
    createMock
      .mockRejectedValueOnce(
        new MockApiError(400, "response_format json_schema is not supported"),
      )
      .mockResolvedValueOnce(completion(JSON.stringify(validIntent)));

    const result = await callServStructured(intentRequest());

    expect(result.data).toEqual(validIntent);
    expect(createMock).toHaveBeenCalledTimes(2);
    const retry = createMock.mock.calls[1][0] as RecordedRequest;
    expect(retry.response_format).toEqual({ type: "json_object" });
  });

  it("treats an authentication failure as unavailable and never retries", async () => {
    createMock.mockRejectedValueOnce(new MockApiError(401, "Unauthorized"));

    await expect(
      callServStructured(intentRequest()),
    ).rejects.toMatchObject({ name: "ServUnavailableError", causeStatus: 401 });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 429 once, then reports unavailable", async () => {
    createMock
      .mockRejectedValueOnce(new MockApiError(429, "Rate limit"))
      .mockRejectedValueOnce(new MockApiError(429, "Rate limit"));

    await expect(
      callServStructured(intentRequest()),
    ).rejects.toBeInstanceOf(ServUnavailableError);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to produce an extraction when SERV is not configured", async () => {
    vi.resetModules();
    const savedKey = process.env.SERV_API_KEY;
    const savedEnabled = process.env.SERV_ENABLED;
    delete process.env.SERV_API_KEY;
    process.env.SERV_ENABLED = "1";
    try {
      const freshClient = await import("../client");
      await expect(
        freshClient.callServStructured({
          ...intentRequest(),
          schema: (await import("@/lib/domain/schemas")).ServIntentSchema,
        }),
      ).rejects.toBeInstanceOf(freshClient.ServNotConfiguredError);
      expect(createMock).not.toHaveBeenCalled();
    } finally {
      process.env.SERV_API_KEY = savedKey;
      process.env.SERV_ENABLED = savedEnabled;
      vi.resetModules();
    }
  });
});

describe("SERV intent extraction provenance", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("records the live SERV source, model, request id and latency on the intent and audit trail", async () => {
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validIntent)));

    const { intent, meta } = await extractIntent({
      householdId: "hh_morgan_demo",
      request: "Switch broadband but keep the family mobile discount.",
      policy,
      knownBenefitKeys: policy.mustKeepBenefits,
      actorUserId: "user_demo_owner",
    });

    expect(meta).toMatchObject({
      source: "serv",
      model: MODEL,
      responseId: RESPONSE_ID,
      warning: null,
    });
    expect(meta.latencyMs).toBeGreaterThanOrEqual(0);
    expect(intent.extractionSource).toBe("serv");
    expect(intent.extractionModel).toBe(MODEL);
    expect(intent.servRequestId).toBe(RESPONSE_ID);
    expect(intent.servLatencyMs).toBe(meta.latencyMs);
    expect(intent.userConfirmedAt).toBeNull();
    expect(intent.maxContractMonths).toBe(12);

    const database = await getDatabase();
    expect(database.intents.find((item) => item.id === intent.id)).toBeDefined();
    const audit = database.auditEvents.find(
      (item) => item.entityId === intent.id && item.eventType === "intent.extracted",
    );
    expect(audit?.metadata).toMatchObject({
      extractionSource: "serv",
      model: MODEL,
      servResponseId: RESPONSE_ID,
    });
  });

  it("persists nothing when SERV output never validates", async () => {
    createMock.mockResolvedValue(completion("{}"));
    const seeded = await getDatabase();
    const intentsBefore = seeded.intents.length;
    const auditBefore = seeded.auditEvents.length;

    await expect(
      extractIntent({
        householdId: "hh_morgan_demo",
        request: "Switch broadband but keep the family mobile discount.",
        policy,
        knownBenefitKeys: policy.mustKeepBenefits,
        actorUserId: "user_demo_owner",
      }),
    ).rejects.toBeInstanceOf(ServInvalidOutputError);

    const after = await getDatabase();
    expect(after.intents.length).toBe(intentsBefore);
    expect(after.auditEvents.length).toBe(auditBefore);
  });
});
