export const MAX_KEY_INPUT_BYTES = 64 * 1024;
export const MAX_KEY_BLOB_BYTES = 32 * 1024;

export type KeyField = "public" | "private";

export type KeyErrorCode =
  | "empty-input"
  | "input-too-large"
  | "wrong-field"
  | "unsupported-format"
  | "unsupported-key-type"
  | "certificate-not-supported"
  | "invalid-base64"
  | "malformed-key"
  | "key-type-mismatch";

const SAFE_ERROR_MESSAGES: Record<KeyErrorCode, string> = {
  "empty-input": "Paste a key before checking.",
  "input-too-large": "The pasted key is larger than the 64 KiB safety limit.",
  "wrong-field": "This key belongs in the other key field.",
  "unsupported-format":
    "Use an OpenSSH public key or an OPENSSH PRIVATE KEY. For another private-key format, convert a copy locally with ssh-keygen -p -o -f <path>.",
  "unsupported-key-type":
    "Supported keys are Ed25519, RSA, and ECDSA P-256, P-384, or P-521.",
  "certificate-not-supported":
    "OpenSSH certificates are not supported; paste the underlying public key.",
  "invalid-base64": "The key contains invalid or non-canonical base64.",
  "malformed-key": "The key is truncated, corrupted, or structurally invalid.",
  "key-type-mismatch":
    "The public-key label does not match the key type inside its data.",
};

export class KeyParseError extends Error {
  public readonly code: KeyErrorCode;
  public readonly field: KeyField;

  public constructor(code: KeyErrorCode, field: KeyField) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "KeyParseError";
    this.code = code;
    this.field = field;
  }
}

export type SupportedKeyType =
  | "ssh-ed25519"
  | "ssh-rsa"
  | "ecdsa-sha2-nistp256"
  | "ecdsa-sha2-nistp384"
  | "ecdsa-sha2-nistp521";

export type KeyAlgorithm = "Ed25519" | "RSA" | "ECDSA";

export interface ParsedPublicBlob {
  readonly keyType: SupportedKeyType;
  readonly algorithm: KeyAlgorithm;
  readonly bits: number;
  readonly wireBytes: Uint8Array;
}

export interface KeyMetadata {
  readonly keyType: SupportedKeyType;
  readonly algorithm: KeyAlgorithm;
  readonly bits: number;
  readonly sha256Fingerprint: string;
  readonly md5Fingerprint: string;
}

export interface ParsedPublicKey extends ParsedPublicBlob {
  readonly kind: "public";
}

export interface ParsedPrivateKey {
  readonly kind: "private";
  readonly publicKey: ParsedPublicBlob;
  readonly isEncrypted: boolean;
}

export interface MatchResult {
  readonly matches: boolean;
  readonly publicKey: KeyMetadata;
  readonly privateKey: KeyMetadata & { readonly isEncrypted: boolean };
}
