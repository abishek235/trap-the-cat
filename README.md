# Trap the Cat (Hex) 🐱

A lightweight, dependency-free browser game built with HTML5 Canvas and vanilla JavaScript. Your goal is to trap the cat on a hexagonal grid before it escapes to the edge!

## 🎮 Play Online

Play the game directly in your browser: **[Play Trap the Cat](https://abishek235.github.io/trap-the-cat/)**

*(If you are hosting this repository and see a 404, ensure GitHub Pages is enabled pointing to the `main` branch).*

## 📖 How to Play

1. **Tap or click** an empty hex tile to block it.
2. You can block exactly **one** tile per turn.
3. After your turn, the **cat moves 1 step** toward the nearest edge.
4. You **win** if the cat is completely **trapped** (no legal moves left or no path to the edge).
5. You **lose** if the cat successfully reaches the **edge** of the board.

## ✨ Features

- **Hexagonal Grid:** Fully responsive and scalable board.
- **Pathfinding AI:** The cat uses Breadth-First Search (BFS) to find the shortest path to freedom.
- **Touch & Mouse Support:** Includes pinch-to-zoom and two-finger panning for mobile devices.
- **Themes:** Toggle between beautifully crafted Dark and Bright modes.
- **Audio Controls:** Independent volume sliders and mute toggles for Background Music (BGM) and Sound Effects (SFX).
- **Animations & Effects:** Enjoy a rewarding confetti explosion when you win, and watch the cat taunt you when you lose!
- **High Scores:** Automatically saves your best score (fewest turns) to your browser's local storage.
- **Progressive Web App (PWA):** Installable on iOS, Android, and Desktop via "Add to Home Screen" for a full-screen, native app experience.

## 🚀 Run Locally

Since the game loads audio assets, it should be run through a local web server to avoid browser blocks on `file://` protocols.

1. Clone the repository and navigate to the project folder.
2. Start a local server (e.g., using Python):

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
