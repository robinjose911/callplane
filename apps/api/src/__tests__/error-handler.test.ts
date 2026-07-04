import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";

const { isNotFoundError, isUniqueConstraintError } = vi.hoisted(() => ({
  isNotFoundError: vi.fn().mockReturnValue(false),
  isUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

vi.mock("@callplane/database", () => ({ isNotFoundError, isUniqueConstraintError }));

const { errorHandler } = await import("../middleware/error-handler.js");

function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("errorHandler", () => {
  it("maps a Prisma not-found error to a 404 NOT_FOUND envelope", () => {
    isNotFoundError.mockReturnValueOnce(true);
    const res = mockResponse();

    errorHandler(new Error("P2025"), {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }),
    );
  });

  it("maps a Prisma unique-constraint error to a 409 CONFLICT envelope", () => {
    isUniqueConstraintError.mockReturnValueOnce(true);
    const res = mockResponse();

    errorHandler(new Error("P2002"), {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: "CONFLICT" }) }),
    );
  });

  it("maps any other error to a 500 INTERNAL_ERROR envelope, never leaking the raw message", () => {
    const res = mockResponse();

    errorHandler(new Error("some sensitive internal detail"), { path: "/x", method: "GET" } as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const [body] = (res.json as ReturnType<typeof vi.fn>).mock.calls[0] as [{ error: { message: string } }];
    expect(body.error.message).not.toContain("sensitive internal detail");
    expect(body).toMatchObject({ success: false, error: { code: "INTERNAL_ERROR" } });
  });
});
