// Phase B after a FULL wrangler restart: the room must survive (DO storage),
// and the solo player must resume identity + progress via pid.
import WebSocket from "ws";
import fs from "fs";
const BASE = "http://127.0.0.1:8787", WSB = "ws://127.0.0.1:8787";
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const ok = (m) => console.log("ok: " + m);
const { code, pid, id, prog } = JSON.parse(fs.readFileSync("/tmp/coop-test/t7.json", "utf8"));
const st = await (await fetch(`${BASE}/rooms/${code}`)).json();
if (st.phase !== "play") fail("room lost after restart: " + JSON.stringify(st));
const A = { ws: null, id: null, resumed: null, last: null };
A.ws = new WebSocket(`${WSB}/rooms/${code}/ws?name=solo&pid=${pid}`);
A.ws.on("message", (d) => { const m = JSON.parse(d.toString());
  if (m.t === "welcome") { A.id = m.id; A.resumed = m.resumed; }
  if (m.t === "state") A.last = m.room; });
const until = (fn, ms, what) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error("timeout: " + what)); } }, 50);
});
await until(() => A.id && A.last, 8000, "rejoin after restart");
if (A.id !== id) fail("id not restored after restart");
if (A.resumed !== true) fail("resumed flag missing after restart");
if (A.last.phase !== "play") fail("phase lost after restart");
if (!(A.last.parts.engine.progress >= prog)) fail("progress lost after restart: " + A.last.parts.engine.progress);
if (A.last.hostId !== A.id) fail("rejoiner not host after restart");
A.ws.close();
ok(`T7 restart test: room survived full server restart, id+progress (${prog.toFixed(2)}) restored`);
console.log("PHASE B PASSED");
process.exit(0);
