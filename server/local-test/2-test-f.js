// Hello-handshake privacy: new clients pass pid in a first ws message, not the URL.
import WebSocket from "ws";
const BASE = "http://127.0.0.1:8787", WSB = "ws://127.0.0.1:8787";
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const ok = (m) => console.log("ok: " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function makeRoom() {
  const code = (await (await fetch(BASE + "/rooms", { method: "POST" })).json()).code;
  return code;
}
function raw(code, query) {
  const ws = new WebSocket(`${WSB}/rooms/${code}/ws${query}`);
  const c = { ws, welcome: null, closed: null };
  ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.t === "welcome") c.welcome = m; });
  ws.on("close", (code, reason) => { c.closed = code + ":" + reason; });
  return c;
}
const until = (fn, ms, what) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error("timeout: " + what)); } }, 50);
});

const code = await makeRoom();

// H1 new-style hello join (no pid in URL)
{
  const c = raw(code, "?name=nova");
  c.ws.on("open", () => c.ws.send(JSON.stringify({ t: "hello", pid: "hello-pid-1", name: "nova" })));
  await until(() => c.welcome, 5000, "H1 welcome");
  if (c.welcome.pid !== "hello-pid-1") fail("H1 wrong pid " + c.welcome.pid);
  if (c.welcome.resumed) fail("H1 should not be resumed");
  c._id = c.welcome.id; c._color = null;
  ok("H1 hello join, pid never in URL");
  // H2 new-style resume after drop
  c.ws.close();
  await sleep(300);
  const c2 = raw(code, "?name=nova");
  c2.ws.on("open", () => c2.ws.send(JSON.stringify({ t: "hello", pid: "hello-pid-1", name: "nova" })));
  await until(() => c2.welcome, 5000, "H2 welcome");
  if (!c2.welcome.resumed) fail("H2 should resume");
  if (c2.welcome.id !== c._id) fail("H2 id changed " + c2.welcome.id + " vs " + c._id);
  ok("H2 hello resume restores id");
  c2.ws.close();
}
// H3 old-style fallback (pid in URL, no hello)
{
  const c = raw(code, "?name=old&pid=old-pid-1");
  await until(() => c.welcome, 5000, "H3 welcome");
  if (c.welcome.pid !== "old-pid-1") fail("H3 wrong pid " + c.welcome.pid);
  ok("H3 old-client URL-pid fallback join");
  // H4 old-style resume via URL pid
  c.ws.close(); await sleep(300);
  const c2 = raw(code, "?name=old&pid=old-pid-1");
  await until(() => c2.welcome, 5000, "H4 welcome");
  if (!c2.welcome.resumed || c2.welcome.id !== c.welcome.id) fail("H4 resume failed");
  ok("H4 old-client resume still works");
  c2.ws.close();
}
console.log("PASS: hello handshake");
process.exit(0);
