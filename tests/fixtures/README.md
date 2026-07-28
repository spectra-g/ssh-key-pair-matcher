# Disposable SSH test fixtures

These keys are public test material generated independently with the operating
system's OpenSSH `ssh-keygen` (OpenSSH 9.9p1) on 28 July 2026. They exist only
to verify this project's parser and matcher.

**Never install, authorize, reuse, or trust any of these keys for access.** The
private keys are deliberately committed to a public-source project.

The set covers:

- two independent Ed25519 pairs, including an encrypted private key;
- RSA 2048 and RSA 3072 pairs, including an encrypted private key;
- ECDSA P-256 (two independent pairs), P-384, and P-521.

The encrypted fixtures use the disposable passphrase `fixture-passphrase`.
Matching does not use that passphrase: an OpenSSH v1 private container exposes
its public component in the outer, unencrypted header.

`expected.tsv` records the key type, exact bit length, SHA-256 fingerprint, and
legacy MD5 fingerprint reported by `ssh-keygen -lf`. Run
`./scripts/verify-fixtures.sh` to re-check those values and independently derive
public keys from every unencrypted private fixture.
