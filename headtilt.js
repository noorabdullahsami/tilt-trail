// This file uses ml5.js's faceMesh model to measure the player's head tilt and convert it into left/right lane switches. It is a separate file from sketch.js
// because it is a lot of code and we want to keep the game logic in sketch.js
// as simple as possible. I used Anthropic's Claude code to help me write this, and it was very helpful for understanding the math and the calibration logic. Thanks, Claude!

const SIDE_A_POINTS = [33, 133, 234, 127];
const SIDE_B_POINTS = [263, 362, 454, 356];

// How much of the new angle to blend in each frame (0.3 = 30%).
// Smaller = smoother but slower to react. Larger = faster but jumpier.
const SMOOTHING = 0.3;

// How fast "straight" follows slow changes in the player's posture, per
// frame (0.003 = 0.3%). Slow enough that even a slow, deliberate tilt still
// reaches the threshold, fast enough that slouching is absorbed in a few seconds.
const NEUTRAL_FOLLOW_SPEED = 0.003;

// If no face is seen for this many milliseconds, we say the face is "lost".
const FACE_LOST_TIME = 1000;

// Calibration timing for each step (milliseconds).
const CALIBRATION_GET_READY_TIME = 1500; // time to get into position
const CALIBRATION_HOLD_TIME = 2000;      // time we record the angle

// The smallest tilt (in degrees) we can measure reliably. If the player's
// calibrated tilt is smaller than this, webcam jitter would be as big as the
// tilt itself, so we ask them to try calibration again.
const MIN_TILT_RANGE = 3;

// DIRECTION FIX: if tilting your head left moves the runner RIGHT, change
// this one line to true. (Calibration should already get it right; see below.)
const SWAP_TILT_DIRECTIONS = false;


// ---------- Variables that change while the game runs ----------

let video;               // the webcam capture
let faceMesh;            // the ml5 faceMesh model
let faces = [];          // the newest faceMesh results (an array of faces)
let headTiltReady = false; // becomes true once the model has loaded
let cameraStarted = false; // so we never start the camera twice
let lastFaceTime = 0;      // millis() when we last saw a face

let screenLeftPoint = null;  // averaged point on the LEFT of the screen
let screenRightPoint = null; // averaged point on the RIGHT of the screen
let rawAngle = 0;        // the tilt angle this frame, in degrees
let smoothedAngle = 0;   // the jitter-free version we actually use

// Calibration results, all in degrees.
let neutralAngle = 0;    // the angle when the player looks straight ahead
let leftAngle = 0;       // the angle at a comfortable LEFT tilt
let rightAngle = 0;      // the angle at a comfortable RIGHT tilt
let isCalibrated = false;

// The player's "straight" angle right now. It starts at neutralAngle and
// slowly follows the player if they slouch or lean while playing.
let restingAngle = 0;

// Set from the sensitivity slider in sketch.js: 0.3 means "tilt 30% of the
// way from neutral to your calibrated tilt to switch lanes".
let tiltSensitivity = 0.3;

// "Armed" flags: one tilt = one lane. After a switch fires, that direction
// is disarmed until the head comes back near neutral.
let leftArmed = true;
let rightArmed = true;

// Calibration progress.
let calibrationStep = 0;   // 0 = straight, 1 = left, 2 = right
let calibrationTime = 0;   // ms spent on this step (only counts while a face is seen)
let angleTotal = 0;        // running total of angles recorded in this step
let angleCount = 0;        // how many angles we added to angleTotal
let calibrationMessage = ""; // shown if we have to start calibration again


// =====================================================================
// STEP 0: Start the camera and the model
// =====================================================================

// Turns on the webcam and loads faceMesh. It is "async" because loading the
// model takes a few seconds and we must "await" it (the ml5 + p5 2.x way).
// sketch.js calls this WITHOUT await, so the game can keep drawing a
// "Loading camera..." message while the model loads in the background.
async function startHeadTilt() {
  if (cameraStarted) {
    return; // already running
  }
  cameraStarted = true;

  // flipped: true mirrors the image, so moving left looks like moving left.
  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480);
  video.hide(); // we draw the video on the canvas instead of as a page element

  // flipped: true here too, so the keypoints match the mirrored picture.
  // maxFaces: 1 because there is only one player.
  faceMesh = await ml5.faceMesh({ maxFaces: 1, refineLandmarks: false, flipped: true });

  // Ask faceMesh to keep checking the video and call gotFaces() with results.
  faceMesh.detectStart(video, gotFaces);
  headTiltReady = true;
}

// ml5 calls this every time it finishes checking a video frame.
function gotFaces(results) {
  faces = results;
  if (faces.length > 0) {
    lastFaceTime = millis(); // remember when we last saw a face
  }
}

// True when faceMesh is loaded and running.
function isHeadTiltReady() {
  return headTiltReady;
}

// True when we have not seen a face for more than FACE_LOST_TIME ms.
function isFaceLost() {
  return millis() - lastFaceTime > FACE_LOST_TIME;
}


// =====================================================================
// STEPS 1-3: Read the keypoints, compute the angle, smooth it
// =====================================================================

// Returns one point {x, y} that is the average of several keypoints.
function averagePoint(keypoints, indices) {
  let totalX = 0;
  let totalY = 0;
  for (let i = 0; i < indices.length; i++) {
    totalX = totalX + keypoints[indices[i]].x;
    totalY = totalY + keypoints[indices[i]].y;
  }
  return { x: totalX / indices.length, y: totalY / indices.length };
}

// Call this once per frame. It updates rawAngle and smoothedAngle.
function updateHeadTilt() {
  if (faces.length === 0) {
    return; // no face this frame: keep the old angle
  }

  // STEP 1: average each side's 4 keypoints into one point. Each keypoint
  // has an x and a y in video pixels.
  let sideA = averagePoint(faces[0].keypoints, SIDE_A_POINTS);
  let sideB = averagePoint(faces[0].keypoints, SIDE_B_POINTS);

  // Always measure the line from the point on the LEFT of the screen to the
  // point on the RIGHT. Then a level head is 0°, and tilts give small
  // positive or negative angles. (With flipped: true, ml5 puts side A on the
  // left. If we measured right-to-left instead, a level head would be 180°,
  // and a tiny tilt would jump between +179° and -179°.)
  if (sideA.x < sideB.x) {
    screenLeftPoint = sideA;
    screenRightPoint = sideB;
  } else {
    screenLeftPoint = sideB;
    screenRightPoint = sideA;
  }

  // STEP 2: the angle of the line between the two points.
  // dx = how far across (always positive), dy = how far down (y grows
  // downward on screen). atan2(dy, dx) gives the angle in radians: 0 when
  // level, negative when the right end is higher, positive when it is lower.
  let dx = screenRightPoint.x - screenLeftPoint.x;
  let dy = screenRightPoint.y - screenLeftPoint.y;
  rawAngle = degrees(atan2(dy, dx));

  // STEP 3: smooth it. Each frame we move 30% of the way from the old
  // smoothed value toward the new one, so a one-frame jitter barely counts.
  smoothedAngle = lerp(smoothedAngle, rawAngle, SMOOTHING);

  // STEP 3b: follow the player's posture. People slouch and lean while
  // playing, so their "straight" drifts away from the calibrated one. If it
  // drifted far enough, the head would never get "back near straight" and
  // one direction would stop working. So while the head is in the center
  // zone, restingAngle creeps toward the current angle. A quick tilt is far
  // too fast to drag it along, but a slow posture change is absorbed.
  if (isCalibrated && getTiltZone() === "center") {
    restingAngle = lerp(restingAngle, smoothedAngle, NEUTRAL_FOLLOW_SPEED);
  }
}


// =====================================================================
// STEP 4: Calibration (look straight, tilt left, tilt right)
// =====================================================================

// Start (or restart) calibration from the first step.
function beginCalibration() {
  calibrationStep = 0;
  calibrationTime = 0;
  angleTotal = 0;
  angleCount = 0;
  calibrationMessage = "";
}

// Call once per frame during the "calibrate" state.
// Returns true when all three steps are finished and saved.
function updateCalibration() {
  // Only let time pass while we can see a face. If the player moves out of
  // view, the step simply waits for them.
  if (faces.length === 0 || isFaceLost()) {
    return false;
  }
  calibrationTime = calibrationTime + deltaTime;

  // During the "get ready" part we record nothing; after it, we add up the
  // smoothed angle every frame so we can take an average.
  if (calibrationTime > CALIBRATION_GET_READY_TIME) {
    angleTotal = angleTotal + smoothedAngle;
    angleCount = angleCount + 1;
  }

  // Still recording? Then we are not done yet.
  if (calibrationTime < CALIBRATION_GET_READY_TIME + CALIBRATION_HOLD_TIME) {
    return false;
  }

  // This step is finished: the average of the recorded angles is the result.
  let averageAngle = angleTotal / angleCount;
  if (calibrationStep === 0) {
    neutralAngle = averageAngle;
  } else if (calibrationStep === 1) {
    leftAngle = averageAngle;
  } else {
    rightAngle = averageAngle;
  }

  // Get ready for the next step.
  calibrationStep = calibrationStep + 1;
  calibrationTime = 0;
  angleTotal = 0;
  angleCount = 0;

  if (calibrationStep < 3) {
    return false; // more steps to go
  }

  // All three steps done. Check the tilts are big enough to measure and
  // that left and right really went in opposite directions.
  let leftRange = leftAngle - neutralAngle;
  let rightRange = rightAngle - neutralAngle;
  let bigEnough = abs(leftRange) >= MIN_TILT_RANGE && abs(rightRange) >= MIN_TILT_RANGE;
  let oppositeSides = leftRange * rightRange < 0; // one negative, one positive
  if (bigEnough === false || oppositeSides === false) {
    beginCalibration();
    calibrationMessage = "Let's try that again: tilt a little further each way.";
    return false;
  }

  isCalibrated = true;
  restingAngle = neutralAngle;
  saveCalibration();
  // The player is still tilted RIGHT from the last step. Disarm both sides
  // so nothing fires until the head comes back near straight.
  leftArmed = false;
  rightArmed = false;
  return true;
}

// Save the calibration in localStorage so returning players can skip it.
// localStorage only stores text, so JSON.stringify turns the object into text.
function saveCalibration() {
  let calibration = { neutral: neutralAngle, left: leftAngle, right: rightAngle };
  localStorage.setItem("tiltTrail_calibration", JSON.stringify(calibration));
}

// Load a saved calibration (called from setup). On a first visit
// getItem returns null, so we check for that before JSON.parse.
function loadCalibration() {
  let saved = localStorage.getItem("tiltTrail_calibration");
  if (saved !== null) {
    let calibration = JSON.parse(saved);
    // A head tilt is always between -90° and 90°. A saved neutral outside
    // that range came from an older version of this game that measured
    // the angle backwards (near 180°), so ignore it and calibrate again.
    if (abs(calibration.neutral) > 90) {
      return;
    }
    neutralAngle = calibration.neutral;
    leftAngle = calibration.left;
    rightAngle = calibration.right;
    smoothedAngle = neutralAngle;
    restingAngle = neutralAngle;
    isCalibrated = true;
  }
}

// The thresholds: (sensitivity) of the player's calibrated tilt, measured
// from where "straight" is right now. With sensitivity 0.3, resting angle 0
// and a calibrated left tilt of -20, the left threshold is -6.
function getLeftThreshold() {
  return restingAngle + tiltSensitivity * (leftAngle - neutralAngle);
}

function getRightThreshold() {
  return restingAngle + tiltSensitivity * (rightAngle - neutralAngle);
}

// How far the head is tilted toward one side, as a fraction:
// 0 = straight, 1 = the full calibrated tilt, negative = the other way.
// Using a fraction means we never care whether "left" is a negative or a
// positive angle: calibration already recorded which one it is.
function getTiltFraction(sideAngle) {
  return (smoothedAngle - restingAngle) / (sideAngle - neutralAngle);
}


// =====================================================================
// STEP 5: Trigger logic: one tilt = one lane
// =====================================================================

// Returns "left" or "right" on the ONE frame the head crosses a threshold,
// and "" on every other frame. sketch.js calls this every frame during play.
function checkTiltSwitch() {
  if (isCalibrated === false || faces.length === 0) {
    return "";
  }

  let leftFraction = getTiltFraction(leftAngle);
  let rightFraction = getTiltFraction(rightAngle);
  let result = "";

  // Crossed the left threshold, and left is armed? Fire once, then disarm.
  if (leftArmed && leftFraction >= tiltSensitivity) {
    result = "left";
    leftArmed = false;
  }
  if (rightArmed && rightFraction >= tiltSensitivity) {
    result = "right";
    rightArmed = false;
  }

  // Re-arm a direction once the head is back near neutral, meaning less than
  // half of the threshold. Holding a tilt therefore moves only one lane.
  if (leftFraction < tiltSensitivity / 2) {
    leftArmed = true;
  }
  if (rightFraction < tiltSensitivity / 2) {
    rightArmed = true;
  }

  // The one-line direction fix (see SWAP_TILT_DIRECTIONS at the top).
  if (SWAP_TILT_DIRECTIONS && result === "left") {
    result = "right";
  } else if (SWAP_TILT_DIRECTIONS && result === "right") {
    result = "left";
  }
  return result;
}

// Which zone the head is in right now: "left", "center" or "right".
// Used only for the little indicator under the webcam preview.
function getTiltZone() {
  if (isCalibrated === false) {
    return "center";
  }
  if (getTiltFraction(leftAngle) >= tiltSensitivity) {
    return "left";
  }
  if (getTiltFraction(rightAngle) >= tiltSensitivity) {
    return "right";
  }
  return "center";
}


// =====================================================================
// Drawing helpers: webcam preview, calibration screen, debug view
// =====================================================================

// The mirrored webcam picture with a white border, so the player can see
// what the game sees.
function drawWebcamPreview(x, y, previewWidth, previewHeight) {
  if (headTiltReady === false) {
    return;
  }
  image(video, x, y, previewWidth, previewHeight);
  noFill();
  stroke(255);
  strokeWeight(2);
  rect(x, y, previewWidth, previewHeight, 6);
}

// Three boxes (LEFT / CENTER / RIGHT) starting at (x, y). The zone the head
// is in right now is filled in yellow. Only used once calibration is done,
// because before that there are no thresholds to compare against.
function drawTiltIndicator(x, y, indicatorWidth) {
  let zone = getTiltZone();
  let labels = ["left", "center", "right"];
  let boxWidth = indicatorWidth / 3;
  textAlign(CENTER, CENTER);
  textSize(12);
  for (let i = 0; i < labels.length; i++) {
    stroke(255);
    if (labels[i] === zone) {
      fill(255, 200, 0);
    } else {
      fill(0, 0, 0, 120);
    }
    rect(x + i * boxWidth, y, boxWidth, 20, 4);
    noStroke();
    fill(255);
    if (labels[i] === zone) {
      fill(40, 30, 0);
    }
    text(labels[i].toUpperCase(), x + i * boxWidth + boxWidth / 2, y + 10);
  }
}

// The calibration screen: big instructions, a large preview, a progress bar.
function drawCalibrationScreen() {
  background(31, 77, 43);

  let instructions = ["Look straight at the camera",
                      "Tilt your head to the LEFT as far as is comfortable",
                      "Now tilt to the RIGHT"];
  let previewWidth = 320;
  let previewHeight = 240;
  let previewX = width / 2 - previewWidth / 2;
  drawWebcamPreview(previewX, 190, previewWidth, previewHeight);

  noStroke();
  fill(255, 248, 220);
  textAlign(CENTER, CENTER);
  textSize(18);
  text("Calibration: step " + (calibrationStep + 1) + " of 3", width / 2, 40);
  textSize(28);
  text(instructions[calibrationStep], 40, 60, width - 80, 110);

  // What is happening right now: waiting for a face, getting ready, or holding.
  textSize(22);
  if (faces.length === 0 || isFaceLost()) {
    fill(255, 140, 60);
    text("I can't see you! Move into the camera.", width / 2, 470);
  } else if (calibrationTime < CALIBRATION_GET_READY_TIME) {
    let secondsLeft = ceil((CALIBRATION_GET_READY_TIME - calibrationTime) / 1000);
    text("Get ready... " + secondsLeft, width / 2, 470);
  } else {
    text("Hold it there!", width / 2, 470);
  }

  // Progress bar for the holding part of this step.
  let holdProgress = (calibrationTime - CALIBRATION_GET_READY_TIME) / CALIBRATION_HOLD_TIME;
  holdProgress = constrain(holdProgress, 0, 1);
  let barWidth = 320;
  stroke(255);
  strokeWeight(2);
  noFill();
  rect(width / 2 - barWidth / 2, 500, barWidth, 28, 14);
  noStroke();
  fill(255, 200, 0);
  rect(width / 2 - barWidth / 2, 500, barWidth * holdProgress, 28, 14);

  if (calibrationMessage !== "") {
    fill(255, 140, 60);
    textSize(18);
    text(calibrationMessage, 40, 545, width - 80, 60);
  }
}

// Debug view (toggled with the ` key): the 8 keypoints drawn on the preview
// (side A red, side B blue), the line between the two averaged points, and
// the raw and smoothed angle and the thresholds as text.
function drawHeadTiltDebug(previewX, previewY, previewWidth, previewHeight) {
  if (headTiltReady === false) {
    return;
  }
  // Keypoints are in video pixels; scale them down to the preview size.
  if (faces.length > 0 && screenLeftPoint !== null) {
    let scaleFactor = previewWidth / video.width;
    noStroke();
    for (let i = 0; i < SIDE_A_POINTS.length; i++) {
      let pointA = faces[0].keypoints[SIDE_A_POINTS[i]];
      let pointB = faces[0].keypoints[SIDE_B_POINTS[i]];
      fill(255, 60, 0);
      circle(previewX + pointA.x * scaleFactor, previewY + pointA.y * scaleFactor, 5);
      fill(0, 160, 255);
      circle(previewX + pointB.x * scaleFactor, previewY + pointB.y * scaleFactor, 5);
    }
    // The line the angle is measured along.
    stroke(255, 200, 0);
    strokeWeight(2);
    line(previewX + screenLeftPoint.x * scaleFactor, previewY + screenLeftPoint.y * scaleFactor,
         previewX + screenRightPoint.x * scaleFactor, previewY + screenRightPoint.y * scaleFactor);
  }

  // The numbers, on a dark panel so they are readable over the path.
  noStroke();
  fill(0, 0, 0, 170);
  rect(8, 44, 210, 132, 6);
  fill(255);
  textSize(13);
  textAlign(LEFT, TOP);
  text("DEBUG (press ` to hide)", 16, 50);
  text("raw angle: " + nf(rawAngle, 1, 1), 16, 70);
  text("smoothed angle: " + nf(smoothedAngle, 1, 1), 16, 86);
  if (isCalibrated) {
    text("straight (now): " + nf(restingAngle, 1, 1), 16, 102);
    text("left threshold: " + nf(getLeftThreshold(), 1, 1), 16, 118);
    text("right threshold: " + nf(getRightThreshold(), 1, 1), 16, 134);
  } else {
    text("not calibrated yet", 16, 102);
  }
  text("faces seen: " + faces.length, 16, 150);
}
