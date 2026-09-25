# Model and renderer matrix

Fidelis separates **project authority** from model execution. A capability is `ready` only when the backend can actually invoke it.

| ID | Role | Local path | Remote worker | Current sandbox |
| --- | --- | --- | --- | --- |
| `demucs` | full-mix source decomposition | Demucs 4 + verified HTDemucs checkpoint | `FIDELIS_DEMUCS_URL` | blocked locally: checkpoint absent |
| `fidelis-native-performance` | monophonic performance extraction | Librosa pYIN + deterministic gesture analysis | n/a | ready |
| `basic-pitch` | transcription | optional package | `FIDELIS_BASIC_PITCH_URL` | unavailable locally |
| `stradi` | violin transcription | optional source/worker | `FIDELIS_STRADI_URL` | unavailable locally |
| `instrudio-native` | violin/fiddle physical renderer | MIT-licensed offline adaptation of Instrudio Studio Violin | n/a | ready |
| `fidelis-physical-violin` | violin/fiddle physical renderer | independent Fidelis-native deterministic renderer | n/a | ready |
| `instrudio` | external violin renderer | external worker | `FIDELIS_INSTRUDIO_URL` | unavailable locally |
| `ddsp` | structured synthesis | optional package/worker | `FIDELIS_DDSP_URL` | unavailable locally |
| `rave` | direct timbre transfer | optional worker | `FIDELIS_RAVE_URL` | unavailable locally |
| `brave` | direct timbre transfer | optional worker | `FIDELIS_BRAVE_URL` | unavailable locally |
| `sony-diffusion` | direct timbre transfer | optional worker | `FIDELIS_SONY_DTT_URL` | unavailable locally |
| `wavetransfer` | direct timbre transfer | optional worker | `FIDELIS_WAVETRANSFER_URL` | unavailable locally |
| `fidelis-reference-synth` | pipeline validation fallback | native | n/a | ready |

## Managed HTDemucs checkpoint

Fidelis does not silently download large model weights by default.

The managed checkpoint is:

```text
model: htdemucs
filename: 955717e8-8726e21a.th
sha256: 8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4
managed path: $FIDELIS_RUNTIME/models/torch/hub/checkpoints/955717e8-8726e21a.th
```

Install through either:

- the Engine Bay `IMPORT HTDEMUCS MODEL` control; or
- `POST /api/models/demucs/checkpoint` with multipart field `file`.

The upload is rejected unless SHA-256 matches exactly. After a valid install, `/api/capabilities` reports `demucs=ready` without a code change.

A production system may instead set `FIDELIS_DEMUCS_URL` to a worker-protocol endpoint. That is the recommended path when the UI/control plane is hosted on a serverless/static platform.

## Instrudio Studio Violin native adapter

`instrudio-native` is pinned to upstream `GareBear99/Instrudio` commit `ab597024d9ef06a79691e64017e618cfe76dcc8b`. The upstream license is `Instrudio_v2/LICENSE` (MIT); a copy is retained under `backend/vendor/instrudio/LICENSE` together with the reduced instrument definition used by the adapter.

The native adapter translates the licensed Studio Violin control/synthesis contract into deterministic offline NumPy/SciPy rendering. It is the first-choice local physical renderer for fiddle/violin-class parts when an external Instrudio worker is not configured.

## Fidelis Physical Violin

`fidelis-physical-violin` is an independent Fidelis renderer. It does not reuse the source waveform. It consumes `fidelis.performance.*` events and synthesizes a new 48 kHz stereo waveform using:

- Helmholtz-style harmonic weighting;
- continuous pitch/slides;
- extracted vibrato rate/depth;
- deterministic bow texture;
- mild inharmonic beating;
- generic bowed-body resonances;
- articulation-aware attack/release.

It is an independent secondary physical renderer for fiddle/violin-class parts. The physical priority is: configured external Instrudio worker → `instrudio-native` → `fidelis-physical-violin` → reference synth only as a last-resort pipeline fallback.

## External worker rule

External workers are bounded compute providers. They do not own project state. Fidelis sends one operation, receives evidence/audio, records provenance, and mutates the canonical project itself.
