# Trap the Cat (Hex) — Browser Game

Turn-based hex-grid game: you **block 1 tile**, then the **cat moves 1 step** trying to reach the **edge** and escape.

## Run locally

From this folder:

```bash
python3 -m http.server 5173
```

Then open:
- `http://localhost:5173`

## Play
- Tap/click a hex tile to **block** it.
- You **win** if the cat has **no legal moves**.
- You **lose** if the cat reaches the **edge**.

## Files
- `index.html`: UI shell
- `style.css`: responsive styling
- `main.js`: game logic + rendering (canvas)

