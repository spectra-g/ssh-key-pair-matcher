import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeCanonicalBase64, encodeBase64 } from "../../src/core/base64";
import { MAX_KEY_BLOB_BYTES } from "../../src/core/types";

describe("canonical base64", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips bytes with canonical padding", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);

    expect(encodeBase64(bytes)).toBe("AAEC/f7/");
    expect(decodeCanonicalBase64("YQ==", "public")).toEqual(
      new Uint8Array([97]),
    );
  });

  it.each([
    ["", "empty"],
    ["YQ", "missing padding"],
    ["YQ===", "excess padding"],
    ["YR==", "non-zero padding bits"],
    ["Y Q==", "whitespace"],
    ["-_==", "base64url"],
  ])("rejects %s as %s", (encoded) => {
    expect(() => decodeCanonicalBase64(encoded, "public")).toThrowError(
      expect.objectContaining({
        code: "invalid-base64",
        field: "public",
      }),
    );
  });

  it("rejects encoded input beyond the bounded limit before decoding", () => {
    expect(() =>
      decodeCanonicalBase64(
        "A".repeat(Math.ceil((MAX_KEY_BLOB_BYTES * 4) / 3) + 3),
        "private",
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid-base64" }));
  });

  it("maps decoder failures to a safe typed error", () => {
    vi.spyOn(globalThis, "atob").mockImplementation(() => {
      throw new Error("decoder detail");
    });

    expect(() => decodeCanonicalBase64("YQ==", "private")).toThrowError(
      expect.objectContaining({
        code: "invalid-base64",
        field: "private",
      }),
    );
  });

  it("rejects decoded blobs beyond the binary cap", () => {
    const oversized = new Uint8Array(MAX_KEY_BLOB_BYTES + 1);
    const encoded = encodeBase64(oversized);

    expect(() => decodeCanonicalBase64(encoded, "private")).toThrowError(
      expect.objectContaining({ code: "invalid-base64" }),
    );
  });

  it("accepts a blob exactly at the binary cap", () => {
    const maximum = new Uint8Array(MAX_KEY_BLOB_BYTES);

    expect(decodeCanonicalBase64(encodeBase64(maximum), "public")).toHaveLength(
      MAX_KEY_BLOB_BYTES,
    );
  });

  it("verifies canonical re-encoding after decoding", () => {
    vi.spyOn(globalThis, "atob").mockReturnValue("b");

    expect(() => decodeCanonicalBase64("YQ==", "public")).toThrowError(
      expect.objectContaining({ code: "invalid-base64" }),
    );
  });
});
