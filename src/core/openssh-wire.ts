import type { KeyAlgorithm, ParsedPublicBlob, SupportedKeyType } from "./types";

export const OPENSSH_MAGIC = new TextEncoder().encode("openssh-key-v1\0");
export const MAX_WIRE_FIELD_BYTES = 16 * 1024;

export type WireErrorCode =
  | "truncated"
  | "field-too-large"
  | "invalid-text"
  | "invalid-mpint"
  | "trailing-data"
  | "invalid-structure";

export class WireFormatError extends Error {
  public readonly code: WireErrorCode;

  public constructor(code: WireErrorCode) {
    super(code);
    this.name = "WireFormatError";
    this.code = code;
  }
}

const asciiDecoder = new TextDecoder("utf-8", { fatal: true });

export class WireReader {
  readonly #data: Uint8Array;
  #offset = 0;

  public constructor(data: Uint8Array) {
    this.#data = data;
  }

  public get remaining(): number {
    return this.#data.length - this.#offset;
  }

  public readUint32(): number {
    if (this.remaining < 4) {
      throw new WireFormatError("truncated");
    }
    const value = new DataView(
      this.#data.buffer,
      this.#data.byteOffset + this.#offset,
      4,
    ).getUint32(0, false);
    this.#offset += 4;
    return value;
  }

  public readBytes(maxLength = MAX_WIRE_FIELD_BYTES): Uint8Array {
    const length = this.readUint32();
    if (length > maxLength) {
      throw new WireFormatError("field-too-large");
    }
    if (length > this.remaining) {
      throw new WireFormatError("truncated");
    }
    const value = this.#data.slice(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }

  public readName(maxLength = 64): string {
    const bytes = this.readBytes(maxLength);
    let value: string;
    try {
      value = asciiDecoder.decode(bytes);
    } catch {
      throw new WireFormatError("invalid-text");
    }
    if (!/^[\x20-\x7e]+$/.test(value)) {
      throw new WireFormatError("invalid-text");
    }
    return value;
  }

  public readPositiveMpint(maxLength = MAX_WIRE_FIELD_BYTES): Uint8Array {
    const bytes = this.readBytes(maxLength);
    const first = bytes.at(0);
    if (first === undefined) {
      throw new WireFormatError("invalid-mpint");
    }
    const second = bytes.at(1);
    if (
      (first === 0 && (second === undefined || (second & 0x80) === 0)) ||
      (first & 0x80) !== 0
    ) {
      throw new WireFormatError("invalid-mpint");
    }
    return first === 0 ? bytes.slice(1) : bytes;
  }

  public ensureConsumed(): void {
    if (this.remaining !== 0) {
      throw new WireFormatError("trailing-data");
    }
  }
}

interface KeyShape {
  readonly algorithm: KeyAlgorithm;
  readonly bits: number;
}

const ECDSA_SHAPES = {
  "ecdsa-sha2-nistp256": {
    curve: "nistp256",
    pointLength: 65,
    bits: 256,
  },
  "ecdsa-sha2-nistp384": {
    curve: "nistp384",
    pointLength: 97,
    bits: 384,
  },
  "ecdsa-sha2-nistp521": {
    curve: "nistp521",
    pointLength: 133,
    bits: 521,
  },
} as const;

function isSupportedKeyType(value: string): value is SupportedKeyType {
  return (
    value === "ssh-ed25519" ||
    value === "ssh-rsa" ||
    value === "ecdsa-sha2-nistp256" ||
    value === "ecdsa-sha2-nistp384" ||
    value === "ecdsa-sha2-nistp521"
  );
}

function parseRsa(reader: WireReader): KeyShape {
  const exponent = reader.readPositiveMpint(8);
  const modulus = reader.readPositiveMpint(2049);
  let exponentValue = 0n;
  for (const byte of exponent) {
    exponentValue = (exponentValue << 8n) | BigInt(byte);
  }
  let bits = 0;
  let leastSignificantByte = 0;
  for (const byte of modulus) {
    bits = bits === 0 ? 8 - (Math.clz32(byte) - (32 - 8)) : bits + 8;
    leastSignificantByte = byte;
  }
  if (
    exponentValue < 3n ||
    (exponentValue & 1n) === 0n ||
    bits < 1024 ||
    bits > 16_384 ||
    (leastSignificantByte & 1) === 0
  ) {
    throw new WireFormatError("invalid-structure");
  }
  return { algorithm: "RSA", bits };
}

function parseEcdsa(
  reader: WireReader,
  keyType: keyof typeof ECDSA_SHAPES,
): KeyShape {
  const shape = ECDSA_SHAPES[keyType];
  const curve = reader.readName();
  const point = reader.readBytes(shape.pointLength);
  if (
    curve !== shape.curve ||
    point.length !== shape.pointLength ||
    point[0] !== 4
  ) {
    throw new WireFormatError("invalid-structure");
  }
  return { algorithm: "ECDSA", bits: shape.bits };
}

export function parsePublicWire(wireBytes: Uint8Array): ParsedPublicBlob {
  const reader = new WireReader(wireBytes);
  const keyType = reader.readName();
  if (!isSupportedKeyType(keyType)) {
    throw new WireFormatError("invalid-structure");
  }

  let shape: KeyShape;
  if (keyType === "ssh-ed25519") {
    const publicKey = reader.readBytes(32);
    if (publicKey.length !== 32) {
      throw new WireFormatError("invalid-structure");
    }
    shape = { algorithm: "Ed25519", bits: 256 };
  } else if (keyType === "ssh-rsa") {
    shape = parseRsa(reader);
  } else {
    shape = parseEcdsa(reader, keyType);
  }
  reader.ensureConsumed();

  return {
    keyType,
    algorithm: shape.algorithm,
    bits: shape.bits,
    wireBytes,
  };
}
