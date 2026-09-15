# ICE OCEAN

`ICE OCEAN` is a small first person exploration game built with Vite and Three.js. You drift over a dark animated sea beneath a blue violet planet, then steer through seeded ice fields to find pink signal artifacts.

## Run

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

Use `WASD` or the arrow keys to move, drag the scene to look around, and hold `Shift` for a faster drift. `Auto Cruise` moves forward hands free while still allowing drag steering. `Space` or `Pause` freezes the voyage and clears movement input. `R` or `Restart Voyage` returns to the opening composition, clears discoveries, and regenerates the initial fields. On touch screens, use the directional pad and drag the sky to look.

The world is generated from a fixed seed. Ice fields are arranged in 34 unit chunks around the traveler and streamed in a 5 by 5 window; distant chunks and their geometry are disposed, so memory remains bounded while travel continues in every direction. The same chunk coordinates always produce the same spires and artifacts. The HUD exposes `data-distance`, `data-chunks`, `data-discoveries`, and `data-position` on `#app` for browser checks.
