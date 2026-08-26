import { timingSafeEqual } from "crypto";

// Constant-time string compare. Length is not itself secret for our fixed-length
// tokens, so a length mismatch can short-circuit; equal-length inputs are
// compared without a timing side-channel (timingSafeEqual requires equal length).
export function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Verify an `Authorization: Bearer <secret>` header in constant time. Fails
// closed when the secret is unset (no bypass via a missing env var).
export function bearerOk(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false;
  return safeEqualStr(authHeader, `Bearer ${secret}`);
}
