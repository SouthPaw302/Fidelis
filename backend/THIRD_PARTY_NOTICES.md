# Third-party notices

## Instrudio Studio Violin

Fidelis includes an offline renderer adapter derived from the public Studio Violin model/control contract in **GareBear99/Instrudio**, under the `Instrudio_v2` tree.

- Upstream repository: `GareBear99/Instrudio`
- Pinned upstream commit: `ab597024d9ef06a79691e64017e618cfe76dcc8b`
- Upstream instrument definition: `Instrudio_v2/instruments/definitions/studio_violin.json`
- Upstream license path: `Instrudio_v2/LICENSE`
- License: MIT
- Copyright: (c) 2026 Gary Doman

A copy of the applicable MIT license is retained at `backend/vendor/instrudio/LICENSE`. The reduced instrument definition used by the backend is retained at `backend/vendor/instrudio/studio_violin.json` and records the pinned upstream revision/license path.

The Fidelis adapter translates the licensed Web Audio physical-model/control contract into deterministic offline NumPy/SciPy rendering and records upstream/version/license provenance in produced render metadata. It is not the project authority; it is one renderer behind the Fidelis adapter layer.
