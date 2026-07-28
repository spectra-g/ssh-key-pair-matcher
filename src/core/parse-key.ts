import { decodeCanonicalBase64 } from "./base64";
import {
  OPENSSH_MAGIC,
  WireFormatError,
  WireReader,
  parsePublicWire,
} from "./openssh-wire";
import { KeyParseError, MAX_KEY_INPUT_BYTES } from "./types";
import type {
  KeyField,
  ParsedPrivateKey,
  ParsedPublicKey,
  SupportedKeyType,
} from "./types";

const PRIVATE_ARMOR_LABEL = ["OPENSSH", "PRIVATE", "KEY"].join(" ");
const PRIVATE_HEADER = ["-----BEGIN", `${PRIVATE_ARMOR_LABEL}-----`].join(" ");
const PRIVATE_FOOTER = ["-----END", `${PRIVATE_ARMOR_LABEL}-----`].join(" ");
const NON_OPENSSH_PRIVATE_HEADERS = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
  "-----BEGIN PRIVATE KEY-----",
  "PuTTY-User-Key-File-",
] as const;
const SUPPORTED_KEY_TYPES = new Set<SupportedKeyType>([
  "ssh-ed25519",
  "ssh-rsa",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
]);
const SUPPORTED_CIPHERS = new Set([
  "aes128-cbc",
  "aes192-cbc",
  "aes256-cbc",
  "aes128-ctr",
  "aes192-ctr",
  "aes256-ctr",
  "aes128-gcm@openssh.com",
  "aes256-gcm@openssh.com",
  "chacha20-poly1305@openssh.com",
]);
const NON_ASCII_WHITESPACE =
  /[\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;
const UNPAIRED_SURROGATE =
  /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

function validateInput(text: string, field: KeyField): string {
  const trimmed = text.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
  if (trimmed.length === 0) {
    throw new KeyParseError("empty-input", field);
  }
  if (
    text.length > MAX_KEY_INPUT_BYTES ||
    new TextEncoder().encode(text).length > MAX_KEY_INPUT_BYTES
  ) {
    throw new KeyParseError("input-too-large", field);
  }
  if (
    text.includes("\0") ||
    NON_ASCII_WHITESPACE.test(text) ||
    UNPAIRED_SURROGATE.test(text)
  ) {
    throw new KeyParseError("malformed-key", field);
  }
  return trimmed;
}

function parseAndValidatePublicWire(encoded: string, field: KeyField) {
  const wireBytes = decodeCanonicalBase64(encoded, field);
  try {
    return parsePublicWire(wireBytes);
  } catch {
    throw new KeyParseError("malformed-key", field);
  }
}

function looksLikePublicKey(value: string): boolean {
  const label = value.split(/[ \t]/, 1)[0] as string;
  return (
    label.startsWith("ssh-") ||
    label.startsWith("ecdsa-") ||
    label.startsWith("sk-")
  );
}

export function parsePublicKey(text: string): ParsedPublicKey {
  const value = validateInput(text, "public");
  if (
    value.includes(PRIVATE_HEADER) ||
    NON_OPENSSH_PRIVATE_HEADERS.some((header) => value.startsWith(header))
  ) {
    throw new KeyParseError("wrong-field", "public");
  }
  if (value.includes("\n") || value.includes("\r")) {
    throw new KeyParseError("malformed-key", "public");
  }

  const parts = value.split(/[ \t]+/);
  const label = parts[0] as string;
  const encoded = parts[1];
  if (label.includes("-cert-v01@openssh.com")) {
    throw new KeyParseError("certificate-not-supported", "public");
  }
  if (!SUPPORTED_KEY_TYPES.has(label as SupportedKeyType)) {
    throw new KeyParseError(
      looksLikePublicKey(value) ? "unsupported-key-type" : "unsupported-format",
      "public",
    );
  }
  if (encoded === undefined) {
    throw new KeyParseError("malformed-key", "public");
  }

  const parsed = parseAndValidatePublicWire(encoded, "public");
  if (parsed.keyType !== label) {
    throw new KeyParseError("key-type-mismatch", "public");
  }
  return { ...parsed, kind: "public" };
}

function hasMagic(blob: Uint8Array): boolean {
  if (blob.length < OPENSSH_MAGIC.length) {
    return false;
  }
  return OPENSSH_MAGIC.every((byte, index) => blob[index] === byte);
}

function validateEncryptionHeader(
  cipher: string,
  kdf: string,
  kdfOptions: Uint8Array,
): boolean {
  if (cipher === "none") {
    if (kdf !== "none" || kdfOptions.length !== 0) {
      throw new WireFormatError("invalid-structure");
    }
    return false;
  }
  if (!SUPPORTED_CIPHERS.has(cipher) || kdf !== "bcrypt") {
    throw new WireFormatError("invalid-structure");
  }
  const optionsReader = new WireReader(kdfOptions);
  const salt = optionsReader.readBytes(64);
  const rounds = optionsReader.readUint32();
  optionsReader.ensureConsumed();
  if (salt.length === 0 || rounds === 0) {
    throw new WireFormatError("invalid-structure");
  }
  return true;
}

function parsePrivateContainer(blob: Uint8Array): ParsedPrivateKey {
  if (!hasMagic(blob)) {
    throw new WireFormatError("invalid-structure");
  }
  const reader = new WireReader(blob.slice(OPENSSH_MAGIC.length));
  const cipher = reader.readName();
  const kdf = reader.readName();
  const kdfOptions = reader.readBytes(256);
  const isEncrypted = validateEncryptionHeader(cipher, kdf, kdfOptions);
  if (reader.readUint32() !== 1) {
    throw new WireFormatError("invalid-structure");
  }
  const publicWire = reader.readBytes();
  const privateBlock = reader.readBytes();
  reader.ensureConsumed();
  if (privateBlock.length === 0) {
    throw new WireFormatError("invalid-structure");
  }
  const publicKey = parsePublicWire(publicWire);
  return { kind: "private", publicKey, isEncrypted };
}

export function parsePrivateKey(text: string): ParsedPrivateKey {
  const value = validateInput(text, "private");
  if (looksLikePublicKey(value)) {
    throw new KeyParseError("wrong-field", "private");
  }
  if (NON_OPENSSH_PRIVATE_HEADERS.some((header) => value.startsWith(header))) {
    throw new KeyParseError("unsupported-format", "private");
  }

  const lines = value.split(/\r?\n/);
  if (
    lines.length < 3 ||
    lines[0] !== PRIVATE_HEADER ||
    lines[lines.length - 1] !== PRIVATE_FOOTER
  ) {
    throw new KeyParseError("unsupported-format", "private");
  }
  const bodyLines = lines.slice(1, -1);
  if (bodyLines.some((line) => line.length === 0 || line.length > 70)) {
    throw new KeyParseError("malformed-key", "private");
  }

  const blob = decodeCanonicalBase64(bodyLines.join(""), "private");
  try {
    return parsePrivateContainer(blob);
  } catch {
    throw new KeyParseError("malformed-key", "private");
  }
}
