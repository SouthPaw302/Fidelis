# Fidelis ↔ LibertasDJ Sync

Fidelis and LibertasDJ share musical objects; they do not share UI ownership.

Fidelis owns decompilation, analysis, reconstruction candidates and offline QC. LibertasDJ owns live deck transport and sample-accurate playback synchronization.

Handoff schema: `libertas.deck-handoff.v0.1`.

A handoff contains the selected channel/clip, tempo state, mixer state, reconstruction selection and media reference. Deck A/B execution is deliberately not wired in Step 3; the contract is prepared first.
