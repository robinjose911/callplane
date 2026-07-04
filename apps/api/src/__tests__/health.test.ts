import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

describe("GET /health", () => {
  it("returns ok status with service name and stub-mode flag", async () => {
    const app = createApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      service: expect.any(String),
      stubMode: expect.any(Boolean),
    });
  });

  it("reflects PROVIDER_STUB_MODE from the environment", async () => {
    const original = process.env["PROVIDER_STUB_MODE"];
    process.env["PROVIDER_STUB_MODE"] = "true";

    const app = createApp();
    const response = await request(app).get("/health");

    expect(response.body.stubMode).toBe(true);

    if (original === undefined) {
      delete process.env["PROVIDER_STUB_MODE"];
    } else {
      process.env["PROVIDER_STUB_MODE"] = original;
    }
  });
});
