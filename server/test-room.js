// Logic-level test of GarageRoom without Cloudflare runtime: stub WebSocketPair + timers.

const mod = await import("./worker.js");
const { GarageRoom } = mod;

class FakeWS {
  constructor() { this.out = []; this.listeners = {}; this.readyState = 1; }
  accept() {}
  addEventListener(t, f) { this.listeners[t] = f; }
  send(s) { this.out.push(JSON.parse(s)); }
  emit(t, ev) { this.listeners[t] && this.listeners[t](ev || {}); }
  close() { this.emit("close"); }
}
class FakeWSPair { 0; 1; constructor() { this[0] = new FakeWS(); this[1] = new FakeWS(); } }
globalThis.WebSocketPair = FakeWSPair;

const room = new GarageRoom(null, null);
const code = "TEST";
await room.fetch(new Request(`https://do/claim?code=${code}`, { method: "POST" }));

async function join(name) {
  const req = new Request(`https://do/ws?name=${name}`);
  const resp = await room.fetch(req);
  if (resp.status !== 101) throw new Error("join failed " + resp.status);
  const server = resp.webSocket ?? null;
  return server;
}

// Response with webSocket: our stub returns `new Response(null,{status:101,webSocket:client})`.
// Node's Response doesn't keep unknown props, so call fetch-level pieces manually instead.
// Simpler: replicate handler internals.
function joinDirect(name) {
  const server = new FakeWS();
  const id = [...Array(8)].map(() => Math.random().toString(16)[2]).join("");
  const color = room.colorPool.length ? room.colorPool.shift() : 0;
  const player = { id, name, color, x: 0, z: 3.5, ry: 3.14, moving: false, repairing: null };
  room.players.set(server, player);
  if (!room.hostId) room.hostId = id;
  return { server, player };
}

const a = joinDirect("fred");
const b = joinDirect("simone");
if (room.hostId !== a.player.id) throw new Error("host wrong");

room.onMessage(a.server, a.player, { t: "start" });
if (room.phase !== "play") throw new Error("did not start");
if (Object.keys(room.parts).length !== 8) throw new Error("parts not initialized");

// both repair engine (12s solo). With 2 players rate = 1.7/12 per sec.
room.onMessage(a.server, a.player, { t: "repair", part: "engine", on: true });
room.onMessage(b.server, b.player, { t: "repair", part: "engine", on: true });
for (let i = 0; i < 40; i++) room.tick(); // 10s
const eng = room.parts.engine;
console.log("engine after 10s co-op:", eng.progress.toFixed(3), "fixers:", eng.fixers);
if (eng.progress < 0.9) throw new Error("co-op repair too slow: " + eng.progress);

// everyone repairs everything to completion
for (const def of Object.keys(room.parts)) {
  room.onMessage(a.server, a.player, { t: "repair", part: def, on: true });
  room.onMessage(b.server, b.player, { t: "repair", part: def, on: true });
  for (let i = 0; i < 60 && room.parts[def].progress < 1; i++) room.tick();
}
room.tick(); room.tick();
if (room.phase !== "complete") throw new Error("not complete, phase=" + room.phase);
console.log("car complete OK");

// host advances
room.onMessage(a.server, a.player, { t: "next" });
if (room.phase !== "play" || room.carIndex !== 1) throw new Error("next car failed");
console.log("next car OK, index", room.carIndex);

// non-host cannot advance
room.phase = "complete";
room.onMessage(b.server, b.player, { t: "next" });
if (room.carIndex !== 1) throw new Error("non-host advanced car!");
console.log("host-only advance OK");

// last car -> finished
room.carIndex = 2; room.phase = "complete";
room.onMessage(a.server, a.player, { t: "next" });
if (room.phase !== "finished") throw new Error("finished state wrong: " + room.phase);
console.log("finished OK");

// snapshot shape matches iOS decoder
room.code = code;
const snap = room.roomSnapshot();
for (const k of ["code","phase","carIndex","hostId","players","parts"]) if (!(k in snap)) throw new Error("snapshot missing " + k);
console.log("snapshot shape OK:", JSON.stringify({code: snap.code, players: snap.players.length}));

// --- empty-room resume grace ---
const r2 = new GarageRoom(null, null);
const claim1 = await r2.fetch(new Request("https://do/claim?code=GRCE", { method: "POST" }));
if (!claim1.ok) throw new Error("grace room claim failed");
function joinInto(r, name) {
  const server = new FakeWS();
  const id = [...Array(8)].map(() => Math.random().toString(16)[2]).join("");
  const color = r.colorPool.length ? r.colorPool.shift() : 0;
  const player = { id, name, color, x: 0, z: 3.5, ry: 3.14, moving: false, repairing: null, lastSeen: Date.now(), lastPosAt: 0 };
  r.players.set(server, player);
  r.emptySince = null; // mirrors the /ws handler
  if (!r.hostId) r.hostId = id;
  return { server, player };
}
const solo = joinInto(r2, "solo");
r2.phase = "play";
r2.parts = { engine: { progress: 0.5, fixers: 0 } };
// last player leaves: room is reserved for a rejoin, not destroyed
r2.onClose(solo.server, solo.player);
if (!r2.claimed) throw new Error("emptied room released immediately");
if (r2.emptySince == null) throw new Error("emptySince not set on empty room");
if (r2.hostId != null) throw new Error("hostId not cleared on empty room");
if (r2.timer != null) throw new Error("tick timer not stopped on empty room");
// a fresh claim during the grace is rejected
const graceClaim = await r2.fetch(new Request("https://do/claim?code=NEW1", { method: "POST" }));
if (graceClaim.status !== 409) throw new Error("fresh claim during grace not rejected: " + graceClaim.status);
// rejoin resumes with phase/parts preserved and rejoiner as host
const back = joinInto(r2, "solo-back");
if (r2.hostId !== back.player.id) throw new Error("rejoiner did not become host");
if (r2.phase !== "play" || r2.parts.engine?.progress !== 0.5) throw new Error("room state not preserved across resume");
console.log("empty-room resume grace OK");
// after the grace a fresh claim steals the code and resets the room
r2.onClose(back.server, back.player);
r2.emptySince = Date.now() - 10 * 60 * 1000; // past EMPTY_ROOM_GRACE_MS
const steal = await r2.fetch(new Request("https://do/claim?code=FRESH", { method: "POST" }));
if (!steal.ok) throw new Error("stale empty room not stealable: " + steal.status);
if (r2.code !== "FRESH" || r2.phase !== "lobby" || Object.keys(r2.parts).length !== 0) throw new Error("stolen room not reset");
console.log("stale room release + reclaim OK");

console.log("ALL ROOM LOGIC TESTS PASSED");
