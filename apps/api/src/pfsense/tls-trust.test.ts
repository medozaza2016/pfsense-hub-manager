import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDeviceCaBundle } from "./tls-trust.js";

const certificate = readFileSync(new URL("./fixtures/firewall-test-cert.pem", import.meta.url), "utf8");
const privateKey = readFileSync(new URL("./fixtures/firewall-test-key.pem", import.meta.url), "utf8");
const pfSenseNonCaCertificate = readFileSync(new URL("./fixtures/pfsense-non-ca-self-signed-cert.pem", import.meta.url), "utf8");

describe("per-device TLS trust bundle validation", () => {
  it("accepts and normalizes a valid self-signed firewall certificate", () => {
    const normalized = normalizeDeviceCaBundle(certificate);
    expect(normalized).toContain("-----BEGIN CERTIFICATE-----");
    expect(normalized).toContain("-----END CERTIFICATE-----");
  });

  it("accepts a valid self-signed pfSense certificate that is not marked as a CA", () => {
    const normalized = normalizeDeviceCaBundle(pfSenseNonCaCertificate);
    expect(normalized).toContain("-----BEGIN CERTIFICATE-----");
    expect(normalized).toContain("-----END CERTIFICATE-----");
  });

  it("accepts a PEM bundle containing multiple trusted certificates", () => {
    const normalized = normalizeDeviceCaBundle(certificate + "\n" + certificate);
    expect(normalized.match(/-----BEGIN CERTIFICATE-----/g)).toHaveLength(2);
  });

  it("rejects private keys and unrelated PEM content", () => {
    expect(() => normalizeDeviceCaBundle(privateKey)).toThrow(/PEM-encoded X.509 certificates/);
    expect(() => normalizeDeviceCaBundle(certificate + "\nnot-a-certificate")).toThrow(/no other content/);
  });

  it("rejects malformed, empty, and oversized input", () => {
    expect(() => normalizeDeviceCaBundle("")).toThrow(/1 byte and 64 KB/);
    expect(() => normalizeDeviceCaBundle("not a certificate")).toThrow(/PEM-encoded X.509 certificates/);
    expect(() => normalizeDeviceCaBundle("x".repeat(65 * 1024))).toThrow(/1 byte and 64 KB/);
  });

  it("rejects more than eight certificates", () => {
    expect(() => normalizeDeviceCaBundle(Array.from({ length: 9 }, () => certificate).join("\n"))).toThrow(/one to eight/);
  });
});
