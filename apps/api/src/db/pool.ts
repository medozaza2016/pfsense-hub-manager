import pg from "pg";
import type { AppConfig } from "../config.js";
export function createPool(config:AppConfig):pg.Pool {
 return new pg.Pool({connectionString:config.DATABASE_URL,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:10000,application_name:"pfsense-hub-manager"});
}
