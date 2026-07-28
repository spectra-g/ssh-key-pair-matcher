import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { encodeBase64 } from "../../src/core/base64";
import { OPENSSH_MAGIC } from "../../src/core/openssh-wire";

export const fixturesDirectory = resolve("tests/fixtures");

export function fixture(name: string): string {
  return readFileSync(resolve(fixturesDirectory, name), "utf8");
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function uint32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value, false);
  return result;
}

export function sshBytes(value: Uint8Array): Uint8Array {
  return concat(uint32(value.length), value);
}

export function sshString(value: string): Uint8Array {
  return sshBytes(new TextEncoder().encode(value));
}

export function publicLine(
  label: string,
  wire: Uint8Array,
  comment = "",
): string {
  return `${label} ${encodeBase64(wire)}${comment.length > 0 ? ` ${comment}` : ""}`;
}

export function ed25519Wire(key = new Uint8Array(32).fill(7)): Uint8Array {
  return concat(sshString("ssh-ed25519"), sshBytes(key));
}

export function positiveMpint(value: Uint8Array): Uint8Array {
  if ((value[0] ?? 0) >= 0x80) {
    return sshBytes(concat(new Uint8Array([0]), value));
  }
  return sshBytes(value);
}

export function rsaWire(
  exponent = new Uint8Array([1, 0, 1]),
  modulus = (() => {
    const value = new Uint8Array(128);
    value[0] = 0x80;
    value[value.length - 1] = 1;
    return value;
  })(),
): Uint8Array {
  return concat(
    sshString("ssh-rsa"),
    positiveMpint(exponent),
    positiveMpint(modulus),
  );
}

export function ecdsaWire(
  type:
    | "ecdsa-sha2-nistp256"
    | "ecdsa-sha2-nistp384"
    | "ecdsa-sha2-nistp521" = "ecdsa-sha2-nistp256",
  curve = type.replace("ecdsa-sha2-", ""),
  pointLength = type.endsWith("256") ? 65 : type.endsWith("384") ? 97 : 133,
  prefix = 4,
): Uint8Array {
  const point = new Uint8Array(pointLength).fill(1);
  point[0] = prefix;
  return concat(sshString(type), sshString(curve), sshBytes(point));
}

export interface ContainerOptions {
  cipher?: string;
  kdf?: string;
  kdfOptions?: Uint8Array;
  keyCount?: number;
  publicWire?: Uint8Array;
  privateBlock?: Uint8Array;
  trailing?: Uint8Array;
  magic?: Uint8Array;
}

export function privateContainer({
  cipher = "none",
  kdf = "none",
  kdfOptions = new Uint8Array(),
  keyCount = 1,
  publicWire = ed25519Wire(),
  privateBlock = new Uint8Array([1]),
  trailing = new Uint8Array(),
  magic = OPENSSH_MAGIC,
}: ContainerOptions = {}): Uint8Array {
  return concat(
    magic,
    sshString(cipher),
    sshString(kdf),
    sshBytes(kdfOptions),
    uint32(keyCount),
    sshBytes(publicWire),
    sshBytes(privateBlock),
    trailing,
  );
}

export function armor(blob: Uint8Array, lineLength = 70): string {
  const encoded = encodeBase64(blob);
  const lines: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += lineLength) {
    lines.push(encoded.slice(offset, offset + lineLength));
  }
  return [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    ...lines,
    "-----END OPENSSH PRIVATE KEY-----",
  ].join("\n");
}
