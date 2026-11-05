// Car Flopper multiplayer server v2 (LOCAL TEST CANDIDATE - not deployed).
// Adds to worker.js (4054126):
//  1. DO-storage persistence: room state survives DO eviction/restart.
//  2. Stable reconnect identity: client supplies pid; a dropped player goes to
//     a short-lived "gone" set and a rejoin with the same pid restores
//     id/color/position; a second live socket with the same pid replaces the old one.
// Protocol is a superset: old clients (no pid) behave exactly as before.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 4;
const TICK_MS = 250;
const BROADCAST_EVERY = 2;
const COOP_BONUS = 0.7;
const MAX_MSG_BYTES = 4096;
const IDLE_KICK_MS = 10 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = 2 * 60 * 1000;
const PLAYER_GONE_GRACE_MS = 60 * 1000; // dropped player reservable this long
const ROOM_TTL_MS = 30 * 60 * 1000; // restored-but-long-dead rooms are wiped instead of resumed
const MIN_POS_GAP_MS = 40;

const PARTS = [
  { id: "wheelFL", seconds: 7 }, { id: "wheelFR", seconds: 7 },
  { id: "wheelRL", seconds: 7 }, { id: "wheelRR", seconds: 7 },
  { id: "engine", seconds: 12 }, { id: "door", seconds: 9 },
  { id: "windshield", seconds: 9 }, { id: "exhaust", seconds: 8 },
];
const CAR_COUNT = 3;

function makeCode() {
  let c = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) c += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return c;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/rooms" && request.method === "POST") {
      for (let i = 0; i < 5; i++) {
        const code = makeCode();
        const id = env.GARAGE_ROOM.idFromName(code);
        const stub = env.GARAGE_ROOM.get(id);
        const r = await stub.fetch(new Request("https://do/claim?code=" + code, { method: "POST" }));
        if (r.ok) return Response.json({ code }, { headers: cors });
      }
      return Response.json({ error: "could not allocate room" }, { status: 500, headers: cors });
    }

    const m = url.pathname.match(/^\/rooms\/([A-Z2-9]{4})(\/ws)?$/);
    if (m) {
      const code = m[1];
      const id = env.GARAGE_ROOM.idFromName(code);
      const stub = env.GARAGE_ROOM.get(id);
      const doUrl = new URL(m[2] ? "https://do/ws" : "https://do/status");
      doUrl.search = url.search;
      const resp = await stub.fetch(new Request(doUrl.toString(), request));
      if (!m[2]) {
        const h = new Headers(resp.headers);
        for (const [k, v] of Object.entries(cors)) h.set(k, v);
        return new Response(resp.body, { status: resp.status, headers: h });
      }
      return resp;
    }

    return new Response("car-flopper-api", { status: 200, headers: cors });
  },
};

export class GarageRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.players = new Map(); // ws -> player {id,pid,name,color,x,z,ry,moving,repairing,lastSeen,lastPosAt}
    this.gone = new Map();    // pid -> {player snapshot, goneAt}
    this.claimed = false;
    this.phase = "lobby";
    this.carIndex = 0;
    this.hostId = null;
    this.parts = {};
    this.colorPool = [0, 1, 2, 3];
    this.tickCount = 0;
    this.timer = null;
    this.emptySince = null;
    this.restored = false;
    this.goneGraceMs = Number(env.PLAYER_GONE_GRACE_MS) > 0 ? Number(env.PLAYER_GONE_GRACE_MS) : PLAYER_GONE_GRACE_MS;
    this.roomTtlMs = Number(env.ROOM_TTL_MS) > 0 ? Number(env.ROOM_TTL_MS) : ROOM_TTL_MS;
    this.state.blockConcurrencyWhile(async () => {
      const s = await this.state.storage.get("room");
      if (s && s.emptySince != null && Date.now() - s.emptySince > this.roomTtlMs) {
        // zombie room: long past any plausible reconnect; wipe instead of resuming
        await this.state.storage.delete("room");
        return;
      }
      if (s) {
        // Eviction/restart restore: live sockets are all dead; every remembered
        // player (active or already gone) becomes resumable via pid.
        this.claimed = s.claimed; this.code = s.code;
        this.phase = s.phase; this.carIndex = s.carIndex;
        this.hostId = null; // no live sockets after restore; first rejoiner hosts
        this.parts = s.parts || {};
        this.colorPool = s.colorPool || [0, 1, 2, 3];
        this.tickCount = s.tickCount || 0;
        this.emptySince = s.emptySince ?? Date.now();
        for (const p of s.players || []) this.gone.set(p.pid, { player: p, goneAt: Date.now() });
        for (const [pid, g] of Object.entries(s.gone || {})) this.gone.set(pid, g);
      }
      this.restored = true;
    });
  }

  persist() {
    const snap = {
      claimed: this.claimed, code: this.code || "",
      phase: this.phase, carIndex: this.carIndex,
      parts: this.parts, colorPool: this.colorPool,
      tickCount: this.tickCount, emptySince: this.emptySince,
      players: [...this.players.values()].map(({ lastSeen, lastPosAt, ...p }) => p),
      gone: Object.fromEntries(this.gone),
    };
    // keep the DO alive until the write lands, even if the last socket just closed
    this.state.waitUntil(this.state.storage.put("room", snap));
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/claim") {
      if (this.claimed) {
        const resumable = this.players.size === 0 && this.emptySince != null && Date.now() - this.emptySince <= EMPTY_ROOM_GRACE_MS;
        if (this.players.size > 0 || this.gone.size > 0 || resumable) return new Response("taken", { status: 409 });
        this.resetRoom();
      }
      this.claimed = true;
      this.code = url.searchParams.get("code") || "";
      this.emptySince = null;
      this.persist();
      return new Response("ok");
    }

    if (url.pathname === "/status") {
      if (!this.claimed) return new Response("not found", { status: 404 });
      if (this.players.size + this.gone.size >= MAX_PLAYERS) return new Response("full", { status: 409 });
      return Response.json({ code: true, players: this.players.size, phase: this.phase });
    }

    if (url.pathname === "/ws") {
      if (!this.claimed) return new Response("not found", { status: 404 });
      const name = (url.searchParams.get("name") || "mechanic").slice(0, 16);
      const pid = (url.searchParams.get("pid") || crypto.randomUUID()).slice(0, 36);

      // stable identity: rejoin of a gone player, or replace a stale live socket
      let player = null; let resumed = false;
      if (this.gone.has(pid)) {
        player = this.gone.get(pid).player;
        player.name = name;
        this.gone.delete(pid);
        resumed = true;
      } else {
        for (const [ows, op] of this.players) {
          if (op.pid === pid) {
            this.players.delete(ows); // detach first so its close event no-ops
            try { ows.close(1000, "replaced"); } catch {}
            player = op; player.name = name; resumed = true;
            break;
          }
        }
      }
      if (!player) {
        if (this.players.size + this.gone.size >= MAX_PLAYERS) return new Response("full", { status: 409 });
        const color = this.colorPool.length ? this.colorPool.shift() : this.players.size % 4;
        player = { id: crypto.randomUUID().slice(0, 8), pid, name, color, x: 0, z: 3.5, ry: 3.14, moving: false, repairing: null };
      } else {
        // returning player frees nothing; color comes back with them
        this.colorPool = this.colorPool.filter((c) => c !== player.color);
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.emptySince = null;
      player.lastSeen = Date.now(); player.lastPosAt = 0;
      this.players.set(server, player);
      if (!this.hostId) this.hostId = player.id;

      server.send(JSON.stringify({ t: "welcome", id: player.id, pid, resumed }));
      this.broadcastState();
      this.ensureTimer();
      this.persist();

      server.addEventListener("message", (ev) => {
        if (typeof ev.data !== "string" || ev.data.length > MAX_MSG_BYTES) {
          try { server.close(1009, "message too big"); } catch {}
          return;
        }
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        player.lastSeen = Date.now();
        if (msg.t === "pos") {
          if (player.lastSeen - player.lastPosAt < MIN_POS_GAP_MS) return;
          player.lastPosAt = player.lastSeen;
        }
        this.onMessage(server, player, msg);
      });
      server.addEventListener("close", () => this.onClose(server, player));
      server.addEventListener("error", () => this.onClose(server, player));

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  onMessage(ws, player, msg) {
    if (msg.t === "pos") {
      player.x = clampNum(msg.x, -7.4, 7.4);
      player.z = clampNum(msg.z, -5.4, 5.4);
      player.ry = clampNum(msg.ry, -7, 7);
      player.moving = !!msg.moving;
    } else if (msg.t === "repair") {
      const partId = typeof msg.part === "string" ? msg.part : null;
      player.repairing = msg.on && partId && this.parts[partId] && this.parts[partId].progress < 1 ? partId : null;
    } else if (msg.t === "start" && player.id === this.hostId && this.phase === "lobby") {
      this.initCar();
      this.phase = "play";
      this.broadcastState();
      this.persist();
    } else if (msg.t === "pick" && player.id === this.hostId && this.phase === "lobby") {
      const i = Math.trunc(Number(msg.car));
      if (i >= 0 && i < CAR_COUNT) { this.carIndex = i; this.broadcastState(); }
    } else if (msg.t === "next" && player.id === this.hostId && this.phase === "complete") {
      if (this.carIndex + 1 < CAR_COUNT) { this.carIndex += 1; this.initCar(); this.phase = "play"; }
      else { this.phase = "finished"; }
      this.broadcastState();
      this.persist();
    }
  }

  onClose(ws, player) {
    if (!this.players.has(ws)) return;
    this.players.delete(ws);
    // The player keeps their slot for PLAYER_GONE_GRACE_MS; a rejoin with the
    // same pid restores id/color/position. After the sweep the slot frees.
    this.gone.set(player.pid, { player: { ...player }, goneAt: Date.now() });
    if (this.hostId === player.id) {
      this.hostId = this.players.size ? this.players.values().next().value.id : null;
    }
    if (this.players.size === 0) {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      this.emptySince = Date.now();
      this.hostId = null;
    } else {
      this.broadcastState();
    }
    this.persist();
  }

  resetRoom() {
    this.phase = "lobby";
    this.carIndex = 0;
    this.hostId = null;
    this.parts = {};
    this.colorPool = [0, 1, 2, 3];
    this.tickCount = 0;
    this.emptySince = null;
    this.gone.clear();
    this.state.waitUntil(this.state.storage.delete("room"));
  }

  initCar() {
    this.parts = {};
    for (const p of PARTS) this.parts[p.id] = { progress: 0, fixers: 0 };
    for (const pl of this.players.values()) pl.repairing = null;
  }

  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    const now = Date.now();
    for (const [ws, pl] of [...this.players]) {
      if (now - pl.lastSeen > IDLE_KICK_MS) {
        try { ws.close(1001, "idle"); } catch {}
        this.onClose(ws, pl);
      }
    }
    // sweep expired gone reservations
    let swept = false;
    for (const [pid, g] of [...this.gone]) {
      if (now - g.goneAt > this.goneGraceMs) {
        this.gone.delete(pid);
        if (![...this.players.values()].some((p) => p.color === g.player.color) &&
            ![...this.gone.values()].some((o) => o.player.color === g.player.color)) {
          this.colorPool.push(g.player.color);
        }
        swept = true;
      }
    }
    if (swept) { this.broadcastState(); this.persist(); }
    if (this.phase === "play") {
      for (const p of Object.values(this.parts)) p.fixers = 0;
      for (const pl of this.players.values()) {
        if (pl.repairing && this.parts[pl.repairing]) this.parts[pl.repairing].fixers += 1;
      }
      const dt = TICK_MS / 1000;
      let allFixed = true;
      for (const def of PARTS) {
        const st = this.parts[def.id];
        if (!st || st.progress >= 1) continue;
        if (st.fixers > 0) {
          const rate = (1 + COOP_BONUS * (st.fixers - 1)) / def.seconds;
          const before = st.progress;
          st.progress = Math.min(1, st.progress + rate * dt);
          if (st.progress >= 1 && before < 1) {
            this.broadcast({ t: "event", kind: "partFixed", part: def.id });
            for (const pl of this.players.values()) if (pl.repairing === def.id) pl.repairing = null;
            this.persist();
          }
        }
        if (st.progress < 1) allFixed = false;
      }
      if (allFixed && this.phase === "play") {
        this.phase = "complete";
        this.broadcast({ t: "event", kind: "carComplete", car: String(this.carIndex) });
        this.persist();
      }
    }
    this.tickCount += 1;
    if (this.tickCount % BROADCAST_EVERY === 0) this.broadcastState();
  }

  roomSnapshot() {
    return {
      code: this.code || "",
      phase: this.phase,
      carIndex: this.carIndex,
      hostId: this.hostId || "",
      players: [...this.players.values()].map(({ lastSeen, lastPosAt, pid, ...p }) => p),
      gone: [...this.gone.values()].map((g) => ({ id: g.player.id, name: g.player.name })),
      parts: this.parts,
    };
  }

  broadcastState() { this.broadcast({ t: "state", room: this.roomSnapshot() }); }

  broadcast(obj) {
    const text = JSON.stringify(obj);
    for (const ws of this.players.keys()) {
      try { ws.send(text); } catch {}
    }
  }
}

function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
