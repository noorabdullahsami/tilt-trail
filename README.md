# Tilt Trail

An endless runner you steer with your head.

**Play it:** [GITHUB PAGES LINK]
(Allow camera access when asked. Best in Chrome, in decent light.)

Endless runners like Temple Run and Subway Surfers run on your thumbs. That convention quietly leaves out the kid who cannot easily use their hands. Tilt Trail keeps the thrill and drops the thumbs: you steer by tilting your head.

## The game

You are a small runner heading up a jungle temple path split into three lanes. Coins are points. Spike balls and logs cost a life, and you have three. After a hit you blink for a moment, which is the game's way of saying "go on, get out of there."

There are three difficulty levels, a high score that is saved between visits, and a mute button for the coin jingle.

## How to play

- **Tilt your head toward your left shoulder:** move one lane left.
- **Tilt toward your right shoulder:** move one lane right.
- **Come back to straight** before the next move. One tilt is one move.

### Calibration

The first time you play, the game calibrates: look straight, tilt left, tilt right. It learns how far you can comfortably tilt, so a few degrees can be enough.

- **Sensitivity slider:** how much of your tilt triggers a move.
- **Recalibrate:** always available.
- The game slowly follows your resting posture, so slouching does not switch lanes.

### No camera?

Use the keyboard: **A / D** or the **left / right arrow keys**. Many accessibility switches send exactly these key presses.

If the camera loses your face mid-run, the game pauses and waits for you.

## Accessibility decisions

- Calibration measures each player's own range instead of assuming one fixed angle.
- A visible tilt meter during calibration shows whether the camera is reading you.
- Return-to-neutral rule prevents one sustained tilt from triggering several moves.
- Hitboxes are slightly smaller than the art, so near misses count as misses.
- The game pauses when tracking is lost instead of punishing the player.

## Privacy

The camera video never leaves your browser. Nothing is recorded and nothing is uploaded.

## Testing

Tilt Trail is designed for kids with limited hand movement, I had my little sister and cousins try this in the testing phase but they could not give me a concrete feedback (at their age they can't give structured feedback). Feedback so far has come from classmates and friends. Tracking is also weaker in poor lighting.

## What's next

1. Better tracking accuracy in bad lighting.
2. Testing with the players it is designed for.
3. Power-ups and different levels.

## Built with

p5.js, p5.sound, and ml5.js faceMesh. See [CREDITS.md](CREDITS.md) for full credits, including art, AI assistance, and acknowledgments.

## Author

Abdullah Noor, NYU. [noorabdullah.me](https://noorabdullah.me)
Built for an interactive computing course (CSCI-UA 380), Fall 2026.

Same game, just a different way in.
