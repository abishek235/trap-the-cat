# Trap the Cat (Hex) — Browser Game

Turn-based hex-grid game: you **block 1 tile**, then the **cat moves 1 step** trying to reach the **edge** and escape.

## Play online

- **Game link (GitHub Pages)**: `https://abishek235.github.io/trap-the-cat/`

If the link shows 404, enable GitHub Pages:
- Repo → **Settings** → **Pages**
- **Source**: “Deploy from a branch”
- **Branch**: `main` / folder: `/ (root)`

## Run locally

From this folder:

```bash
python3 -m http.server 5173
```

Then open:
- `http://localhost:5173`

## Play
- Tap/click a hex tile to **block** it.
- You **win** if the cat is **trapped in** (can’t reach any edge anymore), even if empty spaces remain inside.
- You **lose** if the cat reaches the **edge**.

## Files
- `index.html`: UI shell
- `style.css`: responsive styling
- `main.js`: game logic + rendering (canvas)

