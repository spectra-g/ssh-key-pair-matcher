import { describe, expect, it } from "vitest";

import {
  MAX_WIRE_FIELD_BYTES,
  WireFormatError,
  WireReader,
  parsePublicWire,
} from "../../src/core/openssh-wire";
import {
  concat,
  ecdsaWire,
  ed25519Wire,
  positiveMpint,
  rsaWire,
  sshBytes,
  sshString,
  uint32,
} from "./core-test-helpers";

function expectWireError(
  operation: () => unknown,
  code: WireFormatError["code"],
): void {
  expect(operation).toThrowError(expect.objectContaining({ code }));
}

describe("bounded SSH wire reads", () => {
  it("reads uint32 values and tracks remaining bytes", () => {
    expect(new WireFormatError("truncated")).toMatchObject({
      name: "WireFormatError",
      code: "truncated",
    });
    const reader = new WireReader(
      concat(uint32(0x01020304), new Uint8Array([9])),
    );

    expect(reader.remaining).toBe(5);
    expect(reader.readUint32()).toBe(0x01020304);
    expect(reader.remaining).toBe(1);
    expectWireError(() => reader.readUint32(), "truncated");
  });

  it("reads bounded byte strings", () => {
    const reader = new WireReader(
      concat(sshBytes(new Uint8Array([1, 2])), uint32(3), new Uint8Array([1])),
    );

    expect(reader.readBytes()).toEqual(new Uint8Array([1, 2]));
    expectWireError(() => reader.readBytes(), "truncated");
    expectWireError(
      () => new WireReader(uint32(MAX_WIRE_FIELD_BYTES + 1)).readBytes(),
      "field-too-large",
    );
    expect(
      new WireReader(
        sshBytes(new Uint8Array(MAX_WIRE_FIELD_BYTES)),
      ).readBytes(),
    ).toHaveLength(MAX_WIRE_FIELD_BYTES);
  });

  it("requires printable UTF-8 names", () => {
    expect(new WireReader(sshString("ssh-rsa")).readName()).toBe("ssh-rsa");
    expectWireError(
      () => new WireReader(sshBytes(new Uint8Array([0xff]))).readName(),
      "invalid-text",
    );
    expectWireError(
      () => new WireReader(sshBytes(new Uint8Array([0x0a]))).readName(),
      "invalid-text",
    );
    for (const invalid of [
      new Uint8Array([0x0a, 0x61]),
      new Uint8Array([0x61, 0x0a]),
    ]) {
      expectWireError(
        () => new WireReader(sshBytes(invalid)).readName(),
        "invalid-text",
      );
    }
  });

  it("requires canonical positive mpints", () => {
    expect(
      new WireReader(sshBytes(new Uint8Array([1]))).readPositiveMpint(),
    ).toEqual(new Uint8Array([1]));
    expect(
      new WireReader(sshBytes(new Uint8Array([0, 0x80]))).readPositiveMpint(),
    ).toEqual(new Uint8Array([0x80]));

    for (const invalid of [
      new Uint8Array(),
      new Uint8Array([0]),
      new Uint8Array([0, 1]),
      new Uint8Array([0x80]),
    ]) {
      expectWireError(
        () => new WireReader(sshBytes(invalid)).readPositiveMpint(),
        "invalid-mpint",
      );
    }
  });

  it("detects trailing data", () => {
    new WireReader(new Uint8Array()).ensureConsumed();
    expectWireError(
      () => new WireReader(new Uint8Array([1])).ensureConsumed(),
      "trailing-data",
    );
  });
});

describe("public-key wire validation", () => {
  it("accepts every supported key shape", () => {
    expect(parsePublicWire(ed25519Wire())).toMatchObject({
      keyType: "ssh-ed25519",
      algorithm: "Ed25519",
      bits: 256,
    });
    expect(parsePublicWire(rsaWire())).toMatchObject({
      keyType: "ssh-rsa",
      algorithm: "RSA",
      bits: 1024,
    });
    expect(parsePublicWire(rsaWire(new Uint8Array([3])))).toMatchObject({
      bits: 1024,
    });
    const maximumRsaModulus = new Uint8Array(2048);
    maximumRsaModulus[0] = 0x80;
    maximumRsaModulus[maximumRsaModulus.length - 1] = 1;
    expect(
      parsePublicWire(rsaWire(undefined, maximumRsaModulus)),
    ).toMatchObject({ bits: 16_384 });
    expect(parsePublicWire(ecdsaWire())).toMatchObject({
      keyType: "ecdsa-sha2-nistp256",
      algorithm: "ECDSA",
      bits: 256,
    });
    expect(parsePublicWire(ecdsaWire("ecdsa-sha2-nistp384"))).toMatchObject({
      bits: 384,
    });
    expect(parsePublicWire(ecdsaWire("ecdsa-sha2-nistp521"))).toMatchObject({
      bits: 521,
    });
  });

  it("rejects unsupported types and malformed Ed25519 keys", () => {
    expectWireError(
      () => parsePublicWire(sshString("ssh-dss")),
      "invalid-structure",
    );
    expectWireError(
      () =>
        parsePublicWire(
          concat(sshString("ssh-ed25519"), sshBytes(new Uint8Array(31))),
        ),
      "invalid-structure",
    );
    expectWireError(
      () => parsePublicWire(concat(ed25519Wire(), new Uint8Array([0]))),
      "trailing-data",
    );
  });

  it.each([
    [new Uint8Array([1]), undefined, "exponent below three"],
    [new Uint8Array([4]), undefined, "even exponent"],
    [
      undefined,
      (() => {
        const value = new Uint8Array(127);
        value[0] = 0x80;
        value[value.length - 1] = 1;
        return value;
      })(),
      "modulus below 1024 bits",
    ],
    [
      undefined,
      (() => {
        const value = new Uint8Array(128);
        value[0] = 0x40;
        value[value.length - 1] = 1;
        return value;
      })(),
      "partial-byte modulus below 1024 bits",
    ],
    [
      undefined,
      (() => {
        const value = new Uint8Array(2049);
        value[0] = 1;
        value[value.length - 1] = 1;
        return value;
      })(),
      "modulus above 16384 bits",
    ],
    [
      undefined,
      (() => {
        const value = new Uint8Array(128);
        value[0] = 0x80;
        value[value.length - 1] = 2;
        return value;
      })(),
      "even modulus",
    ],
  ])(
    "rejects invalid RSA structure: %s %s %s",
    (exponent, modulus, description) => {
      expect(description).toBeTypeOf("string");
      expectWireError(
        () => parsePublicWire(rsaWire(exponent, modulus)),
        "invalid-structure",
      );
    },
  );

  it("bounds RSA exponent and modulus fields", () => {
    expectWireError(
      () =>
        parsePublicWire(
          concat(
            sshString("ssh-rsa"),
            positiveMpint(new Uint8Array(9).fill(1)),
            positiveMpint(new Uint8Array(128).fill(1)),
          ),
        ),
      "field-too-large",
    );
    expectWireError(
      () =>
        parsePublicWire(
          concat(
            sshString("ssh-rsa"),
            positiveMpint(new Uint8Array([3])),
            uint32(2050),
          ),
        ),
      "field-too-large",
    );
  });

  it("requires the ECDSA curve, point length, and uncompressed prefix", () => {
    expectWireError(
      () => parsePublicWire(ecdsaWire("ecdsa-sha2-nistp256", "nistp384")),
      "invalid-structure",
    );
    expectWireError(
      () => parsePublicWire(ecdsaWire("ecdsa-sha2-nistp256", "nistp256", 64)),
      "invalid-structure",
    );
    expectWireError(
      () =>
        parsePublicWire(ecdsaWire("ecdsa-sha2-nistp256", "nistp256", 65, 3)),
      "invalid-structure",
    );
  });
});
