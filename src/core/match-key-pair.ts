import { getKeyMetadata } from "./fingerprints";
import { parsePrivateKey, parsePublicKey } from "./parse-key";
import type { MatchResult } from "./types";

export function bytesEqualConstantTimeStyle(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function matchKeyPair(
  publicKeyText: string,
  privateKeyText: string,
): Promise<MatchResult> {
  const publicKey = parsePublicKey(publicKeyText);
  const privateKey = parsePrivateKey(privateKeyText);
  const [publicMetadata, privateMetadata] = await Promise.all([
    getKeyMetadata(publicKey),
    getKeyMetadata(privateKey.publicKey),
  ]);

  return {
    matches: bytesEqualConstantTimeStyle(
      publicKey.wireBytes,
      privateKey.publicKey.wireBytes,
    ),
    publicKey: publicMetadata,
    privateKey: {
      ...privateMetadata,
      isEncrypted: privateKey.isEncrypted,
    },
  };
}
