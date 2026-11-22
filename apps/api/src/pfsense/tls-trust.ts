import { X509Certificate } from "node:crypto";

const MAX_CA_BUNDLE_BYTES = 64 * 1024;
const MAX_CA_CERTIFICATES = 8;
const CERTIFICATE_BLOCK = /-----BEGIN CERTIFICATE-----[\\s\\S]+?-----END CERTIFICATE-----/g;

/**
 * Validates administrator-supplied trust anchors before they are persisted.
 * Accepts CA certificates and explicitly self-signed certificates, allowing
 * pfSense installations that use their own self-signed web certificate.
 */
export function normalizeDeviceCaBundle(input: string): string {
  if (typeof input !== "string" || input.length === 0 || Buffer.byteLength(input, "utf8") > MAX_CA_BUNDLE_BYTES) {
    throw new Error("The custom TLS trust bundle must be between 1 byte and 64 KB.");
  }

  const blocks = input.match(CERTIFICATE_BLOCK) ?? [];
  const remainder = input.replace(CERTIFICATE_BLOCK, "").trim();
  if (blocks.length === 0 || blocks.length > MAX_CA_CERTIFICATES || remainder.length > 0) {
    throw new Error("Provide one to eight PEM-encoded X.509 certificates and no other content.");
  }

  const now = Date.now();
  const normalized = blocks.map(block => {
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(block);
    } catch {
      throw new Error("The custom TLS trust bundle contains an invalid X.509 certificate.");
    }

    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || now < validFrom || now > validTo) {
      throw new Error("The custom TLS trust bundle contains a certificate that is not currently valid.");
    }

    const isSelfSigned = certificate.checkIssued(certificate) && certificate.verify(certificate.publicKey);
    if (!certificate.ca && !isSelfSigned) {
      throw new Error("Each custom TLS trust certificate must be a CA certificate or a valid self-signed certificate.");
    }

    return certificate.toString();
  });

  return normalized.join("\\n");
}
