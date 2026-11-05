import WebSocket from "ws";
const BASE = "http://127.0.0.1:8787", WSB = "ws://127.0.0.1:8787";
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const ok = (m) => console.log("ok: " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function makeRoom() {
  const code = (await (await fetch(BASE + "/rooms", { method: "POST" })).json()).code;
  return code;
}
function client(name, code, pid) {
  const q = "?name=" + name + (pid ? "&pid=" + pid : "");
  const ws = new WebSocket(`${WSB}/rooms/${code}/ws${q}`);
  const c = { ws, name, id: null, resumed: null, last: null, closed: null };
  ws.on("message", (d) => { const m = JSON.parse(d.toString());
    if (m.t === "welcome") { c.id = m.id; c.resumed = m.resumed; }
    if (m.t === "state") c.last = m.room; });
  ws.on("close", (cd, rs) => { c.closed = cd + ":" + rs; });
  return c;
}
const until = (fn, ms, what) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error("timeout: " + what)); } }, 50);
});

// S1: gone reservation expires after (test) 5s grace -> sweep frees slot, rejoin gets NEW id
{
  const code = await makeRoom();
  const A = client("gone", code, "pid-G-1"), B = client("stay", code, "pid-G-2");
  await until(() => A.id && B.id && B.last && B.last.players.length === 2, 8000, "S1 join");
  const aId = A.id;
  A.ws.terminate();
  await until(() => B.last && B.last.players.length === 1 && (B.last.gone||[]).length === 1, 8000, "S1 gone listed");
  await sleep(6500); // past the 5s test grace; sweep runs on 250ms ticks
  await until(() => B.last && (B.last.gone||[]).length === 0, 8000, "S1 swept");
  const A2 = client("gone", code, "pid-G-1");
  await until(() => A2.id, 8000, "S1 rejoin");
  if (A2.id === aId) fail("S1 expired reservation still restored identity");
  if (A2.resumed) fail("S1 expired reservation flagged resumed");
  A2.ws.close(); B.ws.close();
  ok("S1 gone sweep: reservation expires, slot freed, late rejoin is a new player");
}

// S2: takeover attempt with a WRONG pid must not disturb the live player
{
  const code = await makeRoom();
  const V = client("victim", code, "pid-V-secret");
  await until(() => V.id && V.last, 8000, "S2 victim join");
  const K = client("attacker", code, "pid-K-other");
  await until(() => K.id && K.last && K.last.players.length === 2, 8000, "S2 attacker join");
  await sleep(800);
  if (V.closed !== null) fail("S2 victim socket disturbed by foreign-pid join");
  if (K.id === V.id) fail("S2 attacker got victim identity");
  // bearer-secret boundary: presenting the victim's pid DOES replace (documented model)
  const T = client("thief", code, "pid-V-secret");
  await until(() => T.id, 8000, "S2 thief join");
  if (T.id !== V.id) fail("S2 bearer pid did not resume (unexpected)");
  await until(() => V.closed !== null, 8000, "S2 victim replaced");
  await until(() => T.last && T.last.players.filter(p=>p.id===V.id).length === 1, 8000, "S2 single entry");
  T.ws.close(); K.ws.close();
  ok("S2 security: wrong pid = new player, victim undisturbed; correct bearer pid resumes (documented boundary)");
}

// S3: replaced-socket close must not remove the replacement (stale close race)
{
  const code = await makeRoom();
  const A = client("race", code, "pid-R-1");
  await until(() => A.id && A.last, 8000, "S3 join");
  const A2 = client("race", code, "pid-R-1");
  await until(() => A2.id && A2.last, 8000, "S3 replace");
  await sleep(2000); // let the old socket's close fully propagate
  const st = await (await fetch(`${BASE}/rooms/${code}`)).json();
  if (st.players !== 1) fail("S3 stale close removed replacement or duplicated: " + JSON.stringify(st));
  if (A2.closed !== null) fail("S3 replacement socket was closed");
  A2.ws.close();
  ok("S3 stale-close race: old socket close handler did not remove its replacement");
}
console.log("PHASE C PASSED");
process.exit(0);
