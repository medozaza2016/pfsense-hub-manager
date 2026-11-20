import { collectDefaultMetrics, Counter, Histogram, Gauge, Registry } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "pfsense_hub_" });

export const requests = new Counter({
  name: "http_requests_total", help: "Completed manager HTTP requests.",
  labelNames: ["method", "route", "status"] as const, registers: [registry]
});
export const requestDuration = new Histogram({
  name: "http_request_duration_seconds", help: "Manager HTTP request duration.",
  labelNames: ["method", "route"] as const, registers: [registry]
});
export const polls = new Counter({
  name: "pfsense_poll_total", help: "Firewall poll operations.",
  labelNames: ["device_id", "operation_group", "result"] as const, registers: [registry]
});
export const pollErrors = new Counter({
  name: "pfsense_poll_errors_total", help: "Failed firewall poll operations.",
  labelNames: ["device_id", "operation_group", "error_class"] as const, registers: [registry]
});
export const pollDuration = new Histogram({
  name: "pfsense_poll_duration_seconds", help: "Firewall poll duration.",
  labelNames: ["device_id", "operation_group"] as const, registers: [registry]
});
export const deviceUp = new Gauge({
  name: "pfsense_device_up", help: "Most recent firewall health result.",
  labelNames: ["device_id"] as const, registers: [registry]
});
export const lastSuccess = new Gauge({
  name: "pfsense_last_successful_poll_timestamp_seconds", help: "Unix timestamp of last successful firewall poll.",
  labelNames: ["device_id"] as const, registers: [registry]
});
