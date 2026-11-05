// Full production-default 60s gone-grace sweep (no env override).
import WebSocket from "ws";
const BASE = "http://127.0.0.1:8787", WSB = "ws://127.0.0.1:8787";
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const ok = (m) => console.log("ok: " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const code = (await (await fetch(BASE + "/rooms", { method: "POST" })).json()).code;
function client(name, pid) {
  const ws = new WebSocket(`${WSB}/rooms/${code}/ws?name=${name}&pid=${pid}`);
  const c = { ws, id: null, last: null };
  ws.on("message", (d) => { const m = JSON.parse(d.toString());
    if (m.t === "welcome") c.id = m.id;
    if (m.t === "state") c.last = m.room; });
  return c;
}
const until = (fn, ms, what) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error("timeout: " + what)); } }, 100);
});
const A = client("gone60", "pid-60-1"), B = client("stay60", "pid-60-2");
await until(() => A.id && B.id && B.last && B.last.players.length === 2, 8000, "join");
const aId = A.id;
A.ws.terminate();
await until(() => B.last && (B.last.gone||[]).some(g => g.id === aId), 8000, "gone listed");
console.log("gone listed; waiting out the full 60s default grace...");
await sleep(45000);
// still inside checks: at 45s the reservation should STILL be there
if (!(B.last.gone||[]).some(g => g.id === aId)) fail("reservation swept EARLY (before 60s)");
console.log("ok: reservation still held at ~46s");
await sleep(20000); // now ~66s past the drop
await until(() => B.last && (B.last.gone||[]).length === 0, 10000, "swept after 60s");
const A2 = client("gone60", "pid-60-1");
await until(() => A2.id, 8000, "late rejoin");
if (A2.id === aId) fail("expired 60s reservation still restored identity");
A2.ws.close(); B.ws.close();
ok("T9 full 60s default sweep: held at 46s, swept by ~66s, late rejoin = new player");
console.log("PHASE E PASSED");
process.exit(0);
