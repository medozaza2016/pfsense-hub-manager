import {describe,expect,it,vi} from "vitest";
import {createPinnedLookup,pfSenseOperations} from "./client.js";

describe("pfSense upstream allowlist",()=>{
 it("contains only the eight approved read-only GET operations",()=>{
  expect(pfSenseOperations).toEqual(["system","gateways","interfaces","services","version","arpTable","firewallStates","firewallStateSize"]);
 });
});

describe("pinned upstream DNS lookup",()=>{
 it("returns only the previously validated IPv4 address",()=>{
  const callback=vi.fn();
  const lookup=createPinnedLookup("firewall.example.net",{address:"192.168.10.1",family:4});
  lookup("firewall.example.net",{all:false},callback);
  expect(callback).toHaveBeenCalledWith(null,"192.168.10.1",4);
 });

 it("supports Node lookup all-address callback mode without re-resolving DNS",()=>{
  const callback=vi.fn();
  const lookup=createPinnedLookup("firewall.example.net",{address:"fd7a:115c:a1e0::1",family:6});
  lookup("firewall.example.net",{all:true},callback);
  expect(callback).toHaveBeenCalledWith(null,[{address:"fd7a:115c:a1e0::1",family:6}]);
 });

 it("rejects attempts to look up a different hostname",()=>{
  const callback=vi.fn();
  const lookup=createPinnedLookup("firewall.example.net",{address:"192.168.10.1",family:4});
  lookup("169.254.169.254",{all:false},callback);
  expect(callback).toHaveBeenCalledOnce();
  expect(callback.mock.calls[0]?.[0]).toMatchObject({code:"ENOTFOUND"});
 });
});
