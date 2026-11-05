// Phase A against LOCAL worker2: smoke, pid restore in occupied room, live-socket
// replace, old-client compat, grace rejoins; then T7-setup (persist + empty room).
import WebSocket from "ws";
import fs from "fs";
const BASE = "http://127.0.0.1:8787", WSB = "ws://127.0.0.1:8787";
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const ok = (m) => console.log("ok: " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function makeRoom() {
  const code = (await (await fetch(BASE + "/rooms", { method: "POST" })).json()).code;
  if (!/^[A-Z2-9]{4}$/.test(code)) fail("bad code"); return code;
}
function client(name, code, pid) {
  const q = "?name=" + name + (pid ? "&pid=" + pid : "");
  const ws = new WebSocket(`${WSB}/rooms/${code}/ws${q}`);
  const c = { ws, name, id: null, pid: null, resumed: null, last: null, events: [], closed: null };
  ws.on("message", (d) => { const m = JSON.parse(d.toString());
    if (m.t === "welcome") { c.id = m.id; c.pid = m.pid; c.resumed = m.resumed; }
    if (m.t === "state") c.last = m.room;
    if (m.t === "event") c.events.push(m); });
  ws.on("close", (code, reason) => { c.closed = code + ":" + reason; });
  return c;
}
const until = (fn, ms, what) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error("timeout: " + what)); } }, 50);
});
const send = (c, o) => c.ws.send(JSON.stringify(o));

// T1 smoke
{
  const code = await makeRoom();
  const A = client("fred", code), B = client("simone", code);
  await until(() => A.id && B.id && A.last && A.last.players.length === 2, 8000, "T1");
  send(A, { t: "start" });
  await until(() => B.last && B.last.phase === "play", 8000, "T1 play");
  if (!A.pid) fail("T1 welcome missing server pid");
  A.ws.close(); B.ws.close();
  ok("T1 smoke on worker2 (old-client path, server-assigned pid)");
}

// T5 occupied-room drop + pid restore
{
  const code = await makeRoom();
  const A = client("droppy", code, "pid-A-0001"), B = client("steady", code, "pid-B-0002");
  await until(() => A.id && B.id && B.last && B.last.players.length === 2, 8000, "T5 join");
  send(A, { t: "start" });
  await until(() => B.last && B.last.phase === "play", 8000, "T5 play");
  send(A, { t: "pos", x: 3.0, z: -2.0, ry: 0.5, moving: true });
  await sleep(700);
  const aId = A.id, aColor = A.last.players.find(p => p.id === aId).color;
  A.ws.terminate();
  await until(() => B.last && B.last.players.length === 1, 8000, "T5 vanish");
  await until(() => B.last && (B.last.gone || []).some(g => g.id === aId), 8000, "T5 gone listed");
  const A2 = client("droppy", code, "pid-A-0001");
  await until(() => A2.id && A2.last && A2.last.players.length === 2, 8000, "T5 rejoin");
  if (A2.id !== aId) fail("T5 id not restored: " + A2.id + " != " + aId);
  if (A2.resumed !== true) fail("T5 resumed flag not set");
  const me = A2.last.players.find(p => p.id === aId);
  if (me.color !== aColor) fail("T5 color not restored");
  if (Math.abs(me.x - 3.0) > 0.01 || Math.abs(me.z + 2.0) > 0.01) fail("T5 position not restored: " + me.x + "," + me.z);
  if (A2.last.gone && A2.last.gone.length !== 0) fail("T5 gone not cleared after resume");
  A2.ws.close(); B.ws.close();
  ok("T5 occupied-room drop: same id/color/position restored via pid, gone listed then cleared");
}

// T6 second live socket with same pid replaces the stale one
{
  const code = await makeRoom();
  const A = client("dual", code, "pid-D-0003");
  await until(() => A.id && A.last && A.last.players.length === 1, 8000, "T6 join");
  const A2 = client("dual", code, "pid-D-0003");
  await until(() => A2.id && A2.last, 8000, "T6 second join");
  await until(() => A.closed !== null, 8000, "T6 old socket closed");
  if (A2.id !== A.id) fail("T6 id changed on replace");
  await until(() => A2.last && A2.last.players.length === 1, 8000, "T6 still one player");
  A2.ws.close();
  ok("T6 same-pid second socket replaced stale one, room still shows 1 player");
}

// T7-setup: solo progress, then empty the room (state must persist to storage)
{
  const code = await makeRoom();
  const A = client("solo", code, "pid-S-0004");
  await until(() => A.id && A.last, 8000, "T7 join");
  send(A, { t: "start" });
  await until(() => A.last && A.last.phase === "play", 8000, "T7 play");
  send(A, { t: "repair", part: "engine", on: true });
  await until(() => A.last && A.last.parts.engine.progress > 0.25, 10000, "T7 progress");
  const prog = A.last.parts.engine.progress;
  A.ws.close();
  await sleep(1500); // empty room, persist() flushed via waitUntil
  fs.writeFileSync("/tmp/coop-test/t7.json", JSON.stringify({ code, pid: "pid-S-0004", id: A.id, prog }));
  ok(`T7-setup: room ${code} emptied with engine progress ${prog.toFixed(2)}, state persisted`);
}
console.log("PHASE A PASSED");
process.exit(0);
