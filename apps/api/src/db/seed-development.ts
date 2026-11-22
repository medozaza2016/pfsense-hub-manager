import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { hashPassword } from "../auth.js";
import { migrate } from "./migrate.js";

export const DEVELOPMENT_SEED_KEY = "development-sample-data-v1";
export const DEVELOPMENT_SITE_SEED_KEY = "development-demo-sites-v1";
export const DEVELOPMENT_SITE_SEEDS = [
  { id: "d0000000-0000-4000-8000-000000000001", name: "New York Office", location: "New York, NY", edition: "plus" },
  { id: "d0000000-0000-4000-8000-000000000002", name: "New Jersey Office", location: "Passaic, NJ", edition: "ce" },
  { id: "d0000000-0000-4000-8000-000000000003", name: "Warehouse", location: "Newark, NJ", edition: "plus" },
  { id: "d0000000-0000-4000-8000-000000000004", name: "West Coast Office", location: "Los Angeles, CA", edition: "ce" },
  { id: "d0000000-0000-4000-8000-000000000005", name: "European Office", location: "London, UK", edition: "plus" },
  { id: "d0000000-0000-4000-8000-000000000006", name: "Remote Branch", location: "Chicago, IL", edition: "unknown" },
  { id: "d0000000-0000-4000-8000-000000000007", name: "Disaster Recovery", location: "Dallas, TX", edition: "ce" }
] as const;
const USERNAMES = Array.from({ length: 9 }, (_, index) => `demo.user${String(index + 1).padStart(2, "0")}`);
const ALERT_TITLES = [
  "Firewall connectivity interrupted", "Gateway latency elevated", "Repeated authentication failures",
  "VPN tunnel unavailable", "Certificate renewal approaching", "Polling recovered",
  "Interface status changed", "High memory utilization", "DNS resolver check failed", "Hub session expired"
];
const AUDIT_ACTIONS = [
  ["auth.login", "User signed in", "session"],
  ["auth.logout", "User signed out", "session"],
  ["auth.login", "Sign-in attempt failed", "session"],
  ["user.update", "Updated manager user", "user"],
  ["user.create", "Created manager user", "user"],
  ["alert.acknowledge", "Acknowledged alert", "alert"],
  ["alert.resolve", "Resolved alert", "alert"],
  ["hub.settings.update", "Updated Hub reachability settings", "hub_settings"],
  ["device.poll", "Completed device status poll", "site"],
  ["auth.access_denied", "Protected API request was denied", "api"]
] as const;

export interface AlertSeedRecord {
  index: number;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  status: "active" | "acknowledged" | "resolved";
  firstSeenAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
}
export interface AuditSeedRecord {
  index: number;
  action: string;
  summary: string;
  targetType: string;
  outcome: "success" | "failure" | "denied";
  occurredAt: Date;
}

export function buildAlertSeedRecords(now: Date): AlertSeedRecord[] {
  return Array.from({ length: 50 }, (_, offset) => {
    const index = offset + 1;
    const daysAgo = 1 + ((offset * 7) % 28);
    const firstSeenAt = new Date(now.getTime() - daysAgo * 86400000 - (offset % 8) * 3600000);
    const status = index <= 20 ? "active" : index <= 35 ? "acknowledged" : "resolved";
    const severity = index <= 8 ? "critical" : index <= 33 ? "warning" : "info";
    return {
      index, severity, status,
      title: ALERT_TITLES[offset % ALERT_TITLES.length] ?? "Hub operational event",
      message: `Development sample alert ${String(index).padStart(2, "0")}. Synthetic data for validating alert severity, lifecycle, filtering, and history.`,
      firstSeenAt,
      lastSeenAt: new Date(firstSeenAt.getTime() + (offset % 6) * 3600000),
      occurrenceCount: 1 + (offset % 8)
    };
  });
}

export function buildAuditSeedRecords(now: Date): AuditSeedRecord[] {
  return Array.from({ length: 100 }, (_, offset) => {
    const [action, summary, targetType] = AUDIT_ACTIONS[offset % AUDIT_ACTIONS.length] ?? AUDIT_ACTIONS[0]!;
    const outcome = offset % 17 === 0 ? "denied" : offset % 13 === 0 ? "failure" : "success";
    return {
      index: offset + 1, action, summary, targetType, outcome,
      occurredAt: new Date(now.getTime() - (100 - offset) * 6 * 3600000)
    };
  });
}

export async function runDevelopmentSeed(pool: pg.Pool): Promise<{ usersInserted: number; sitesInserted: number; alertsInserted: number; auditEventsInserted: number; skipped: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [741928364]);
    const previous = await client.query("SELECT seed_key FROM development_seed_runs WHERE seed_key=$1", [DEVELOPMENT_SEED_KEY]);
    const previousSites = await client.query("SELECT seed_key FROM development_seed_runs WHERE seed_key=$1", [DEVELOPMENT_SITE_SEED_KEY]);
    if (previous.rowCount && previousSites.rowCount) {
      await client.query("COMMIT");
      return { usersInserted: 0, sitesInserted: 0, alertsInserted: 0, auditEventsInserted: 0, skipped: true };
    }

    let sitesInserted = 0;
    if (!previousSites.rowCount) {
      for (const site of DEVELOPMENT_SITE_SEEDS) {
        const inserted = await client.query(
          `INSERT INTO managed_devices(id,name,location,edition,api_base_url,enabled,is_demo)
           VALUES($1,$2,$3,$4,$5,false,true)
           ON CONFLICT(id) DO NOTHING RETURNING id`,
          [site.id, site.name, site.location, site.edition, `https://${site.id}.demo.invalid`]
        );
        sitesInserted += inserted.rowCount ?? 0;
      }
      await client.query(
        `INSERT INTO development_seed_runs(seed_key,sites_inserted) VALUES($1,$2)`,
        [DEVELOPMENT_SITE_SEED_KEY, sitesInserted]
      );
    }

    if (previous.rowCount) {
      await client.query("COMMIT");
      return { usersInserted: 0, sitesInserted, alertsInserted: 0, auditEventsInserted: 0, skipped: true };
    }

    const admins = await client.query("SELECT id FROM admin_users WHERE role='admin' AND is_active=true ORDER BY created_at LIMIT 1");
    if (!admins.rowCount) throw new Error("Refusing to seed: create and verify an active administrator account first.");

    let usersInserted = 0;
    for (const [index, username] of USERNAMES.entries()) {
      const credentials = await hashPassword(randomBytes(32).toString("base64url"));
      const inserted = await client.query(
        `INSERT INTO admin_users(username,password_hash,password_salt,password_iterations,role,is_active,created_at,updated_at)
         VALUES($1,$2,$3,$4,'user',$5,now()-($6::int * interval '1 day'),now())
         ON CONFLICT DO NOTHING RETURNING id`,
        [username, credentials.hash, credentials.salt, credentials.iterations, index < 7, index + 1]
      );
      usersInserted += inserted.rowCount ?? 0;
    }

    const users = await client.query(
      "SELECT id,username FROM admin_users WHERE username=ANY($1::text[]) AND role='user' ORDER BY username",
      [USERNAMES]
    );
    const actors = users.rows as Array<{ id: string; username: string }>;
    if (!actors.length) throw new Error("Seed users could not be loaded.");

    const now = new Date();
    const alerts = buildAlertSeedRecords(now);
    for (const alert of alerts) {
      const actor = actors[(alert.index - 1) % actors.length]!;
      const acknowledged = alert.status !== "active";
      const resolved = alert.status === "resolved";
      await client.query(
        `INSERT INTO alerts(
          deduplication_key,severity,title,message,source,resource_type,resource_id,status,
          first_seen_at,last_seen_at,occurrence_count,acknowledged_at,acknowledged_by,resolved_at,resolved_by
        ) VALUES($1,$2,$3,$4,'development-seed','site',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          `development-seed:${String(alert.index).padStart(3, "0")}`, alert.severity, alert.title, alert.message,
          `seed-site-${String(((alert.index - 1) % DEVELOPMENT_SITE_SEEDS.length) + 1).padStart(2, "0")}`, alert.status,
          alert.firstSeenAt, alert.lastSeenAt, alert.occurrenceCount,
          acknowledged ? new Date(alert.firstSeenAt.getTime() + 1800000) : null,
          acknowledged ? actor.id : null,
          resolved ? new Date(alert.lastSeenAt.getTime() + 1800000) : null,
          resolved ? actor.id : null
        ]
      );
    }

    const auditEvents = buildAuditSeedRecords(now);
    for (const event of auditEvents) {
      const actor = actors[(event.index - 1) % actors.length]!;
      await client.query(
        `INSERT INTO audit_events(
          occurred_at,actor_id,actor_username,actor_type,action,outcome,target_type,target_id,
          summary,request_id,metadata
        ) VALUES($1,$2,$3,'user',$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          event.occurredAt, actor.id, actor.username, event.action, event.outcome, event.targetType,
          `seed-target-${String(((event.index - 1) % 20) + 1).padStart(2, "0")}`, event.summary,
          `development-seed-${String(event.index).padStart(3, "0")}`,
          JSON.stringify({ dataset: DEVELOPMENT_SEED_KEY, synthetic: true, record: event.index })
        ]
      );
    }

    await client.query(
      `INSERT INTO development_seed_runs(seed_key,users_inserted,sites_inserted,alerts_inserted,audit_events_inserted)
       VALUES($1,$2,$3,$4,$5)`,
      [DEVELOPMENT_SEED_KEY, usersInserted, sitesInserted, alerts.length, auditEvents.length]
    );
    await client.query("COMMIT");
    return { usersInserted, sitesInserted, alertsInserted: alerts.length, auditEventsInserted: auditEvents.length, skipped: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Development seeding is disabled unless NODE_ENV=development.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, application_name: "pfsense-hub-development-seed" });
  try {
    await migrate(pool);
    const result = await runDevelopmentSeed(pool);
    if (result.skipped && result.sitesInserted === 0) {
      console.log("Development seed already applied. No records were changed.");
    } else {
      console.log(`Development seed complete: ${result.usersInserted} users, ${result.sitesInserted} demo sites, ${result.alertsInserted} alerts, ${result.auditEventsInserted} audit events inserted.`);
      if (result.usersInserted > 0) {
        console.log("Seeded users have random unknown passwords. Set passwords through User Management before attempting to sign in.");
      }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : "Development seed failed."); process.exitCode = 1; });
}
