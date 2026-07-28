import { KeyParseError, MAX_KEY_BLOB_BYTES } from "./types";
import type { KeyField } from "./types";

const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeCanonicalBase64(
  encoded: string,
  field: KeyField,
): Uint8Array {
  if (
    encoded.length === 0 ||
    encoded.length > Math.ceil((MAX_KEY_BLOB_BYTES * 4) / 3) + 2 ||
    !CANONICAL_BASE64.test(encoded)
  ) {
    throw new KeyParseError("invalid-base64", field);
  }

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new KeyParseError("invalid-base64", field);
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length > MAX_KEY_BLOB_BYTES || encodeBase64(bytes) !== encoded) {
    throw new KeyParseError("invalid-base64", field);
  }
  return bytes;
}
