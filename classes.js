// =====================================================================
// classes.js: the Runner, Obstacle and Coin classes, plus two helpers
// =====================================================================

// How many lanes the path has.
const LANE_COUNT = 3;

// Collision boxes are 70% of the size of the art you can SEE. Pictures have
// some see-through padding, and a slightly small box means near misses
// don't count as hits. That makes the game forgiving for kids.
const HITBOX_SCALE = 0.7;

// The coin and spike ball strips advance one frame every this many draws.
const SHEET_FRAME_DELAY = 6;

// ----- Runner sprite sheet (runner_sheet.png) -----
// 4 columns x 4 rows. Every frame is 72 x 72 pixels.
const RUNNER_FRAME_SIZE = 72;
const RUNNER_FRAMES_PER_ROW = 4;
// Which row of the sheet shows which direction (checked by looking at it).
const RUNNER_ROW_FRONT = 0; // facing the viewer (not used: we run away from you)
const RUNNER_ROW_LEFT = 1;
const RUNNER_ROW_RIGHT = 2;
const RUNNER_ROW_BACK = 3;  // walking away from the viewer, up the path
// The art is already drawn in 3 x 3 pixel blocks. Drawing the 72 px frame at
// 96 px (4/3 the size) turns each 3 x 3 block into an exact 4 x 4 block, so
// the pixels stay square and crisp and the runner is about 76 px tall.
const RUNNER_DRAW_SIZE = 96;
// Size of the visible character inside the drawn frame, for the hitbox.
const RUNNER_VISIBLE_WIDTH = 48;
const RUNNER_VISIBLE_HEIGHT = 80;
// The character sits a little below the middle of its frame (the empty
// space is mostly above its head), so the hitbox moves down this much.
const RUNNER_ART_OFFSET_Y = 7;

// ----- Coin sprite strip (coin_sheet.png) -----
// 8 frames side by side, each 32 x 32. Drawn at 2x (64 x 64).
const COIN_FRAMES = 8;
const COIN_DRAW_SIZE = 64;
const COIN_VISIBLE_SIZE = 40; // the coin itself is about 20 px wide in a 32 px frame


// Returns the x position of the middle of a lane (lane 0, 1 or 2).
function laneCenterX(lane) {
  let laneWidth = width / LANE_COUNT;
  return lane * laneWidth + laneWidth / 2;
}

// Rectangle collision (from class): two rectangles overlap when each one
// starts before the other one ends, both left-to-right and top-to-bottom.
// Each rectangle is an object with x, y (top-left corner), w and h.
function rectsOverlap(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// Makes a hitbox: HITBOX_SCALE of the visible size, centered on (centerX, centerY).
function makeHitbox(centerX, centerY, visibleWidth, visibleHeight) {
  let boxWidth = visibleWidth * HITBOX_SCALE;
  let boxHeight = visibleHeight * HITBOX_SCALE;
  return { x: centerX - boxWidth / 2, y: centerY - boxHeight / 2, w: boxWidth, h: boxHeight };
}


// ---------------------------------------------------------------------
// Runner: the explorer the player controls (an animated sprite)
// ---------------------------------------------------------------------
class Runner {
  // sheet = the runner sprite sheet, y = how far down the canvas the runner stands
  constructor(sheet, y) {
    this.sheet = sheet;
    this.lane = 1;                  // start in the middle lane
    this.x = laneCenterX(this.lane);
    this.y = y;
    this.invincibleUntil = 0;       // millis() time when invincibility ends

    // Animation
    this.currentRow = RUNNER_ROW_BACK; // which row of the sheet (direction)
    this.currentFrame = 0;             // which column of the sheet (0 to 3)
    this.frameTimer = 0;               // counts draws until the next frame
  }

  // Move one lane left. Returns true if the runner actually moved.
  moveLeft() {
    if (this.lane > 0) {
      this.lane = this.lane - 1;
      return true;
    }
    return false;
  }

  // Move one lane right. Returns true if the runner actually moved.
  moveRight() {
    if (this.lane < LANE_COUNT - 1) {
      this.lane = this.lane + 1;
      return true;
    }
    return false;
  }

  // Slide smoothly toward the middle of the current lane. lerp moves 20% of
  // the remaining distance each frame, so it starts fast and eases in.
  update() {
    let targetX = laneCenterX(this.lane);
    this.x = lerp(this.x, targetX, 0.2);
  }

  // Pick the sprite row and step through its frames.
  // frameDelay = how many draws to show each frame (smaller = faster legs).
  updateAnimation(frameDelay) {
    // Still sliding toward a new lane? Face that way. Arrived? Face up the path.
    let targetX = laneCenterX(this.lane);
    if (this.x < targetX - 2) {
      this.currentRow = RUNNER_ROW_RIGHT;
    } else if (this.x > targetX + 2) {
      this.currentRow = RUNNER_ROW_LEFT;
    } else {
      this.currentRow = RUNNER_ROW_BACK;
    }

    // Count draws; every frameDelay draws, move to the next frame (0, 1, 2, 3, 0, ...).
    this.frameTimer = this.frameTimer + 1;
    if (this.frameTimer >= frameDelay) {
      this.frameTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % RUNNER_FRAMES_PER_ROW;
    }
  }

  // Start a period where obstacles can't hurt the runner.
  makeInvincible(milliseconds) {
    this.invincibleUntil = millis() + milliseconds;
  }

  isInvincible() {
    return millis() < this.invincibleUntil;
  }

  // Draw the current frame of the sprite sheet. While invincible, skip every
  // other tenth of a second so the runner blinks.
  draw() {
    if (this.isInvincible() && floor(millis() / 100) % 2 === 0) {
      return;
    }
    // Where the current frame starts inside the sheet: column x 72, row x 72.
    let sourceX = this.currentFrame * RUNNER_FRAME_SIZE;
    let sourceY = this.currentRow * RUNNER_FRAME_SIZE;
    // Top-left corner on the canvas, rounded to whole pixels so the
    // pixel-art blocks stay sharp.
    let drawX = round(this.x - RUNNER_DRAW_SIZE / 2);
    let drawY = round(this.y - RUNNER_DRAW_SIZE / 2);
    // The 9-argument image() draws only PART of a picture:
    //   this.sheet         the whole sprite sheet
    //   drawX, drawY       where to put it on the canvas (top-left corner)
    //   RUNNER_DRAW_SIZE   how wide and how tall to draw it on the canvas (x2)
    //   sourceX, sourceY   where the frame starts inside the sheet
    //   RUNNER_FRAME_SIZE  how wide and how tall the frame is in the sheet (x2)
    image(this.sheet, drawX, drawY, RUNNER_DRAW_SIZE, RUNNER_DRAW_SIZE,
          sourceX, sourceY, RUNNER_FRAME_SIZE, RUNNER_FRAME_SIZE);
  }

  // The rectangle used for collisions: 70% of the visible character.
  getHitbox() {
    return makeHitbox(this.x, this.y + RUNNER_ART_OFFSET_Y, RUNNER_VISIBLE_WIDTH, RUNNER_VISIBLE_HEIGHT);
  }
}


// ---------------------------------------------------------------------
// Obstacle: a spike ball or a log moving down a lane
// ---------------------------------------------------------------------
class Obstacle {
  // lane        0, 1 or 2
  // img         the picture: a sprite strip (spike ball) or a plain picture (log)
  // frameTotal  how many frames sit side by side in img (1 = a plain picture)
  // drawW/drawH the size to draw it on the canvas
  // visibleW/visibleH the size of the art you can see (used for the hitbox)
  constructor(lane, img, frameTotal, drawW, drawH, visibleW, visibleH) {
    this.lane = lane;
    this.img = img;
    this.frameTotal = frameTotal;
    this.w = drawW;
    this.h = drawH;
    this.visibleW = visibleW;
    this.visibleH = visibleH;
    this.x = laneCenterX(lane);
    this.y = -drawH / 2;            // start just above the top edge of the canvas
    // Start on a random frame so spike balls don't all spin in step.
    this.currentFrame = floor(random(frameTotal));
    this.frameTimer = 0;
  }

  // Move down by the current game speed and step the animation.
  update(speed) {
    this.y = this.y + speed;
    this.frameTimer = this.frameTimer + 1;
    if (this.frameTimer >= SHEET_FRAME_DELAY) {
      this.frameTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % this.frameTotal;
    }
  }

  // Draw the current frame with the 9-argument image() (see Runner.draw).
  // A plain picture has 1 frame, so its "frame" is simply the whole picture.
  draw() {
    let frameWidth = this.img.width / this.frameTotal;
    let frameHeight = this.img.height;
    image(this.img, round(this.x - this.w / 2), round(this.y - this.h / 2), this.w, this.h,
          this.currentFrame * frameWidth, 0, frameWidth, frameHeight);
  }

  // True once the obstacle has gone past the bottom of the canvas.
  isOffScreen() {
    return this.y - this.h / 2 > height;
  }

  // The rectangle used for collisions: 70% of the visible art.
  getHitbox() {
    return makeHitbox(this.x, this.y, this.visibleW, this.visibleH);
  }
}


// ---------------------------------------------------------------------
// Coin: a spinning collectible moving down a lane (+1 score)
// ---------------------------------------------------------------------
class Coin {
  // lane = 0, 1 or 2; sheet = the coin sprite strip
  constructor(lane, sheet) {
    this.lane = lane;
    this.sheet = sheet;
    this.x = laneCenterX(lane);
    this.y = -COIN_DRAW_SIZE / 2;
    // Start on a random frame so the coins don't all spin in sync.
    this.currentFrame = floor(random(COIN_FRAMES));
    this.frameTimer = 0;
  }

  // Move down and step the spin animation.
  update(speed) {
    this.y = this.y + speed;
    this.frameTimer = this.frameTimer + 1;
    if (this.frameTimer >= SHEET_FRAME_DELAY) {
      this.frameTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % COIN_FRAMES;
    }
  }

  // Draw the current frame with the 9-argument image() (see Runner.draw).
  draw() {
    let frameSize = this.sheet.width / COIN_FRAMES; // 32
    image(this.sheet, round(this.x - COIN_DRAW_SIZE / 2), round(this.y - COIN_DRAW_SIZE / 2),
          COIN_DRAW_SIZE, COIN_DRAW_SIZE, this.currentFrame * frameSize, 0, frameSize, frameSize);
  }

  isOffScreen() {
    return this.y - COIN_DRAW_SIZE / 2 > height;
  }

  // The rectangle used for collisions: 70% of the visible coin.
  getHitbox() {
    return makeHitbox(this.x, this.y, COIN_VISIBLE_SIZE, COIN_VISIBLE_SIZE);
  }
}
