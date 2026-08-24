# Hollowlight — Art Pipeline (PixelLab)

All 2D assets for Hollowlight are generated through **PixelLab** (https://pixellab.ai). It is connected to Hermes as the `pixellab` MCP server (79 tools, prefix `mcp_pixellab_*`) and is also callable over REST.

## Auth

- MCP tools: authenticated already — just call them.
- REST fallback: `Authorization: Bearer $PIXELLAB_API_TOKEN` (token lives in Hermes `.env`; never commit or print it).
- Check credits before batches: `GET /v2/balance`. Each generation costs 1 credit; the account is on a 40-generation trial — **batch carefully, no spam regeneration**.

## Endpoints that matter for this game

| Need | Tool / endpoint |
|---|---|
| Item icons (herbs, ores, candles, gear) | `create-image-pixflux` — `image_size: {width, height}`, 64×64 |
| Characters/creatures with rotations | `create-character-v3` / `create-character-with-4-directions`, then `animate-*` |
| Enemy sprites + idle/attack anims | characters + `animate-with-text-v3` |
| Map tiles (pilgrim road, settlements) | `create-tileset` (top-down Wang tilesets), `create-isometric-tile` |
| UI panels/frames | `generate-ui-v2` (Pro) or pixflux |
| Async jobs | poll `GET /v2/background-jobs/{job_id}`; MCP: `get_job_status`, `download_job_artifact` |

## Style contract (binding for every asset)

- Palette: deep blue-black bases (#0b0d12–#11141c), warm gold accents (#d9a441 / #e8d9a8), candlelight glow; gothic but warm — candlelit cathedral, never gore.
- Prompt suffix for consistency: `dark gothic style, warm golden candlelight, deep blue-black background, clean pixel art`.
- Sizes: item icons 64×64, characters 32×32 or 48×48 sprite frames, tiles 32×32.
- Every asset saved under `src/ui/assets/<category>/<name>.png`, lowercase-hyphenated.

## Known quirk

`create-image-pixflux` may return a filled background even when transparency is requested. Fix in post: near-uniform dark backgrounds chroma-key out cleanly — run the shared post-step (`tools/art/key-out-background.py` when it exists) or request the MCP agent to do it. Never hand-paint over generated art without noting it in the commit message.

## Provenance

Tested 2026-08-24: 64×64 brass lantern icon generated via REST, quality approved by Conductor (see `docs/art-tests/lantern-test.png`).
