#!/usr/bin/env node
/**
 * Tests for the rules themselves. Each case is a small edit of
 * architecture.puml (and optionally aact.config.ts) with a known answer:
 * the intended model must pass, every broken model must fail exactly the
 * expected rules.
 *
 * Usage: pnpm test
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const aact = join(root, "node_modules/.bin/aact");
const base = readFileSync(join(root, "architecture.puml"), "utf8");

const ANCHOR = "\nSHOW_LEGEND()";
const add = (line) => (s) => s.replace(ANCHOR, `\n${line}\n${ANCHOR}`);
const replace = (from, to) => (s) => {
  if (!s.includes(from)) throw new Error(`anchor not found: ${from}`);
  return s.replace(from, to);
};

/** [id, description, model edit, config edit or null, expected rules] */
const cases = [
  ["intended", "the model as is", (s) => s, null, []],
  [
    "ar01-direct-call",
    "state-elevator calls api over HTTP instead of an event",
    add('Rel(state_elevator, api, "Reports status", "HTTP")'),
    null,
    ["brokerOnly"],
  ],
  [
    "ar02-foreign-store",
    "state-elevator reads api's PostgreSQL",
    add('Rel(state_elevator, postgres, "Reads servers", "SQL", $tags="read")'),
    null,
    ["storeOwnership"],
  ],
  [
    "ar02-reader-writes",
    "api writes to ClickHouse while declared as a reader only",
    replace(
      'Rel(api, clickhouse, "Reads ping history", "ClickHouse HTTP", $tags="read")',
      'Rel(api, clickhouse, "Reads and prunes history", "ClickHouse HTTP", $tags="readwrite")',
    ),
    null,
    ["storeOwnership"],
  ],
  [
    "ar02-reader-undeclared",
    "api reads ClickHouse but reader:api is gone",
    replace('$tags="owner:metrics_writer,reader:api"', '$tags="owner:metrics_writer"'),
    null,
    ["storeOwnership"],
  ],
  [
    "ar02-recorded-exception",
    "state-elevator reads PostgreSQL under a recorded exception",
    add('Rel(state_elevator, postgres, "Reads servers", "SQL", $tags="read")'),
    (c) =>
      c.replace(
        "exceptions: [],",
        'exceptions: [{ from: "state_elevator", to: "postgres", access: "read", adr: "ADR-XXXX" }],',
      ),
    [],
  ],
  [
    "ar02-shared-redis-db",
    "ping-service reads state-elevator's Redis db1",
    add('Rel(ping_service, redis_state, "Reads state", "Redis", $tags="read")'),
    null,
    ["storeOwnership"],
  ],
  [
    "ar03-foreign-publisher",
    "metrics-writer publishes server.status.changed",
    add('Rel(metrics_writer, status_events, "publishes", "server.status.changed", $tags="publish")'),
    null,
    ["channelContract"],
  ],
  [
    "ar03-extra-consumer",
    "tg-bot consumes emailQueue",
    add('Rel(tg_bot, email_queue, "consumes", "emailQueue", $tags="consume")'),
    null,
    ["channelContract"],
  ],
  [
    "ar04-cycle",
    "api calls frontend back",
    add('Rel(api, frontend, "Server-side render", "HTTP")'),
    null,
    ["acyclic", "brokerOnly"],
  ],
];

const check = (dir) => {
  try {
    execFileSync(aact, ["check", "--json"], { cwd: dir, stdio: "pipe" });
    return [];
  } catch (error) {
    if (error.status !== 1) throw new Error(String(error.stderr || error));
    return JSON.parse(error.stdout.toString()).data.violations;
  }
};

let failed = 0;
for (const [id, title, editModel, editConfig, expected] of cases) {
  const dir = mkdtempSync(join(tmpdir(), `pingtower-${id}-`));
  cpSync(join(root, "rules"), join(dir, "rules"), { recursive: true });
  copyFileSync(join(root, "aact.config.ts"), join(dir, "aact.config.ts"));
  writeFileSync(join(dir, "architecture.puml"), editModel(base));
  if (editConfig) {
    const path = join(dir, "aact.config.ts");
    const before = readFileSync(path, "utf8");
    const after = editConfig(before);
    if (after === before) throw new Error(`${id}: config edit did nothing`);
    writeFileSync(path, after);
  }

  const violations = check(dir);
  const got = [...new Set(violations.map((v) => v.ruleId))].sort();
  const ok = JSON.stringify(got) === JSON.stringify([...expected].sort());
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${id.padEnd(24)} ${title}`);
  if (!ok) {
    console.log(`     expected [${expected}] got [${got}]`);
    for (const v of violations) console.log(`     ${v.ruleId}: ${v.target} ${v.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
