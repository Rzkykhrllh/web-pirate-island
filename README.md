# Pirate Jelly

Part of the **Material Studies** series of jelly dioramas: a tropical pirate cove set inside a translucent block of sea jelly, simulated and rendered live with WebGPU and WGSL. Everything is procedural: no models, textures, fonts or libraries.

## Run it

The build produces a single self-contained page.

```sh
npm run build          # writes dist/pirate-jelly.html
npm run serve          # or open dist/pirate-jelly.html directly in Chrome / Edge
```

Needs a browser with WebGPU (current Chrome or Edge, Safari 26+). Without it the page shows a fallback card.

## Project layout

| File | What it holds |
| --- | --- |
| `src/core.js` | Math (vec3, mat4, quaternions), noise, island terrain, scene layout, mesh builder |
| `src/shaders.js` | All WGSL: meshes, shadows, Skull Rock SDF ray-march, jelly sea, particles, tonemap |
| `src/scene.js` | Procedural geometry: island, palms, camp, chest, ship, wreck, kelp, crates, fruit |
| `src/sim.js` | Shallow-water grid, jelly block wobble/tip, ship buoyancy, rigid bodies, particles |
| `src/render.js` | WebGPU pipelines and passes (shadow → opaque → jelly + particles → composite) |
| `src/app.js` | Game state, time of day, flavours, interactions, picking |
| `src/main.js` | Boot, WebGPU fallback, input handling, UI wiring, render loop |
| `src/page.html` | Page shell: masthead, control panel, how-to strip, styles |
| `build.js` | Concatenates `src/` into `dist/pirate-jelly.html` |

## Playing

- Tap the ship to fire the gun facing you; drag her to tow against the anchor.
- Drag the sea for waves; drag a cut face to tip the block.
- Tap the chest, the campfire, or the X in the sand.
- Tap or shoot a floating crate to smash it, then tap the fruit to collect it.
- Grab and throw balls, barrels and coins; drag a palm to bend it.
- Drag empty space or right-drag to orbit; wheel or pinch to zoom. Space fires a gun.
