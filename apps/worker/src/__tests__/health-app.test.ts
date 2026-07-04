import { describe, expect, it } from "vitest";
import request from "supertest";
import { createHealthApp } from "../health-app.js";

describe("GET /health (worker)", () => {
  it("returns ok status with service name and stub-mode flag", async () => {
    const app = createHealthApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      service: expect.any(String),
      stubMode: expect.any(Boolean),
    });
  });
});
