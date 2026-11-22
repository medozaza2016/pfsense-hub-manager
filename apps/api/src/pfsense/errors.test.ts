import {describe,expect,it} from "vitest";
import {classifyError,findUpstreamErrorCode,hasTlsFailure,PfSenseApiError} from "./errors.js";

describe("upstream failure classification",()=>{
 it("preserves classified API failures",()=>{
  expect(classifyError(new PfSenseApiError("denied","authorization",403))).toBe("authorization");
 });
 it("classifies abort timeouts",()=>{
  const error=new Error("timeout");
  error.name="TimeoutError";
  expect(classifyError(error)).toBe("timeout");
 });
 it("does not leak arbitrary messages as labels",()=>{
  expect(classifyError(new Error("arbitrary host and payload"))).toBe("unknown");
 });
 it("finds a safe TLS diagnostic code through nested fetch causes",()=>{
  const root=Object.assign(new Error("certificate verify failed"),{code:"SELF_SIGNED_CERT_IN_CHAIN"});
  const wrapped=Object.assign(new Error("fetch failed"),{cause:root});
  expect(hasTlsFailure(wrapped)).toBe(true);
  expect(findUpstreamErrorCode(wrapped)).toBe("SELF_SIGNED_CERT_IN_CHAIN");
 });
 it("walks non-Error cause objects used by transport wrappers",()=>{
  const wrapped={message:"request failed",cause:{code:"ERR_TLS_CERT_ALTNAME_INVALID",message:"hostname mismatch"}};
  expect(hasTlsFailure(wrapped)).toBe(true);
  expect(findUpstreamErrorCode(wrapped)).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
  expect(classifyError(wrapped)).toBe("tls");
 });
 it("handles cyclic cause chains without looping",()=>{
  const wrapped:{message:string;cause?:unknown}={message:"request failed"};
  wrapped.cause=wrapped;
  expect(hasTlsFailure(wrapped)).toBe(false);
  expect(findUpstreamErrorCode(wrapped)).toBeUndefined();
 });
 it("does not expose untrusted error messages as diagnostic codes",()=>{
  expect(findUpstreamErrorCode(new Error("private host and payload"))).toBeUndefined();
 });
});
