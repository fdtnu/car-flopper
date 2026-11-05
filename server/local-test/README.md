# Local co-op reconnect hardening (not deployed)

`worker-reconnect.js` is a drop-in superset of `../worker.js` (which includes
the 4054126 empty-room grace). It adds:

1. **DO-storage persistence** - room snapshots (claim, phase, parts, players,
   gone set) are written to SQLite-backed Durable Object storage and restored
   after eviction/restart, so a room no longer dies when its DO is evicted.
   Restored rooms older than `ROOM_TTL_MS` (default 30 min) are wiped instead.
2. **Stable reconnect identity** - the iOS client sends a per-device `pid`
   (UUID in UserDefaults, see Net.swift). A dropped player is held in a 60s
   `gone` reservation (visible in the snapshot as `gone: [{id,name}]`, which
   old clients ignore); rejoining with the same pid restores id/color/position.
   A second live socket with the same pid replaces the stale one.

`pid` is a bearer secret (122-bit UUID, TLS only, never broadcast). Any client
presenting a player's pid can resume that player; a wrong pid simply creates a
new player.

## Running the verification suite

```
cd server/local-test
npm install   # wrangler + ws
# terminal 1: npx wrangler dev --local --port 8787 --config wrangler.test.toml --persist-to ./persist
node test-a.js   # smoke, occupied-room pid restore, live-socket replace
node test-c.js   # gone sweep (5s test grace), takeover boundary, stale-close race
node test-d-setup.js && <restart wrangler with wrangler.expire.toml> && node test-d.js  # TTL wipe
# test-b.js is the post-restart half of test-a.js's T7 (full-restart resume)
```

All suites passed 2026-11-05 against workerd (miniflare) locally. Production
was not touched; deploy of any variant remains held.
