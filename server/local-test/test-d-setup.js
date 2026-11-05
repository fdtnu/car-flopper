import WebSocket from "ws";
import fs from "fs";
const BASE = "http://127.0.0.1:8787", WSB = "ws://127.0.0.1:8787";
const code = (await (await fetch(BASE + "/rooms", { method: "POST" })).json()).code;
const ws = new WebSocket(`${WSB}/rooms/${code}/ws?name=zombie&pid=pid-Z-1`);
let welcomed = false;
ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.t === "welcome") welcomed = true; });
const until = (fn, ms, what) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error("timeout: " + what)); } }, 50);
});
await until(() => welcomed, 8000, "zombie join");
ws.close();
await new Promise((r) => setTimeout(r, 1500)); // empty + persisted
fs.writeFileSync("/tmp/coop-test/td.json", JSON.stringify({ code }));
console.log("T8-setup: room " + code + " emptied + persisted");
process.exit(0);
