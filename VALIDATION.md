# Validation

Validated locally on 2026-09-15.

## Automated checks

- `npm install` — completed with 15 audited packages and 0 vulnerabilities.
- `npm run build` — passed with Vite 7.3.6; output written to `dist/`.
- `curl -I http://127.0.0.1:5173/` — returned HTTP 200 while the development server was running.

## Browser verification

- Final uninterrupted Auto Cruise reached position `0.14, 2.75, -308.34`, distance `5.69 NM`, with `1` discovery and `25` active chunks. No warning or error logs were recorded.
- Pointer dragging visibly changed the view. Pause held position stable; resume continued the voyage. Repeated restart checks restored position `0, 2.75, 8`, counters `0`, and Auto Cruise off.
- At `390 × 844`, the page had no overflow; movement buttons and the restart control were visible, and mobile restart worked when clicked.

## Implementation checks

- The renderer is a real Three.js WebGL scene with custom geometry for jagged faceted spires, a shader ocean, a shader sky, a planet sphere, star field, lights, and an emissive starburst.
- The chunk manager keeps a 5 by 5 active window (`STREAM_RADIUS = 2`) around the traveler, disposes removed chunk geometry/materials, and uses deterministic integer hashing for repeatable fields.
- Movement is clamped to eye height and checked against active spire colliders. Pause and window blur clear movement input. Restart disposes active chunks and resets the position, seed-derived world, discovery count, and voyage state.
- Pointer look and touch movement controls are implemented, and the responsive touch controls were present in the mobile browser check.

## Limits

The game requires WebGL. The reference-inspired visual treatment uses procedural shaders and geometry rather than a source image. Audio is intentionally omitted so the experience stays calm and starts without an unexpected sound permission prompt. Browser automation did not verify sustained keyboard movement, simultaneous multi-touch behavior or feel, or hardware-specific FPS.
