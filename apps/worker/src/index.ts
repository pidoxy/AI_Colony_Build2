import { createDb } from "@crs/db";
import { PolicyLoader } from "@crs/policy";
import { loadConfig } from "@crs/config";
import { runSweeps } from "./sweeps.js";
import { runDispatcher } from "./notify.js";

/**
 * Background worker. Runs independently of the API and scales separately.
 * All batches use FOR UPDATE SKIP LOCKED, so running multiple replicas is safe.
 */

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const policy = new PolicyLoader(db);

let stopped = false;
process.on("SIGINT", () => (stopped = true));
process.on("SIGTERM", () => (stopped = true));

async function tick() {
  try {
    const p = await policy.get();
    const results = await runSweeps(db, p, config);
    if (results.noShows > 0 || results.completed > 0) {
      console.log(new Date().toISOString(), results);
    }
  } catch (err) {
    console.error(new Date().toISOString(), "sweep failed", err);
    // policy fail-closed: on first-load failure, don't run sweeps unprotected.
    // DB failure mid-run is fine — next tick retries.
  }
}

async function dispatch() {
  try {
    await runDispatcher(db, config);
  } catch (err) {
    console.error(new Date().toISOString(), "dispatcher failed", err);
  }
}

async function loop() {
  while (!stopped) {
    await tick();
    await dispatch();
    await sleep(config.SWEEP_INTERVAL_MS);
  }
  await db.destroy();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

loop();
