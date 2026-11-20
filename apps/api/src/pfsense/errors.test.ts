import {describe,expect,it} from "vitest";
import {classifyError,PfSenseApiError} from "./errors.js";
describe("upstream failure classification",()=>{it("preserves classified API failures",()=>{expect(classifyError(new PfSenseApiError("denied","authorization",403))).toBe("authorization");});it("classifies abort timeouts",()=>{const e=new Error("timeout");e.name="TimeoutError";expect(classifyError(e)).toBe("timeout");});it("does not leak arbitrary messages as labels",()=>{expect(classifyError(new Error("arbitrary host and payload"))).toBe("unknown");});});
