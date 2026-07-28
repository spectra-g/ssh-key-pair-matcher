import { md5 } from "@noble/hashes/legacy.js";

import { encodeBase64 } from "./base64";
import type { KeyMetadata, ParsedPublicBlob } from "./types";

function colonHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ":",
  );
}

export async function getKeyMetadata(
  parsed: ParsedPublicBlob,
): Promise<KeyMetadata> {
  const digestInput = new Uint8Array(parsed.wireBytes.length);
  digestInput.set(parsed.wireBytes);
  const sha256 = new Uint8Array(
    await crypto.subtle.digest("SHA-256", digestInput),
  );
  return {
    keyType: parsed.keyType,
    algorithm: parsed.algorithm,
    bits: parsed.bits,
    sha256Fingerprint: `SHA256:${encodeBase64(sha256).replace(/=+$/, "")}`,
    md5Fingerprint: `MD5:${colonHex(md5(parsed.wireBytes))}`,
  };
}
