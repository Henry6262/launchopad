# Witness Portraits (scaffold)

A 10-piece pixel-portrait collection (CryptoPunks-like, 24x24 grid) of everyday people of the ancient Near East.

**Status:** scaffold only. Every image in `images/` is a clearly marked PLACEHOLDER until the final hand-drawn pixel art is added. **Devnet only** - no mainnet, no sale, no price.

Format matches `public/canary/collection.json` (name, symbol, description, image, external_url) plus standard `attributes`.

| # | Character | Brief |
|---|---|---|
| 01 | Woman with the Clay Jar | Dark-haired woman, brown robe, copper earring, clay water jar |
| 02 | Tablet Scribe | Bearded man, blue robe, writing cuneiform on a clay tablet |
| 03 | Shepherd Boy | Striped wool cloak, crook, lamb under one arm |
| 04 | Potter | Clay-covered hands, leather apron, jar on the wheel |
| 05 | Weaver | Indigo headscarf, loom shuttle, red and ochre threads |
| 06 | Spice Merchant | Turban, rings, brass scale, saffron and cumin sacks |
| 07 | Well-Keeper Girl | Braids, rope and bronze bucket |
| 08 | Camel-Driver | Sand scarf over the mouth, camel head, sunset |
| 09 | Oil-Lamp Maker | Copper earrings, lit clay lamp as the only light |
| 10 | Scribe's Apprentice | Reed stylus, cracked practice tablet |

## Depiction rules (mandatory for all art)

- Never depict God, the Prophet Muhammad, Jibril or any angel. Divine presence may only be suggested by light.
- Prophets (e.g. Abraham/Ibrahim) appear only far away, from behind, or as a silhouette - never as a portrait.
- Companions of the Prophet are faceless.
- Pagan gods only as faceless light or shadow.
- All 10 characters are ordinary, fictional everyday people.

## Files

- `collection.json` - collection metadata
- `metadata/NN.json` - one metadata file per character
- `images/NN-slug.svg` - placeholder images (replace with final PNG/WebP and update `image` URLs)
- Gallery page: `/world/witness-portraits`