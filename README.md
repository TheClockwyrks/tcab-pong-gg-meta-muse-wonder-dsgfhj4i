# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles face each other across a dark field while a ball ricochets between them, off the top and bottom walls, and off a pair of obstacles in the middle of the field. Moving your paddle as it strikes the ball adds spin that curves the ball's flight, turning the obstacles into a bank-shot puzzle. Play solo against the AI or share the keyboard in Versus; first to 11 points, leading by at least 2, wins.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints in your browser.

## Production build

```sh
npm run build
```

This type-checks the project and emits the complete static site into `dist/`, with `index.html` at its root. Serve that directory as-is with any static file server, for example:

```sh
npm run preview
```

## Controls

| Action | Keys |
| --- | --- |
| Player 1 (left) up / down | `W` / `S` |
| Player 2 (right) up / down | `ArrowUp` / `ArrowDown` |
| Solo: left paddle | `W`/`S` or `ArrowUp`/`ArrowDown` |
| Confirm menu item | `Enter` or `Space` (or click / tap) |
| Back | `Escape` |
| Pause / resume | `P` or `Escape` |
| Mute | `M` |

In Solo you control the left paddle and the AI controls the right. In Versus both paddles are human-controlled. Menus can also be navigated with the mouse or touch, and touch devices get on-screen controls from the engine.

Move your paddle while it strikes the ball to add spin: a paddle moving down adds downward-curving spin, a paddle moving up adds upward spin, and the curve decays in flight. Bank shots off the two central obstacles to find angles around your opponent.

## Tests

```sh
npm test
npm run typecheck
npm run lint
npm run format
```
