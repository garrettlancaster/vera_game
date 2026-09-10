# Cube World

A tiny voxel game (Minecraft clone) built with vanilla JS + three.js.

## Files

| File            | Purpose                                      |
|-----------------|-----------------------------------------------|
| `index.html`    | Entry point (loads three.js from CDN via import map) |
| `client/main.js`| Boots the game and owns the animation loop — everything else lives in `client/`'s modules (see below) |
| `client/sounds.js` | Procedural Web Audio sound engine (no audio files needed) |
| `server.mjs`    | Tiny static file server for local play       |

The game used to be one file (`game.js`); it's now split into ES modules under
`client/` — see `DEV_HANDOFF.md` §3 for the module map and `IMPLEMENTATION_PLAN.md`'s
Slice A entry for how/why it was split. No build step either way: `index.html`
loads `client/main.js` as a native `<script type="module">`, and every file
under `client/` imports its neighbors with plain `import`/`export`.

## How to run

```powershell
node server.mjs
```

Then open http://127.0.0.1:8321 in a browser.

(Any static file server works — the game is pure client-side; the included one just exists so you can double-click into it.)

## Controls

- **Click** to lock the mouse, then:
  - `W A S D` move, `Shift` sprint / dive (in water), `Space` jump / swim up
  - Mouse look around, left click break block, right click place/use
  - `1–9` select hotbar slot, scroll wheel to cycle
- Walkable mobs, day/night cycle, biomes, drops and a simple crafting/inventory system are all included.

## Notes

- Requires an internet connection on first load (three.js r160 is fetched from the jsDelivr CDN).
- No build step, no dependencies to install — it's `index.html`, `server.mjs`, and the `client/` module tree.
