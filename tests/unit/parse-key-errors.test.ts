import { describe, expect, it } from "vitest";

import { encodeBase64 } from "../../src/core/base64";
import { parsePrivateKey, parsePublicKey } from "../../src/core/parse-key";
import { KeyParseError, MAX_KEY_INPUT_BYTES } from "../../src/core/types";
import type { KeyErrorCode, KeyField } from "../../src/core/types";
import {
  armor,
  concat,
  ecdsaWire,
  ed25519Wire,
  fixture,
  privateContainer,
  publicLine,
  sshBytes,
  sshString,
  uint32,
} from "./core-test-helpers";

function expectKeyError(
  operation: () => unknown,
  code: KeyErrorCode,
  field: KeyField,
): void {
  expect(operation).toThrowError(
    expect.objectContaining({
      name: "KeyParseError",
      code,
      field,
    }),
  );
}

describe("public-line parsing errors", () => {
  it("rejects empty and oversized input before parsing", () => {
    expectKeyError(() => parsePublicKey(" \t\r\n "), "empty-input", "public");
    expectKeyError(
      () => parsePublicKey("a".repeat(MAX_KEY_INPUT_BYTES + 1)),
      "input-too-large",
      "public",
    );
    expectKeyError(
      () => parsePublicKey("😀".repeat(20_000)),
      "input-too-large",
      "public",
    );
  });

  it("accepts input exactly at the documented size cap", () => {
    const base = publicLine("ssh-ed25519", ed25519Wire());
    const maximum = `${base} ${"a".repeat(
      MAX_KEY_INPUT_BYTES - base.length - 1,
    )}`;

    expect(new TextEncoder().encode(maximum)).toHaveLength(MAX_KEY_INPUT_BYTES);
    expect(parsePublicKey(maximum).keyType).toBe("ssh-ed25519");
  });

  it("rejects NUL and non-ASCII structural whitespace", () => {
    expectKeyError(
      () => parsePublicKey("ssh-ed25519\0AAAA"),
      "malformed-key",
      "public",
    );
    expectKeyError(
      () => parsePublicKey("ssh-ed25519\u00a0AAAA"),
      "malformed-key",
      "public",
    );
    expectKeyError(
      () =>
        parsePublicKey(`${publicLine("ssh-ed25519", ed25519Wire())} \ud800`),
      "malformed-key",
      "public",
    );
  });

  it("rejects private keys in the public field", () => {
    expectKeyError(
      () => parsePublicKey(fixture("ed25519-a")),
      "wrong-field",
      "public",
    );
    expectKeyError(
      () => parsePublicKey("-----BEGIN PRIVATE KEY-----\nAAAA"),
      "wrong-field",
      "public",
    );
  });

  it("requires one public-key line", () => {
    expectKeyError(
      () => parsePublicKey(`${fixture("ed25519-a.pub")}extra-line`),
      "malformed-key",
      "public",
    );
  });

  it("distinguishes certificates, unsupported types, and unknown formats", () => {
    expectKeyError(
      () => parsePublicKey("ssh-ed25519-cert-v01@openssh.com AAAA"),
      "certificate-not-supported",
      "public",
    );
    expectKeyError(
      () => parsePublicKey("ssh-dss AAAA"),
      "unsupported-key-type",
      "public",
    );
    expectKeyError(
      () => parsePublicKey("not-a-key AAAA"),
      "unsupported-format",
      "public",
    );
  });

  it("rejects missing data, invalid base64, and malformed wire data", () => {
    expectKeyError(
      () => parsePublicKey("ssh-ed25519"),
      "malformed-key",
      "public",
    );
    expectKeyError(
      () => parsePublicKey("ssh-ed25519 !!!"),
      "invalid-base64",
      "public",
    );
    expectKeyError(
      () => parsePublicKey("ssh-ed25519 AAAA"),
      "malformed-key",
      "public",
    );
  });

  it("validates the textual label against the wire type", () => {
    expectKeyError(
      () => parsePublicKey(publicLine("ssh-rsa", ed25519Wire())),
      "key-type-mismatch",
      "public",
    );
  });

  it("accepts ASCII separators but does not retain arbitrary comments", () => {
    const parsed = parsePublicKey(
      `\t  ${publicLine("ssh-ed25519", ed25519Wire(), "comment 😀")}  \t`,
    );

    expect(parsed).not.toHaveProperty("comment");
    expect(parsed.keyType).toBe("ssh-ed25519");
  });
});

describe("private-container parsing errors", () => {
  it("rejects public keys in the private field", () => {
    expectKeyError(
      () => parsePrivateKey(fixture("ed25519-a.pub")),
      "wrong-field",
      "private",
    );
  });

  it.each([
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
    "-----BEGIN PRIVATE KEY-----",
    "PuTTY-User-Key-File-3: ssh-rsa",
  ])("identifies unsupported private format %s", (header) => {
    expectKeyError(
      () => parsePrivateKey(`${header}\nAAAA`),
      "unsupported-format",
      "private",
    );
  });

  it.each([
    "not a private key",
    "-----BEGIN OPENSSH PRIVATE KEY-----\n-----END OPENSSH PRIVATE KEY-----",
    "wrong\nAAAA\n-----END OPENSSH PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\nwrong",
  ])("requires exact complete OpenSSH armor", (value) => {
    expectKeyError(
      () => parsePrivateKey(value),
      "unsupported-format",
      "private",
    );
  });

  it("rejects empty, overly long, and corrupted armor lines", () => {
    expectKeyError(
      () =>
        parsePrivateKey(
          "-----BEGIN OPENSSH PRIVATE KEY-----\n\nAAAA\n-----END OPENSSH PRIVATE KEY-----",
        ),
      "malformed-key",
      "private",
    );
    expectKeyError(
      () =>
        parsePrivateKey(
          `-----BEGIN OPENSSH PRIVATE KEY-----\n${"A".repeat(71)}\n-----END OPENSSH PRIVATE KEY-----`,
        ),
      "malformed-key",
      "private",
    );
    expectKeyError(
      () =>
        parsePrivateKey(
          "-----BEGIN OPENSSH PRIVATE KEY-----\n!!!!\n-----END OPENSSH PRIVATE KEY-----",
        ),
      "invalid-base64",
      "private",
    );
  });

  it("rejects missing or corrupted OpenSSH magic", () => {
    expectKeyError(
      () => parsePrivateKey(armor(new Uint8Array([1]))),
      "malformed-key",
      "private",
    );
    const wrongMagic = new TextEncoder().encode("openssh-key-v2\0");
    expectKeyError(
      () => parsePrivateKey(armor(privateContainer({ magic: wrongMagic }))),
      "malformed-key",
      "private",
    );
  });

  it("requires consistent unencrypted cipher and KDF fields", () => {
    expectKeyError(
      () => parsePrivateKey(armor(privateContainer({ kdf: "bcrypt" }))),
      "malformed-key",
      "private",
    );
    expectKeyError(
      () =>
        parsePrivateKey(
          armor(
            privateContainer({
              kdfOptions: sshBytes(new Uint8Array([1])),
            }),
          ),
        ),
      "malformed-key",
      "private",
    );
  });

  it("requires a supported encrypted cipher with bcrypt", () => {
    const options = concat(sshBytes(new Uint8Array([1])), uint32(16));
    expectKeyError(
      () =>
        parsePrivateKey(
          armor(
            privateContainer({
              cipher: "unknown",
              kdf: "bcrypt",
              kdfOptions: options,
            }),
          ),
        ),
      "malformed-key",
      "private",
    );
    expectKeyError(
      () =>
        parsePrivateKey(
          armor(
            privateContainer({
              cipher: "aes256-ctr",
              kdf: "none",
              kdfOptions: options,
            }),
          ),
        ),
      "malformed-key",
      "private",
    );
  });

  it("validates bcrypt salt, rounds, and full options consumption", () => {
    const cases = [
      sshBytes(new Uint8Array()),
      concat(sshBytes(new Uint8Array([1])), new Uint8Array([0])),
      concat(sshBytes(new Uint8Array([1])), uint32(0)),
      concat(sshBytes(new Uint8Array([1])), uint32(1), new Uint8Array([0])),
      concat(uint32(65), new Uint8Array(65), uint32(1)),
    ];

    for (const kdfOptions of cases) {
      expectKeyError(
        () =>
          parsePrivateKey(
            armor(
              privateContainer({
                cipher: "aes256-ctr",
                kdf: "bcrypt",
                kdfOptions,
              }),
            ),
          ),
        "malformed-key",
        "private",
      );
    }
  });

  it("accepts a structurally valid encrypted outer container", () => {
    const parsed = parsePrivateKey(
      armor(
        privateContainer({
          cipher: "aes256-ctr",
          kdf: "bcrypt",
          kdfOptions: concat(sshBytes(new Uint8Array([1, 2, 3])), uint32(16)),
          privateBlock: new Uint8Array(16),
        }),
      ),
    );

    expect(parsed.isEncrypted).toBe(true);
    expect(parsed.publicKey.keyType).toBe("ssh-ed25519");
  });

  it("requires exactly one key, a private block, and full consumption", () => {
    for (const container of [
      privateContainer({ keyCount: 0 }),
      privateContainer({ keyCount: 2 }),
      privateContainer({ privateBlock: new Uint8Array() }),
      privateContainer({ trailing: new Uint8Array([1]) }),
    ]) {
      expectKeyError(
        () => parsePrivateKey(armor(container)),
        "malformed-key",
        "private",
      );
    }
  });

  it("validates the embedded public key and container field bounds", () => {
    expectKeyError(
      () =>
        parsePrivateKey(
          armor(privateContainer({ publicWire: sshString("ssh-dss") })),
        ),
      "malformed-key",
      "private",
    );
    expectKeyError(
      () =>
        parsePrivateKey(
          armor(concat(privateContainer().slice(0, -6), uint32(20_000))),
        ),
      "malformed-key",
      "private",
    );
  });

  it("accepts CRLF armor and all supported ECDSA embedded keys", () => {
    for (const type of [
      "ecdsa-sha2-nistp256",
      "ecdsa-sha2-nistp384",
      "ecdsa-sha2-nistp521",
    ] as const) {
      const value = armor(
        privateContainer({ publicWire: ecdsaWire(type) }),
      ).replaceAll("\n", "\r\n");
      expect(parsePrivateKey(value).publicKey.keyType).toBe(type);
    }
  });
});

describe("safe error contract", () => {
  it("provides a fixed message for every typed code without input data", () => {
    const codes: KeyErrorCode[] = [
      "empty-input",
      "input-too-large",
      "wrong-field",
      "unsupported-format",
      "unsupported-key-type",
      "certificate-not-supported",
      "invalid-base64",
      "malformed-key",
      "key-type-mismatch",
    ];

    for (const code of codes) {
      const error = new KeyParseError(code, "private");
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.message).not.toContain("PRIVATE KEY-----");
    }
  });

  it("rejects a non-canonical public blob even with a supported prefix", () => {
    const wire = ed25519Wire();
    const nonCanonical = `${encodeBase64(wire).replace(/=+$/, "")}=`;

    expectKeyError(
      () => parsePublicKey(`ssh-ed25519 ${nonCanonical}`),
      "invalid-base64",
      "public",
    );
  });

  it("rejects curve/type disagreement inside a public blob", () => {
    const wire = concat(
      sshString("ecdsa-sha2-nistp256"),
      sshString("nistp384"),
      sshBytes(new Uint8Array(65).fill(4)),
    );

    expectKeyError(
      () => parsePublicKey(publicLine("ecdsa-sha2-nistp256", wire)),
      "malformed-key",
      "public",
    );
  });
});
