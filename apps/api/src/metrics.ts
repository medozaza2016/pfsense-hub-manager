import {collectDefaultMetrics,Counter,Histogram,Gauge,Registry} from "prom-client";
export const registry=new Registry();
collectDefaultMetrics({register:registry,prefix:"pfsense_hub_"});
export const requests=new Counter({name:"http_requests_total",help:"Completed manager HTTP requests.",labelNames:["method","route","status"],registers:[registry]});
export const requestDuration=new Histogram({name:"http_request_duration_seconds",help:"Manager HTTP request duration.",labelNames:["method","route"],registers:[registry]});
export const polls=new Counter({name:"pfsense_poll_total",help:"Firewall poll operations.",labelNames:["device_id","operation_group","result"],registers:[registry]});
export const pollErrors=new Counter({name:"pfsense_poll_errors_total",help:"Failed firewall poll operations.",labelNames:["device_id","operation_group","error_class"],registers:[registry]});
export const pollDuration=new Histogram({name:"pfsense_poll_duration_seconds",help:"Firewall poll duration.",labelNames:["device_id","operation_group"],registers:[registry]});
export const deviceUp=new Gauge({name:"pfsense_device_up",help:"Most recent firewall collection result, 1 if all operations succeeded.",labelNames:["device_id"],registers:[registry]});
export const lastSuccess=new Gauge({name:"pfsense_last_successful_poll_timestamp_seconds",help:"Unix timestamp of last successful firewall operation.",labelNames:["device_id"],registers:[registry]});

export const processUptime = new Gauge({name:"process_uptime_seconds",help:"Backend process uptime in seconds.",registers:[registry],collect(){this.set(process.uptime());}});

/**
 * Shared per-operation recorder. Kept in one place so the site overview and the
 * site snapshot endpoints cannot drift in how they count a poll.
 */
export function pollObserver(deviceId:string){
 return (operationGroup:string,result:"success"|"failure",errorClass?:string,durationMs?:number):void=>{
  polls.inc({device_id:deviceId,operation_group:operationGroup,result});
  pollDuration.observe({device_id:deviceId,operation_group:operationGroup},(durationMs??0)/1000);
  if(result==="failure")pollErrors.inc({device_id:deviceId,operation_group:operationGroup,error_class:errorClass??"unknown"});
  else lastSuccess.set({device_id:deviceId},Date.now()/1000);
 };
}
