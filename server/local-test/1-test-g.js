// G: NEW client (hello first-frame, no pid query) vs DEPLOYED Oct-29 server bundle
const PORT = 8797;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function connectWs(code, name, pid) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/rooms/${code}/ws?name=${name}`);
    const inbox = [];
    let welcome = null;
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", pid, name })); // exact new-client first frame
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      inbox.push(m);
      if (m.t === "welcome" && !welcome) { welcome = m; resolve({ ws, inbox, welcome }); }
    };
    ws.onerror = () => reject(new Error("ws handshake error"));
    setTimeout(() => reject(new Error("welcome timeout")), 5000);
  });
}
const lastState = c => c.inbox.filter(m => m.t === "state").pop()?.room?.players;

const r1 = await fetch(`${BASE}/rooms`, { method: "POST" });
const { code } = await r1.json();
ok(!!code, "G0 room created");

const ana = await connectWs(code, "Ana", "device-ana");
ok(!!ana.welcome.id, "G1 initial join: welcome with id (hello not rejected)");
await sleep(400);
ok(lastState(ana)?.length === 1 && lastState(ana)[0].name === "Ana", "G1 player visible in state");

ana.ws.send(JSON.stringify({ t: "pos", x: 1.5, z: 2.5, ry: 0.5, moving: true }));
await sleep(600);
ok(Math.abs(lastState(ana)?.[0]?.x - 1.5) < 0.001, "G2 pos accepted after hello");

// G3: Bob joins (keeps DO alive), then Ana drops and reconnects
const bob = await connectWs(code, "Bob", "device-bob");
await sleep(400);
ok(lastState(bob)?.length === 2, "G3a Bob joins alongside Ana");
const oldAnaId = ana.welcome.id;
ana.ws.close();
await sleep(1500); // close event fires while DO kept alive by Bob
const ana2 = await connectWs(code, "Ana", "device-ana");
ok(!!ana2.welcome.id && ana2.welcome.id !== oldAnaId, "G3b reconnect joins with FRESH id (old server: no restore, graceful degradation)");
await sleep(500);
const players = lastState(ana2) || [];
ok(players.length === 2 && players.filter(p => p.name === "Ana").length === 1, "G3c stale Ana removed, exactly [Bob, Ana] in room");

// G4: full-room drop on old server -> room loss (documented production weakness)
const code2 = (await (await fetch(`${BASE}/rooms`, { method: "POST" })).json()).code;
const solo = await connectWs(code2, "Solo", "device-solo");
ok(!!solo.welcome.id, "G4a solo join ok");
solo.ws.close();
await sleep(1500);
const st = await fetch(`${BASE}/rooms/${code2}`);
ok(st.status === 404, "G4b old server loses room after full disconnect (404) - the weakness the new server fixes");

bob.ws.close(); ana2.ws.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
