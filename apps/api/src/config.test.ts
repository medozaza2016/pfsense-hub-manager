import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, loadEncryptionKey } from "./config.js";
const valid={NODE_ENV:"test",HOST:"127.0.0.1",PORT:"3000",DATABASE_URL:"postgres://user:pass@localhost:5432/db",PFSENSE_DEVICE_ID:"00000000-0000-4000-8000-000000000001",PFSENSE_DEVICE_NAME:"Test firewall",PFSENSE_DEVICE_LOCATION:"Test",PFSENSE_EDITION:"plus",PFSENSE_API_BASE_URL:"https://firewall.example.test:10443",PFSENSE_API_KEY_FILE:"./secret",APP_ENCRYPTION_KEY_FILE:"./app-key",PFSENSE_API_TIMEOUT_MS:"10000"};
let directory:string|undefined;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined;});
describe("configuration validation",()=>{
 it("accepts a complete HTTPS legacy bootstrap configuration",()=>{expect(loadConfig(valid).PORT).toBe(3000);});
 it("accepts GUI-first startup without any firewall configured",()=>{
  const config=loadConfig({...valid,PFSENSE_DEVICE_ID:"",PFSENSE_DEVICE_NAME:"",PFSENSE_API_BASE_URL:""});
  expect(config.PFSENSE_DEVICE_ID).toBeUndefined();
  expect(config.PFSENSE_DEVICE_NAME).toBeUndefined();
  expect(config.PFSENSE_API_BASE_URL).toBeUndefined();
 });
 it("rejects partial legacy firewall bootstrap configuration",()=>{
  expect(()=>loadConfig({...valid,PFSENSE_DEVICE_ID:""})).toThrow(/Invalid application configuration/);
 });
 it("rejects HTTP firewall origins",()=>{expect(()=>loadConfig({...valid,PFSENSE_API_BASE_URL:"http://firewall.example.test"})).toThrow(/HTTPS/);});
 it("rejects missing required settings",()=>{expect(()=>loadConfig({})).toThrow(/Invalid application configuration/);});
 it("accepts an unset agent token for local development",()=>{expect(loadConfig({...valid,HUB_DEPLOYMENT_AGENT_TOKEN:"",HUB_DEPLOYMENT_AGENT_SOCKET:""}).HUB_DEPLOYMENT_AGENT_TOKEN).toBe("");});
 it("keeps automatic Hub access deployment disabled by default",()=>{expect(loadConfig(valid).HUB_ACCESS_DEPLOYMENT_ENABLED).toBe(false);});
 it("enables Hub access deployment only for the explicit true value",()=>{expect(loadConfig({...valid,HUB_ACCESS_DEPLOYMENT_ENABLED:"true"}).HUB_ACCESS_DEPLOYMENT_ENABLED).toBe(true);expect(loadConfig({...valid,HUB_ACCESS_DEPLOYMENT_ENABLED:"false"}).HUB_ACCESS_DEPLOYMENT_ENABLED).toBe(false);});
 it("keeps host monitoring and host operations disabled by default",()=>{const config=loadConfig(valid);expect(config.HUB_HOST_MONITORING_ENABLED).toBe(false);expect(config.HUB_HOST_OPERATIONS_ENABLED).toBe(false);});
 it("enables host monitoring only for the explicit true value",()=>{expect(loadConfig({...valid,HUB_HOST_MONITORING_ENABLED:"true"}).HUB_HOST_MONITORING_ENABLED).toBe(true);});
 it("refuses host operations without host monitoring",()=>{expect(()=>loadConfig({...valid,HUB_HOST_OPERATIONS_ENABLED:"true"})).toThrow(/HUB_HOST_OPERATIONS_ENABLED: Requires HUB_HOST_MONITORING_ENABLED=true/);expect(loadConfig({...valid,HUB_HOST_MONITORING_ENABLED:"true",HUB_HOST_OPERATIONS_ENABLED:"true"}).HUB_HOST_OPERATIONS_ENABLED).toBe(true);});
 it("rejects a short host-agent token",()=>{expect(()=>loadConfig({...valid,HUB_DEPLOYMENT_AGENT_TOKEN:"too-short"})).toThrow(/Invalid application configuration/);});
 it("loads exactly 32 bytes from a 64-character hexadecimal key file",async()=>{
  directory=await mkdtemp(join(tmpdir(),"pfsense-key-"));const path=join(directory,"key");await writeFile(path,"ab".repeat(32));
  expect((await loadEncryptionKey(path)).length).toBe(32);
 });
 it("fails closed for malformed or missing key files",async()=>{
  directory=await mkdtemp(join(tmpdir(),"pfsense-key-"));const path=join(directory,"key");await writeFile(path,"not-a-key");
  await expect(loadEncryptionKey(path)).rejects.toThrow(/64 hexadecimal/);
  await expect(loadEncryptionKey(join(directory,"missing"))).rejects.toThrow(/Refusing to start/);
 });
});
