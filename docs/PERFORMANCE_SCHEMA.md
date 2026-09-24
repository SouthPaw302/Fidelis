# Performance schema

Current schema: `fidelis.performance.v0.1`

`performance.json` is the stable handoff between **analysis** and **rendering**.

## Goals

- Preserve musical intent independently of the source waveform.
- Keep confidence and limitations visible.
- Allow multiple analyzers to contribute evidence.
- Avoid reducing expressive performance to note-on/note-off MIDI alone.

## Example

```json
{
  "schema": "fidelis.performance.v0.1",
  "source": {
    "file": "fiddle.wav",
    "instrument": "fiddle",
    "durationSec": 22.481,
    "sampleRate": 48000,
    "channels": 2
  },
  "performance": [
    {
      "start": 1.218,
      "duration": 0.742,
      "note": "A4",
      "midi": 69.04,
      "hz": 441.02,
      "dynamics": 0.1217,
      "attack": "soft",
      "transition": "slide-up",
      "pitchStartCents": -16.2,
      "pitchEndCents": 11.8,
      "vibratoHz": 5.6,
      "vibratoDepthCents": 18.3,
      "confidence": 0.84
    }
  ],
  "pitchContour": []
}
```

## Future additions

The schema is expected to grow with additive versioning for:

- per-note pitch envelopes rather than summary start/end cents;
- loudness envelopes;
- articulation probability vectors;
- bow/plectrum/air-control evidence;
- polyphonic voices;
- beat/phrase anchors;
- source analyzer provenance per field;
- target-renderer translation hints.

A renderer must not assume heuristic fields such as `attack` or `transition` are ground truth. Use confidence/provenance when those fields become model-derived.
