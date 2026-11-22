import {readFileSync} from "node:fs";
import {createServer} from "node:https";
import {checkServerIdentity} from "node:tls";
import type {AddressInfo} from "node:net";
import {Agent,fetch} from "undici";
import {describe,expect,it,vi} from "vitest";
import {createPinnedLookup,pfSenseOperations,selectTlsCa,validatePfSenseOperationData,type PfSenseOperation} from "./client.js";
import {PfSenseApiError} from "./errors.js";

const testCertificate=readFileSync(new URL("./fixtures/firewall-test-cert.pem",import.meta.url));
const testPrivateKey=readFileSync(new URL("./fixtures/firewall-test-key.pem",import.meta.url));

async function withTlsServer<T>(work:(port:number)=>Promise<T>):Promise<T>{
 const server=createServer({cert:testCertificate,key:testPrivateKey},(_request,response)=>{
  response.writeHead(200,{"content-type":"text/plain"});
  response.end("connected");
 });
 await new Promise<void>((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",()=>resolve());
 });
 const address=server.address();
 if(!address||typeof address==="string"){
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  throw new Error("Test TLS server did not bind to a TCP port.");
 }
 try{return await work((address as AddressInfo).port);}
 finally{
  await new Promise<void>((resolve,reject)=>{
   server.close(error=>error?reject(error):resolve());
  });
 }
}

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

describe("Undici pinned HTTPS integration",()=>{
 it("connects to the pinned address and validates the matching TLS hostname",async()=>{
  await withTlsServer(async port=>{
   const dispatcher=new Agent({connect:{
    ca:testCertificate,
    rejectUnauthorized:true,
    lookup:createPinnedLookup("firewall.test",{address:"127.0.0.1",family:4})
   }});
   try{
    const response=await fetch(`https://firewall.test:${port}/`,{dispatcher});
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("connected");
   }finally{await dispatcher.close();}
  });
 });

 it("supports a TLS server-name override when the firewall URL uses an IP address",async()=>{
  await withTlsServer(async port=>{
   const dispatcher=new Agent({connect:{
    ca:testCertificate,
    rejectUnauthorized:true,
    servername:"firewall.test",
    checkServerIdentity:(_hostname,certificate)=>checkServerIdentity("firewall.test",certificate)
   }});
   try{
    const response=await fetch(`https://127.0.0.1:${port}/`,{dispatcher});
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("connected");
   }finally{await dispatcher.close();}
  });
 });

 it("rejects a trusted certificate when the explicit TLS server name does not match",async()=>{
  await withTlsServer(async port=>{
   const dispatcher=new Agent({connect:{
    ca:testCertificate,
    rejectUnauthorized:true,
    servername:"wrong-firewall.test",
    checkServerIdentity:(_hostname,certificate)=>checkServerIdentity("wrong-firewall.test",certificate)
   }});
   let failure:unknown;
   try{
    await fetch(`https://127.0.0.1:${port}/`,{dispatcher});
   }catch(error){failure=error;}
   finally{await dispatcher.close();}
   expect(failure).toBeInstanceOf(Error);
   expect((failure as Error&{cause?:{code?:string}}).cause?.code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
  });
 });

 it("rejects a trusted certificate when its hostname does not match the requested host",async()=>{
  await withTlsServer(async port=>{
   const dispatcher=new Agent({connect:{
    ca:testCertificate,
    rejectUnauthorized:true,
    lookup:createPinnedLookup("wrong-host.test",{address:"127.0.0.1",family:4})
   }});
   let failure:unknown;
   try{
    await fetch(`https://wrong-host.test:${port}/`,{dispatcher});
   }catch(error){failure=error;}
   finally{await dispatcher.close();}
   expect(failure).toBeInstanceOf(Error);
   expect((failure as Error&{cause?:{code?:string}}).cause?.code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
  });
 });
});

describe("pfSense operation data validation",()=>{
 const valid:Record<PfSenseOperation,unknown>={
  system:{status:"ok"},
  gateways:[],
  interfaces:[],
  services:[],
  version:{release:"26.07.2-RELEASE"},
  arpTable:[],
  firewallStates:[],
  firewallStateSize:0
 };

 it.each(Object.entries(valid))("accepts the expected minimum %s data shape", (operation,data)=>{
  expect(()=>validatePfSenseOperationData(operation as PfSenseOperation,data)).not.toThrow();
 });

 it.each([
  ["system",[]],
  ["gateways",{}],
  ["interfaces",null],
  ["services","running"],
  ["version",[]],
  ["system",{}],
  ["version",{}],
  ["arpTable",{}],
  ["firewallStates",{entries:[]}],
  ["firewallStateSize",[]],
  ["firewallStateSize",{}]
 ] as const)("rejects malformed %s data", (operation,data)=>{
  expect(()=>validatePfSenseOperationData(operation,data)).toThrowError(
   expect.objectContaining({errorClass:"invalid_response"})
  );
 });

 it("rejects a missing envelope data field as an invalid API envelope",()=>{
  // The client envelope parser is applied before the operation-specific schema.
  expect(()=>validatePfSenseOperationData("version",undefined)).toThrowError(PfSenseApiError);
 });
});

describe("per-device TLS trust selection",()=>{
 it("uses the explicitly configured custom CA for one device",()=>{
  const deviceCa=Buffer.from("device-specific-ca");
  const legacyCa=Buffer.from("legacy-global-ca");
  expect(selectTlsCa({mode:"custom-ca",certificateAuthority:deviceCa},legacyCa)).toBe(deviceCa);
 });

 it("uses system trust when explicitly selected, ignoring the legacy global CA",()=>{
  const legacyCa=Buffer.from("legacy-global-ca");
  expect(selectTlsCa({mode:"system"},legacyCa)).toBeUndefined();
 });

 it("preserves legacy CA-file behavior when no explicit device trust mode is supplied",()=>{
  const legacyCa=Buffer.from("legacy-global-ca");
  expect(selectTlsCa(undefined,legacyCa)).toBe(legacyCa);
 });

 it("loads the legacy CA file only for the explicit legacy bootstrap trust mode",()=>{
  const legacyCa=Buffer.from("legacy-global-ca");
  expect(selectTlsCa({mode:"legacy-ca-file"},legacyCa)).toBe(legacyCa);
 });

 it("does not apply the legacy CA file to explicitly configured system trust",()=>{
  const legacyCa=Buffer.from("legacy-global-ca");
  expect(selectTlsCa({mode:"system"},legacyCa)).toBeUndefined();
 });

 it("does not inherit a legacy CA when explicit custom trust was selected",()=>{
  const legacyCa=Buffer.from("legacy-global-ca");
  const deviceCa=Buffer.from("device-specific-ca");
  expect(selectTlsCa({mode:"custom-ca",certificateAuthority:deviceCa},legacyCa)).toBe(deviceCa);
 });

 it("does not apply a legacy CA when an explicit trust mode has no CA",()=>{
  const legacyCa=Buffer.from("legacy-global-ca");
  expect(selectTlsCa({mode:"system"},legacyCa)).toBeUndefined();
 });

 it("rejects an empty or oversized device CA bundle",()=>{
  expect(()=>selectTlsCa({mode:"custom-ca",certificateAuthority:Buffer.alloc(0)})).toThrow(/trust bundle is invalid/);
  expect(()=>selectTlsCa({mode:"custom-ca",certificateAuthority:Buffer.alloc(64*1024+1)})).toThrow(/trust bundle is invalid/);
 });
});
