import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getKeyMetadata } from "../../src/core/fingerprints";
import {
  bytesEqualConstantTimeStyle,
  matchKeyPair,
} from "../../src/core/match-key-pair";
import { parsePrivateKey, parsePublicKey } from "../../src/core/parse-key";
import { KeyParseError } from "../../src/core/types";
import { fixture, fixturesDirectory } from "./core-test-helpers";

interface ExpectedFixture {
  fixture: string;
  keyType: string;
  bits: number;
  sha256: string;
  md5: string;
  encrypted: boolean;
}

function expectedFixtures(): ExpectedFixture[] {
  const rows = readFileSync(resolve(fixturesDirectory, "expected.tsv"), "utf8")
    .trim()
    .split("\n")
    .slice(1);
  return rows.map((row) => {
    const [name, keyType, bits, sha256, md5, encrypted] = row.split("\t");
    if (
      name === undefined ||
      keyType === undefined ||
      bits === undefined ||
      sha256 === undefined ||
      md5 === undefined ||
      encrypted === undefined
    ) {
      throw new Error("Invalid fixture metadata.");
    }
    return {
      fixture: name,
      keyType,
      bits: Number(bits),
      sha256,
      md5,
      encrypted: encrypted === "true",
    };
  });
}

describe("independent OpenSSH fixtures", () => {
  for (const expected of expectedFixtures()) {
    it(`parses, fingerprints, and matches ${expected.fixture}`, async () => {
      const publicText = fixture(`${expected.fixture}.pub`);
      const privateText = fixture(expected.fixture);
      const parsedPublic = parsePublicKey(publicText);
      const parsedPrivate = parsePrivateKey(privateText);
      const metadata = await getKeyMetadata(parsedPublic);
      const result = await matchKeyPair(publicText, privateText);

      expect(parsedPublic.keyType).toBe(expected.keyType);
      expect(parsedPublic.bits).toBe(expected.bits);
      expect(parsedPrivate.publicKey.keyType).toBe(expected.keyType);
      expect(parsedPrivate.publicKey.bits).toBe(expected.bits);
      expect(parsedPrivate.isEncrypted).toBe(expected.encrypted);
      expect(metadata).toMatchObject({
        bits: expected.bits,
        sha256Fingerprint: expected.sha256,
        md5Fingerprint: expected.md5,
      });
      expect(result).toEqual({
        matches: true,
        publicKey: metadata,
        privateKey: { ...metadata, isEncrypted: expected.encrypted },
      });
    });
  }

  it("returns metadata for both sides of a mismatch", async () => {
    const result = await matchKeyPair(
      fixture("ecdsa-p256-a.pub"),
      fixture("ecdsa-p256-b"),
    );

    expect(result.matches).toBe(false);
    expect(result.publicKey.sha256Fingerprint).toBe(
      "SHA256:BNlzYTaRGB49/EalWaeVxK0OZ2RUu1x+fCoqYrRqUtk",
    );
    expect(result.privateKey.sha256Fingerprint).toBe(
      "SHA256:G735TICiClSL13caGjB/UcTsaihJKkhmX6Igru41JqM",
    );
  });

  it("compares all bytes even when lengths or contents differ", () => {
    expect(
      bytesEqualConstantTimeStyle(
        new Uint8Array([1, 2]),
        new Uint8Array([1, 2]),
      ),
    ).toBe(true);
    expect(
      bytesEqualConstantTimeStyle(
        new Uint8Array([1, 2]),
        new Uint8Array([1, 3]),
      ),
    ).toBe(false);
    expect(
      bytesEqualConstantTimeStyle(new Uint8Array([1]), new Uint8Array([1, 0])),
    ).toBe(false);
    expect(
      bytesEqualConstantTimeStyle(new Uint8Array([1, 0]), new Uint8Array([1])),
    ).toBe(false);

    const reads = { left: 0, right: 0 };
    const tracked = (value: number[], side: keyof typeof reads): Uint8Array =>
      new Proxy(new Uint8Array(value), {
        get(target, property) {
          if (typeof property === "string" && /^\d+$/u.test(property)) {
            reads[side] += 1;
          }
          return Reflect.get(target, property, target) as unknown;
        },
      });
    expect(
      bytesEqualConstantTimeStyle(
        tracked([1], "left"),
        tracked([1, 0], "right"),
      ),
    ).toBe(false);
    expect(reads).toEqual({ left: 2, right: 2 });
  });

  it("uses typed, field-specific, safe errors", () => {
    const privateKey = fixture("ed25519-a");
    const arbitraryComment = "do-not-echo-this-comment";

    try {
      parsePublicKey(`not-a-key value ${arbitraryComment}`);
      throw new Error("Expected parsing to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(KeyParseError);
      expect(error).toMatchObject({
        name: "KeyParseError",
        code: "unsupported-format",
        field: "public",
      });
      expect(String(error)).not.toContain(arbitraryComment);
      expect(String(error)).not.toContain(privateKey);
    }
  });
});
