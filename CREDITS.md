# Credits

## AI assistance

I used **Claude Code** (Anthropic) for parts of this project:

- **`headtilt.js`**: Claude helped me adapt ml5.js's faceMesh example into the head-tilt controller. That covers turning face landmarks into a tilt angle, smoothing the angle, the calibration steps (straight / left / right), slowly tracking the player's resting posture, and pausing when the face is lost.

## My work

Everything else is mine: the game idea, the decision to build it for kids who can't easily use their hands, the game mechanics (lanes, coins, obstacles, lives, difficulty levels, speed-up), and the rest of the code and design. However, as I installed Claude code in my VS Code, I had the code cleaned up and commented by it as well, so it is easier to follow.

## Other resources

- [ml5.js faceMesh](https://docs.ml5js.org/#/reference/facemesh): the face-tracking model and the example `headtilt.js` started from
- [p5.js](https://p5js.org/) and p5.sound
- Runner sprite: ElvGames
- More references are listed in the Resources section of `index.html`
