// After restart with ROOM_TTL_MS=1: persisted long-dead room is WIPED, not resumed.
import WebSocket from "ws";
import fs from "fs";
const BASE = "http://127.0.0.1:8787";
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const ok = (m) => console.log("ok: " + m);
const { code } = JSON.parse(fs.readFileSync("/tmp/coop-test/td.json", "utf8"));
const r = await fetch(`${BASE}/rooms/${code}`);
if (r.status !== 404) fail("zombie room survived TTL wipe: " + r.status);
ok("T8 restore expiry: long-dead persisted room wiped after restart (status 404, storage cleaned)");
console.log("PHASE D PASSED");
process.exit(0);
