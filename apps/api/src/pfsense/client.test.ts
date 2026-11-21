import {describe,expect,it} from "vitest";
import {pfSenseOperations} from "./client.js";
describe("pfSense upstream allowlist",()=>{it("contains only the approved read-only GET operations",()=>{expect(pfSenseOperations).toEqual(["system","gateways","interfaces","services","version","arpTable","firewallStates","firewallStateSize","firewallRules","interfaceAssignments","restApiVersion"]);});});
