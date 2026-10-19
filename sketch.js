const RUNNER_SHEET_PATH = "assets/images/runner_sheet.png";  // 4 x 4 frames
const SPIKEBALL_SHEET_PATH = "assets/images/spikeball.png";   // 8 frames in a row
const LOG_IMAGE_PATH = "assets/images/log.png";
const COIN_SHEET_PATH = "assets/images/coin_sheet.png";       // 8 frames in a row
const PATH_IMAGE_PATH = "assets/images/path.png";             // background with lane dividers

const COIN_SOUND_PATH = "assets/sounds/coin.wav";
const HIT_SOUND_PATH = "assets/sounds/hit.wav";
const SWITCH_SOUND_PATH = "assets/sounds/switch.wav";
const GAMEOVER_SOUND_PATH = "assets/sounds/gameover.wav";


// ---------- Game settings ----------

// The runner shows each animation frame for this many draws. Smaller = the legs move faster. Change this one number to tune the walk.
const RUNNER_FRAME_DELAY = 8;

const DIFFICULTY_SETTINGS = {
  easy:   { speed: 2.5, spawnInterval: 1500, frameDelay: RUNNER_FRAME_DELAY },
  medium: { speed: 4,   spawnInterval: 1050, frameDelay: RUNNER_FRAME_DELAY - 2 },
  hard:   { speed: 5.5, spawnInterval: 750,  frameDelay: RUNNER_FRAME_DELAY - 3 }
};
const DIFFICULTY_NAMES = ["easy", "medium", "hard"];
const DIFFICULTY_LABELS = ["Easy", "Medium", "Hard"];

const STARTING_LIVES = 3;
const INVINCIBLE_TIME = 1500;           // ms of blinking after a hit
const MAX_SPEED_MULTIPLIER = 1.5;       // speed never goes past 1.5x the start
const SPEED_INCREASE_PER_FRAME = 0.0001; // reaches 1.5x after about 80 seconds
const COIN_CHANCE = 0.4;                // 40% of spawns are coins, 60% obstacles
const SPAWN_CLEAR_ZONE = 140;           // a lane is "busy" if something is this close to the top

// Position and size of the clickable difficulty boxes on the start screen.
const DIFFICULTY_BOX_Y = 270;
const DIFFICULTY_BOX_WIDTH = 130;
const DIFFICULTY_BOX_HEIGHT = 90;
const DIFFICULTY_BOX_GAP = 15;

// Size of the small webcam preview in the top-right corner.
const PREVIEW_WIDTH = 144;
const PREVIEW_HEIGHT = 108;


// ---------- Images and sounds ----------
let runnerSheet, spikeballSheet, logImage, coinSheet, pathImage;
let coinSound, hitSound, switchSound, gameOverSound;


// ---------- Game variables ----------
let gameState = "start";      // "start", "calibrate", "play", "paused" or "gameover"
let pauseReason = "";         // "face" (face lost) or "player" (pressed P)
let stateAfterCalibration = "play"; // where to go when calibration finishes

let runner;
let obstacles = [];
let coins = [];

let score = 0;
let lives = STARTING_LIVES;
let highScore = 0;
let isNewHighScore = false;

let difficulty = "easy";      // "easy", "medium" or "hard"
let controlMode = "head";     // "head" (camera) or "keyboard"
let speedMultiplier = 1;      // grows slowly during a run
let lastSpawnTime = 0;        // millis() of the last spawn
let pathOffset = 0;           // how far the background has scrolled
let isMuted = false;
let showDebug = false;


// ---------- HTML elements (outside the canvas) ----------
let startButton, controlModeSelect, difficultySelect;
let sensitivitySlider, sensitivityValueText;
let recalibrateButton, muteButton;
let scoreText, livesText, highScoreText;


// setup: load assets, build the canvas, connect the HTML controls
async function setup() {
  let canvas = createCanvas(480, 640);
  canvas.parent("game-container");
  textFont("Fredoka");
  noSmooth();

  // Images
  runnerSheet = await loadImage(RUNNER_SHEET_PATH);
  spikeballSheet = await loadImage(SPIKEBALL_SHEET_PATH);
  logImage = await loadImage(LOG_IMAGE_PATH);
  coinSheet = await loadImage(COIN_SHEET_PATH);
  pathImage = await loadImage(PATH_IMAGE_PATH);

  // Sounds
  coinSound = await loadSound(COIN_SOUND_PATH);
  hitSound = await loadSound(HIT_SOUND_PATH);
  switchSound = await loadSound(SWITCH_SOUND_PATH);
  gameOverSound = await loadSound(GAMEOVER_SOUND_PATH);

  // Find the HTML controls and tell each one which function to run.
  startButton = document.getElementById("start-button");
  controlModeSelect = document.getElementById("control-mode");
  difficultySelect = document.getElementById("difficulty");
  sensitivitySlider = document.getElementById("sensitivity");
  sensitivityValueText = document.getElementById("sensitivity-value");
  recalibrateButton = document.getElementById("recalibrate-button");
  muteButton = document.getElementById("mute-button");
  scoreText = document.getElementById("score");
  livesText = document.getElementById("lives");
  highScoreText = document.getElementById("high-score");

  startButton.addEventListener("click", startGame);
  controlModeSelect.addEventListener("change", changeControlMode);
  difficultySelect.addEventListener("change", changeDifficultyFromSelect);
  sensitivitySlider.addEventListener("input", updateSensitivity); // "input" = live while dragging
  recalibrateButton.addEventListener("click", recalibrate);
  muteButton.addEventListener("click", toggleMute);

  loadSavedSettings();

  // NEW TECHNIQUE: load a saved head-tilt calibration so returning players can skip it.
  loadCalibration();

  // NEW TECHNIQUE: start the webcam + faceMesh. No "await" here on purpose,
  // so draw() can show "Loading camera..." while the model loads.
  if (controlMode === "head") {
    startHeadTilt();
  }

  runner = new Runner(runnerSheet, height - 90);
  updateReadouts();
  updateControlsForState();
}

// Read saved values from localStorage. getItem returns null on a first visit, so we only use a value when it is not null.
function loadSavedSettings() {
  let savedHighScore = localStorage.getItem("tiltTrail_highScore");
  if (savedHighScore !== null) {
    highScore = int(savedHighScore);
  }

  let savedDifficulty = localStorage.getItem("tiltTrail_difficulty");
  if (savedDifficulty !== null) {
    difficulty = savedDifficulty;
  }
  difficultySelect.value = difficulty;

  let savedControlMode = localStorage.getItem("tiltTrail_controlMode");
  if (savedControlMode !== null) {
    controlMode = savedControlMode;
  }
  controlModeSelect.value = controlMode;

  let savedSensitivity = localStorage.getItem("tiltTrail_sensitivity");
  if (savedSensitivity !== null) {
    sensitivitySlider.value = savedSensitivity;
  }
  updateSensitivity();
}


// draw: one if / else if that picks what to do for the current state

function draw() {
  // NEW TECHNIQUE: measure the head-tilt angle every frame in camera mode.
  if (controlMode === "head" && isHeadTiltReady()) {
    updateHeadTilt();
  }

  if (gameState === "start") {
    drawStartScreen();
  } else if (gameState === "calibrate") {
    runCalibration();
  } else if (gameState === "play") {
    playGame();
  } else if (gameState === "paused") {
    drawPausedScreen();
  } else if (gameState === "gameover") {
    drawGameOverScreen();
  }
}


// ---------- "start" state ----------

// Title, pitch, the three difficulty choices, and "Press Start". Nothing moves here: the game waits for the player.
function drawStartScreen() {
  image(pathImage, 0, 0, width, height);
  drawDarkOverlay();

  noStroke();
  fill(255, 214, 10);
  textAlign(CENTER, CENTER);
  textSize(60);
  text("Tilt Trail", width / 2, 110);
  fill(255, 248, 220);
  textSize(20);
  text("Tilt your head to dodge spike balls and grab coins!", width / 2, 170);
  textSize(22);
  text("Choose a difficulty:", width / 2, 235);

  // The three difficulty boxes. The chosen one is yellow.
  for (let i = 0; i < DIFFICULTY_NAMES.length; i++) {
    let boxX = getDifficultyBoxX(i);
    stroke(255);
    strokeWeight(3);
    if (DIFFICULTY_NAMES[i] === difficulty) {
      fill(255, 214, 10);
    } else {
      fill(46, 125, 50);
    }
    rect(boxX, DIFFICULTY_BOX_Y, DIFFICULTY_BOX_WIDTH, DIFFICULTY_BOX_HEIGHT, 16);

    noStroke();
    if (DIFFICULTY_NAMES[i] === difficulty) {
      fill(40, 30, 0);
    } else {
      fill(255);
    }
    textSize(26);
    text(DIFFICULTY_LABELS[i], boxX + DIFFICULTY_BOX_WIDTH / 2, DIFFICULTY_BOX_Y + 36);
    textSize(14);
    text("press " + (i + 1), boxX + DIFFICULTY_BOX_WIDTH / 2, DIFFICULTY_BOX_Y + 66);
  }

  fill(255, 248, 220);
  textSize(32);
  text("Press Start", width / 2, 440);

  // NEW TECHNIQUE: faceMesh takes a few seconds to load.
  if (controlMode === "head" && isHeadTiltReady() === false) {
    fill(255, 160, 60);
    textSize(22);
    text("Loading camera...", width / 2, 500);
  }
}

// The left edge of difficulty box number i (0, 1 or 2), so the row is centered.
function getDifficultyBoxX(i) {
  let rowWidth = 3 * DIFFICULTY_BOX_WIDTH + 2 * DIFFICULTY_BOX_GAP;
  return (width - rowWidth) / 2 + i * (DIFFICULTY_BOX_WIDTH + DIFFICULTY_BOX_GAP);
}


// ---------- "calibrate" state ----------

function runCalibration() {
  // NEW TECHNIQUE: record the player's straight, left and right head angles.
  let finished = updateCalibration();
  if (finished) {
    gameState = stateAfterCalibration;
    updateControlsForState();
    return;
  }
  // NEW TECHNIQUE: big instructions, webcam preview and progress bar.
  drawCalibrationScreen();
}


// ---------- "play" state ----------

function playGame() {
  // NEW TECHNIQUE: pause if the camera hasn't seen a face for about 1 second.
  if (controlMode === "head" && isFaceLost()) {
    pauseGame("face");
    return;
  }

  // NEW TECHNIQUE: ask headtilt.js if the player just tilted past a threshold.
  if (controlMode === "head") {
    let tilt = checkTiltSwitch();
    if (tilt === "left") {
      moveRunner("left");
    } else if (tilt === "right") {
      moveRunner("right");
    }
  }

  // Speed up very slowly, but never past MAX_SPEED_MULTIPLIER.
  speedMultiplier = min(speedMultiplier + SPEED_INCREASE_PER_FRAME, MAX_SPEED_MULTIPLIER);
  let speed = DIFFICULTY_SETTINGS[difficulty].speed * speedMultiplier;

  // Scroll the background, wrapping around after one full canvas height.
  pathOffset = pathOffset + speed;
  if (pathOffset >= height) {
    pathOffset = pathOffset - height;
  }

  // Time to spawn something new?
  if (millis() - lastSpawnTime > DIFFICULTY_SETTINGS[difficulty].spawnInterval) {
    spawnSomething();
    lastSpawnTime = millis();
  }

  runner.update();
  runner.updateAnimation(DIFFICULTY_SETTINGS[difficulty].frameDelay);
  updateObstacles(speed);
  updateCoins(speed);

  drawGameScene();
  drawCameraCorner();

  if (lives <= 0) {
    endGame();
  }
}

// Spawn one coin or one obstacle at the top of a random lane.
function spawnSomething() {
  let lane = floor(random(LANE_COUNT));

  // Don't put a new item on top of one that just appeared in the same lane.
  if (laneIsBusy(lane)) {
    return;
  }

  if (random() < COIN_CHANCE) {
    coins.push(new Coin(lane, coinSheet));
  } else if (random() < 0.5) {
    // Spike ball: 8-frame strip, drawn at 2x (64 x 64); the ball fills its frame.
    obstacles.push(new Obstacle(lane, spikeballSheet, 8, 64, 64, 64, 64));
  } else {
    // Log: one plain picture (1 frame), drawn at its own size, 120 x 44.
    obstacles.push(new Obstacle(lane, logImage, 1, 120, 44, 120, 44));
  }
}

// True if an obstacle or coin in this lane is still near the top of the canvas.
function laneIsBusy(lane) {
  for (let i = 0; i < obstacles.length; i++) {
    if (obstacles[i].lane === lane && obstacles[i].y < SPAWN_CLEAR_ZONE) {
      return true;
    }
  }
  for (let i = 0; i < coins.length; i++) {
    if (coins[i].lane === lane && coins[i].y < SPAWN_CLEAR_ZONE) {
      return true;
    }
  }
  return false;
}

// Move every obstacle, check for hits, and remove ones that are gone. We loop BACKWARDS so removing an item doesn't skip the next one.
function updateObstacles(speed) {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].update(speed);

    let hit = rectsOverlap(runner.getHitbox(), obstacles[i].getHitbox());
    if (hit && runner.isInvincible() === false) {
      lives = lives - 1;
      playSound(hitSound);
      runner.makeInvincible(INVINCIBLE_TIME);
      obstacles.splice(i, 1);
      updateReadouts();
    } else if (obstacles[i].isOffScreen()) {
      obstacles.splice(i, 1);
    }
  }
}

// Move every coin, collect the ones the runner touches, remove ones that are gone.
function updateCoins(speed) {
  for (let i = coins.length - 1; i >= 0; i--) {
    coins[i].update(speed);

    if (rectsOverlap(runner.getHitbox(), coins[i].getHitbox())) {
      score = score + 1;
      playSound(coinSound);
      coins.splice(i, 1);
      updateReadouts();
    } else if (coins[i].isOffScreen()) {
      coins.splice(i, 1);
    }
  }
}

// Draw the path, coins, obstacles, runner and the score/lives text. Used by play, paused and game over, so the scene looks the same in each.
function drawGameScene() {
  // Two copies of the path picture stacked on top of each other. As pathOffset grows they slide down, and the gap is always covered. (The lane dividers are part of the path picture.) round() keeps the pixel art lined up on whole pixels.
  image(pathImage, 0, round(pathOffset), width, height);
  image(pathImage, 0, round(pathOffset) - height, width, height);

  for (let i = 0; i < coins.length; i++) {
    coins[i].draw();
  }
  for (let i = 0; i < obstacles.length; i++) {
    obstacles[i].draw();
  }
  runner.draw();

  if (showDebug) {
    drawHitboxes();
  }

  // Score and lives on the canvas too, so the player doesn't look away.
  noStroke();
  fill(0, 0, 0, 150);
  rect(8, 8, 190, 30, 8);
  fill(255);
  textSize(18);
  textAlign(LEFT, CENTER);
  text("Coins: " + score + "   Lives: " + lives, 18, 23);
}

// Debug view (` key): outline every collision box so we can check that they sit on the visible art. Runner = yellow, obstacles = red, coins = blue.
function drawHitboxes() {
  noFill();
  strokeWeight(2);
  stroke(255, 220, 0);
  let box = runner.getHitbox();
  rect(box.x, box.y, box.w, box.h);
  stroke(255, 40, 40);
  for (let i = 0; i < obstacles.length; i++) {
    box = obstacles[i].getHitbox();
    rect(box.x, box.y, box.w, box.h);
  }
  stroke(0, 160, 255);
  for (let i = 0; i < coins.length; i++) {
    box = coins[i].getHitbox();
    rect(box.x, box.y, box.w, box.h);
  }
}

// In camera mode: the small webcam preview, plus the debug view if it's on.
function drawCameraCorner() {
  if (controlMode !== "head") {
    return;
  }
  let previewX = width - PREVIEW_WIDTH - 10;
  let previewY = 10;
  // NEW TECHNIQUE: show the player what the camera sees, and their tilt zone.
  drawWebcamPreview(previewX, previewY, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  drawTiltIndicator(previewX, previewY + PREVIEW_HEIGHT + 4, PREVIEW_WIDTH);
  if (showDebug) {
    // NEW TECHNIQUE: eye-corner points, angles and thresholds for the demo.
    drawHeadTiltDebug(previewX, previewY, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  }
}

// Move the runner one lane (from the keyboard or from a head tilt).
function moveRunner(direction) {
  if (gameState !== "play") {
    return;
  }
  let moved = false;
  if (direction === "left") {
    moved = runner.moveLeft();
  } else {
    moved = runner.moveRight();
  }
  if (moved) {
    playSound(switchSound);
  }
}


// ---------- "paused" state ----------

function pauseGame(reason) {
  gameState = "paused";
  pauseReason = reason;
}

// Show the frozen game with a message. If we paused because the face waslost, resume by ourselves as soon as the face comes back.
function drawPausedScreen() {
  drawGameScene();
  drawDarkOverlay();

  noStroke();
  fill(255, 248, 220);
  textAlign(CENTER, CENTER);
  if (pauseReason === "face") {
    textSize(32);
    text("I can't see you!", width / 2, height / 2 - 30);
    textSize(24);
    text("Move into the camera.", width / 2, height / 2 + 15);
    // NEW TECHNIQUE: face found again, so carry on playing.
    if (isFaceLost() === false) {
      gameState = "play";
    }
  } else {
    textSize(40);
    text("Paused", width / 2, height / 2 - 30);
    textSize(22);
    text("Press P to keep going", width / 2, height / 2 + 15);
  }
  drawCameraCorner();
}

// P key: pause during play, resume when paused.
function togglePause() {
  if (gameState === "play") {
    pauseGame("player");
  } else if (gameState === "paused") {
    gameState = "play";
  }
}


// ---------- "gameover" state ----------

function endGame() {
  gameState = "gameover";
  playSound(gameOverSound);

  isNewHighScore = false;
  if (score > highScore) {
    highScore = score;
    isNewHighScore = true;
    localStorage.setItem("tiltTrail_highScore", highScore);
  }
  updateReadouts();
  updateControlsForState();
}

function drawGameOverScreen() {
  drawGameScene();
  drawDarkOverlay();

  noStroke();
  textAlign(CENTER, CENTER);
  fill(255, 214, 10);
  textSize(52);
  text("Game Over", width / 2, 180);
  fill(255, 248, 220);
  textSize(30);
  text("Coins: " + score, width / 2, 260);
  text("High score: " + highScore, width / 2, 305);
  if (isNewHighScore) {
    fill(255, 160, 60);
    textSize(34);
    text("New high score!", width / 2, 365);
  }
  fill(255, 248, 220);
  textSize(24);
  text("Press Play Again", width / 2, 450);
}


// ---------- Shared drawing helper ----------

// A see-through dark green layer so text is readable over the path.
function drawDarkOverlay() {
  noStroke();
  fill(20, 50, 25, 200);
  rect(0, 0, width, height);
}


// Starting, resetting and calibrating

// Start / Play Again button.
function startGame() {
  // Browsers block sound until the player clicks something. This click counts.
  userStartAudio();

  // NEW TECHNIQUE: in camera mode, wait until faceMesh has loaded.
  if (controlMode === "head" && isHeadTiltReady() === false) {
    return;
  }

  resetGame();

  // NEW TECHNIQUE: calibrate first if this player has no saved calibration.
  if (controlMode === "head" && isCalibrated === false) {
    beginCalibration();
    stateAfterCalibration = "play";
    gameState = "calibrate";
  } else {
    gameState = "play";
  }
  updateControlsForState();
}

// Put everything back to the start of a new run.
function resetGame() {
  obstacles = [];
  coins = [];
  score = 0;
  lives = STARTING_LIVES;
  speedMultiplier = 1;
  pathOffset = 0;
  lastSpawnTime = millis();
  runner = new Runner(runnerSheet, height - 90);
  updateReadouts();
}

// Recalibrate button. During a run we come back to the same run afterwards. From the start or game-over screen we go back to the start screen.
function recalibrate() {
  // NEW TECHNIQUE: calibration needs the camera to be loaded.
  if (controlMode !== "head" || isHeadTiltReady() === false) {
    return;
  }
  if (gameState === "play" || gameState === "paused") {
    stateAfterCalibration = "play";
  } else if (gameState !== "calibrate") {
    stateAfterCalibration = "start";
  }
  // NEW TECHNIQUE: restart the three calibration steps.
  beginCalibration();
  gameState = "calibrate";
  updateControlsForState();
}


// HTML controls

// Control mode select: "head" or "keyboard". The keyboard works in both.
function changeControlMode() {
  controlMode = controlModeSelect.value;
  localStorage.setItem("tiltTrail_controlMode", controlMode);

  if (controlMode === "head") {
    // NEW TECHNIQUE: turn on the camera the first time head tilt is chosen.
    startHeadTilt();
  } else if (gameState === "calibrate") {
    // Switched to keyboard in the middle of calibrating: leave calibration.
    gameState = "start";
  }
  updateControlsForState();
}

// Difficulty select changed.
function changeDifficultyFromSelect() {
  setDifficulty(difficultySelect.value);
}

// The one place difficulty changes, so the canvas boxes, the 1/2/3 keys and the HTML select always agree.
function setDifficulty(name) {
  difficulty = name;
  difficultySelect.value = name;
  localStorage.setItem("tiltTrail_difficulty", name);
}

// Sensitivity slider (30 to 70). It changes gameplay live.
function updateSensitivity() {
  // NEW TECHNIQUE: headtilt.js uses this fraction to place the thresholds.
  tiltSensitivity = sensitivitySlider.value / 100;
  sensitivityValueText.textContent = sensitivitySlider.value + "%";
  localStorage.setItem("tiltTrail_sensitivity", sensitivitySlider.value);
}

// Mute button.
function toggleMute() {
  isMuted = !isMuted;
  if (isMuted) {
    muteButton.textContent = "Sound: Off";
  } else {
    muteButton.textContent = "Sound: On";
  }
  muteButton.setAttribute("aria-pressed", isMuted);
}

// Play a sound unless the game is muted.
function playSound(sound) {
  if (isMuted === false) {
    sound.play();
  }
}

// Copy score, lives and high score into the HTML readouts.
function updateReadouts() {
  scoreText.textContent = score;
  livesText.textContent = lives;
  highScoreText.textContent = highScore;
}

// Turn controls on or off depending on the state. Difficulty and control mode are locked during a run, and Start can't be pressed mid-game.
function updateControlsForState() {
  let running = gameState === "play" || gameState === "paused";
  difficultySelect.disabled = running || gameState === "calibrate";
  controlModeSelect.disabled = running;
  startButton.disabled = running || gameState === "calibrate";
  recalibrateButton.disabled = controlMode !== "head";

  if (gameState === "gameover") {
    startButton.textContent = "Play Again";
  } else {
    startButton.textContent = "Start";
  }
}


// Keyboard and mouse

// p5 2.x: compare the "key" string, not numeric keyCodes. A/D and Left/Right always work, in BOTH control modes. Many assistive switches send a key press, so this is also the switch-access path.
function keyPressed() {
  if (key === "a" || key === "A") {
    moveRunner("left");
  } else if (key === "d" || key === "D") {
    moveRunner("right");
  } else if (key === "ArrowLeft" && isFocusOnFormControl() === false) {
    moveRunner("left");
    return false; // stop the arrow key from scrolling the page
  } else if (key === "ArrowRight" && isFocusOnFormControl() === false) {
    moveRunner("right");
    return false;
  } else if ((key === "1" || key === "2" || key === "3") && gameState === "start") {
    setDifficulty(DIFFICULTY_NAMES[int(key) - 1]);
  } else if (key === "p" || key === "P") {
    togglePause();
  } else if (key === "`") {
    showDebug = !showDebug; // NEW TECHNIQUE: debug view for the class demo
  }
}

// True when the slider or a select has keyboard focus. Then the arrow keys belong to that control, not to the game.
function isFocusOnFormControl() {
  let tag = document.activeElement.tagName;
  return tag === "INPUT" || tag === "SELECT";
}

// Clicking a difficulty box on the start screen chooses it.
function mousePressed() {
  if (gameState !== "start") {
    return;
  }
  for (let i = 0; i < DIFFICULTY_NAMES.length; i++) {
    let boxX = getDifficultyBoxX(i);
    let insideX = mouseX > boxX && mouseX < boxX + DIFFICULTY_BOX_WIDTH;
    let insideY = mouseY > DIFFICULTY_BOX_Y && mouseY < DIFFICULTY_BOX_Y + DIFFICULTY_BOX_HEIGHT;
    if (insideX && insideY) {
      setDifficulty(DIFFICULTY_NAMES[i]);
    }
  }
}
