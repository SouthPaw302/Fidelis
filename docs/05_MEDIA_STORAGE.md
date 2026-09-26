# Media Storage

Temporary durable media policy:

- **Google Drive**: source media, stems, reconstructed stems, loop renders and masters.
- **GitHub**: source code, docs, schemas, manifests and small fixtures only.
- **Browser/local cache**: temporary decode/playback buffers.
- **Vercel**: control surface, not the durable audio warehouse.

The shared audio contract stores Drive references by asset ID. Actual Drive upload/download wiring is a later surgery step; Step 3 defines the storage seam without pretending the connector is already active.
