// Carom — a top-down paddle duel on the Simple 2D engine.

import type { Game, InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  ACTIONS,
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  BINDINGS,
  CAROM_DEBUG_VERSION,
  CUES,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  MATCHOVER_ITEMS,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  NET_X,
  OBSTACLE_CENTERS,
  OBSTACLE_H,
  OBSTACLE_HH,
  OBSTACLE_HW,
  OBSTACLE_W,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_H,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  PADDLE_W,
  PAUSE_ITEMS,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TITLE_ITEMS,
  TITLE_TEXT,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;
}

export interface MenuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: {
    left: { cy: number; vy: number; drivenVy: number; driven: boolean };
    right: { cy: number; vy: number; drivenVy: number; driven: boolean };
  };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    spin: number;
    held: boolean;
    holdTimer: number;
    serveSign: 1 | -1;
    trail: { x: number; y: number; t: number }[];
  } | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

type State = DeepReadonly<CaromState>;

export interface CaromDebugApi {
  version: number;
  clearWorld(state: State): CaromState;
  spawnBall(state: State): CaromState;
  spawnObstacle(state: State, index: number): CaromState;
  reset(state: State): CaromState;
  reconcile(state: State): CaromState;
  setScreen(state: State, screen: Screen): CaromState;
  setMode(state: State, mode: Mode): CaromState;
  setMenuIndex(state: State, index: number): CaromState;
  setTitleIndex(state: State, index: number): CaromState;
  setResumeScreen(state: State, screen: "countdown" | "playing"): CaromState;
  setScore(state: State, p1: number, p2: number): CaromState;
  setWinner(state: State, side: Side | null): CaromState;
  setReceiver(state: State, side: Side): CaromState;
  setPaddleCy(state: State, side: Side, cy: number): CaromState;
  setPaddleVy(state: State, side: Side, vy: number): CaromState;
  setPaddleDriven(state: State, side: Side, driven: boolean): CaromState;
  setBallPosition(state: State, x: number, y: number): CaromState;
  setBallVelocity(state: State, vx: number, vy: number): CaromState;
  setBallSpin(state: State, spin: number): CaromState;
  setBallHeld(state: State, held: boolean): CaromState;
  setBallHoldTimer(state: State, seconds: number): CaromState;
  setBallServeSign(state: State, sign: 1 | -1): CaromState;
  drawBallServeSign(state: State): CaromState;
  setAiTracking(state: State, enabled: boolean): CaromState;
  setAiMovement(state: State, enabled: boolean): CaromState;
  setMuted(state: State, muted: boolean): CaromState;
  snapshot(state: State): CaromSnapshot;
  menuItemRect(state: State, index: number): MenuRect | null;
}

export const BACKGROUND = "#0a0e1a";

const HOWTO_ITEM = "BACK";

// ---- helpers -------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

const drawServeSign = (): 1 | -1 => (Math.random() < 0.5 ? 1 : -1);

function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

function bothObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((c, index) => ({
    index,
    cx: c.x,
    cy: c.y,
  }));
}

function initialState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: {
      left: { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 },
      right: { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 },
    },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: bothObstacles(),
    simTime: 0,
    muted,
  };
}

function returnToTitle(state: State): CaromState {
  const fresh = initialState(state.muted);
  return {
    ...fresh,
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
    muted: state.muted,
  };
}

function startMatch(state: State, mode: Mode): CaromState {
  return {
    ...state,
    screen: "countdown",
    mode,
    menuIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
  };
}

function menuItems(screen: Screen): readonly string[] | null {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return [HOWTO_ITEM];
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "countdown":
    case "playing":
      return null;
  }
}

function rectFor(screen: Screen, index: number): MenuRect | null {
  const items = menuItems(screen);
  if (!items || index < 0 || index >= items.length) return null;
  const w = 420;
  const x = FIELD_CX - w / 2;
  const h = 56;
  const gap = 74;
  let top = 350;
  if (screen === "howto") top = 590;
  else if (screen === "paused") top = 310;
  else if (screen === "matchover") top = 400;
  return { x, y: top + index * gap, w, h };
}

function requireBall(state: State): DeepReadonly<BallState> {
  if (!state.ball) throw new Error("Carom: no ball on the field");
  return state.ball;
}

function withBall(state: State, ball: BallState): CaromState {
  return { ...(state as CaromState), ball };
}

function withPaddle(state: State, side: Side, paddle: PaddleState): CaromState {
  const s = state as CaromState;
  return {
    ...s,
    paddles:
      side === "left"
        ? { ...s.paddles, left: paddle }
        : { ...s.paddles, right: paddle },
  };
}

// ---- debug surface --------------------------------------------------------

const debug: CaromDebugApi = {
  version: CAROM_DEBUG_VERSION,
  clearWorld: (state) => ({
    ...(state as CaromState),
    ball: null,
    obstacles: [],
  }),
  spawnBall: (state) => withBall(state, parkedBall()),
  spawnObstacle: (state, index) => {
    if (index !== 0 && index !== 1)
      throw new Error(`Carom: no obstacle with index ${index}`);
    const c = OBSTACLE_CENTERS[index];
    const rest = state.obstacles.filter((o) => o.index !== index);
    const next = [...rest, { index, cx: c.x, cy: c.y }].sort(
      (a, b) => a.index - b.index,
    );
    return { ...(state as CaromState), obstacles: next };
  },
  reset: (state) => initialState(state.muted),
  reconcile: (state) => ({ ...(state as CaromState) }),
  setScreen: (state, screen) => ({ ...(state as CaromState), screen }),
  setMode: (state, mode) => ({ ...(state as CaromState), mode }),
  setMenuIndex: (state, menuIndex) => ({
    ...(state as CaromState),
    menuIndex,
  }),
  setTitleIndex: (state, titleIndex) => ({
    ...(state as CaromState),
    titleIndex,
  }),
  setResumeScreen: (state, resumeScreen) => ({
    ...(state as CaromState),
    resumeScreen,
  }),
  setScore: (state, p1, p2) => ({
    ...(state as CaromState),
    score: { p1, p2 },
  }),
  setWinner: (state, winner) => ({ ...(state as CaromState), winner }),
  setReceiver: (state, receiver) => ({
    ...(state as CaromState),
    receiver,
  }),
  setPaddleCy: (state, side, cy) =>
    withPaddle(state, side, {
      ...(side === "left" ? state.paddles.left : state.paddles.right),
      cy,
    }),
  setPaddleVy: (state, side, vy) =>
    withPaddle(state, side, {
      ...(side === "left" ? state.paddles.left : state.paddles.right),
      drivenVy: vy,
    }),
  setPaddleDriven: (state, side, driven) =>
    withPaddle(state, side, {
      ...(side === "left" ? state.paddles.left : state.paddles.right),
      driven,
    }),
  setBallPosition: (state, x, y) => {
    const b = requireBall(state);
    return withBall(state, { ...b, x, y });
  },
  setBallVelocity: (state, vx, vy) => {
    const b = requireBall(state);
    return withBall(state, { ...b, vx, vy });
  },
  setBallSpin: (state, spin) => {
    const b = requireBall(state);
    return withBall(state, { ...b, spin });
  },
  setBallHeld: (state, held) => {
    const b = requireBall(state);
    return withBall(state, { ...b, held });
  },
  setBallHoldTimer: (state, holdTimer) => {
    const b = requireBall(state);
    return withBall(state, { ...b, holdTimer });
  },
  setBallServeSign: (state, serveSign) => {
    const b = requireBall(state);
    return withBall(state, { ...b, serveSign });
  },
  drawBallServeSign: (state) => {
    const b = requireBall(state);
    return withBall(state, { ...b, serveSign: drawServeSign() });
  },
  setAiTracking: (state, tracking) => ({
    ...(state as CaromState),
    ai: { ...state.ai, tracking },
  }),
  setAiMovement: (state, movement) => ({
    ...(state as CaromState),
    ai: { ...state.ai, movement },
  }),
  setMuted: (state, muted) => ({ ...(state as CaromState), muted }),
  snapshot: (state) => ({
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: {
        cy: state.paddles.left.cy,
        vy: state.paddles.left.vy,
        drivenVy: state.paddles.left.drivenVy,
        driven: state.paddles.left.driven,
      },
      right: {
        cy: state.paddles.right.cy,
        vy: state.paddles.right.vy,
        drivenVy: state.paddles.right.drivenVy,
        driven: state.paddles.right.driven,
      },
    },
    ai: { tracking: state.ai.tracking, movement: state.ai.movement },
    receiver: state.receiver,
    ball: state.ball
      ? {
          x: state.ball.x,
          y: state.ball.y,
          vx: state.ball.vx,
          vy: state.ball.vy,
          speed: Math.hypot(state.ball.vx, state.ball.vy),
          spin: state.ball.spin,
          held: state.ball.held,
          holdTimer: state.ball.holdTimer,
          serveSign: state.ball.serveSign,
          trail: state.ball.trail.map((t) => ({ x: t.x, y: t.y, t: t.t })),
        }
      : null,
    obstacles: state.obstacles.map((o) => ({
      index: o.index,
      cx: o.cx,
      cy: o.cy,
    })),
    simTime: state.simTime,
  }),
  menuItemRect: (state, index) => rectFor(state.screen, index),
};

// ---- simulation -----------------------------------------------------------

function integratePaddle(
  paddle: DeepReadonly<PaddleState>,
  desiredVy: number,
  dt: number,
): PaddleState {
  let vy = desiredVy;
  const next = clamp(paddle.cy + vy * dt, PADDLE_MIN_CY, PADDLE_MAX_CY);
  if (next !== paddle.cy + vy * dt && dt > 0) vy = (next - paddle.cy) / dt;
  // If cy is posed outside the clamp, (next-cy)/dt is still the actual vy.
  return { ...paddle, cy: next, vy };
}

interface FrameInput {
  upEdge: boolean;
  downEdge: boolean;
  confirmEdge: boolean;
  backEdge: boolean;
  pauseEdge: boolean;
  pointerSelection: number | null;
  pointerConfirm: number | null;
}

function confirmMenuItem(state: State, index: number): CaromState | null {
  const s = state as CaromState;
  switch (state.screen) {
    case "title": {
      const withTitle: State = { ...s, titleIndex: index };
      if (index === 0) return startMatch(withTitle, "solo");
      if (index === 1) return startMatch(withTitle, "versus");
      if (index === 2)
        return { ...s, titleIndex: index, screen: "howto", menuIndex: 0 };
      return null;
    }
    case "howto":
      return index === 0 ? returnToTitle(state) : null;
    case "paused":
      if (index === 0) return { ...s, screen: state.resumeScreen };
      if (index === 1) return startMatch(state, state.mode);
      if (index === 2) return returnToTitle(state);
      return null;
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      if (index === 1) return returnToTitle(state);
      return null;
    default:
      return null;
  }
}

function handleMenu(state: State, input: FrameInput): CaromState {
  const s = state as CaromState;
  // Paused: pause/back resume before anything else.
  if (state.screen === "paused" && (input.pauseEdge || input.backEdge)) {
    return { ...s, screen: state.resumeScreen };
  }
  if (state.screen === "howto" && input.backEdge) {
    return returnToTitle(state);
  }
  if (state.screen === "matchover" && input.backEdge) {
    return returnToTitle(state);
  }
  const items = menuItems(state.screen);
  if (!items) return s;
  const count = items.length;

  const moved = input.upEdge || input.downEdge;
  let menuIndex = state.menuIndex;
  if (input.upEdge) menuIndex = (menuIndex - 1 + count) % count;
  else if (input.downEdge) menuIndex = (menuIndex + 1) % count;

  // Keyboard confirm (movement wins over confirm on the same frame).
  if (input.confirmEdge && !moved) {
    // A pointer confirm on the same frame does not steal the keyboard's item.
    const result = confirmMenuItem({ ...s, menuIndex }, menuIndex);
    if (result) return result;
    // confirm on an out-of-range index does nothing
    return { ...s, menuIndex };
  }

  // Pointer / touch confirm.
  if (input.pointerConfirm !== null) {
    const result = confirmMenuItem(
      { ...s, menuIndex: input.pointerConfirm },
      input.pointerConfirm,
    );
    if (result) return result;
    return { ...s, menuIndex: input.pointerConfirm };
  }

  if (input.pointerSelection !== null) menuIndex = input.pointerSelection;
  return { ...s, menuIndex };
}

interface PaddleMoves {
  left: PaddleState;
  right: PaddleState;
}

function movePaddles(state: State, api: UpdateApi, dt: number): PaddleMoves {
  const leftP = state.paddles.left;
  const rightP = state.paddles.right;

  let leftVy: number;
  if (leftP.driven) leftVy = leftP.drivenVy;
  else {
    let up: number;
    let down: number;
    if (state.mode === "solo") {
      up = Math.max(api.input.value("p1-up"), api.input.value("p2-up"));
      down = Math.max(api.input.value("p1-down"), api.input.value("p2-down"));
    } else {
      up = api.input.value("p1-up");
      down = api.input.value("p1-down");
    }
    leftVy = (down - up) * PADDLE_SPEED;
  }

  let rightVy: number;
  if (rightP.driven) rightVy = rightP.drivenVy;
  else if (state.mode === "versus") {
    const up = api.input.value("p2-up");
    const down = api.input.value("p2-down");
    rightVy = (down - up) * PADDLE_SPEED;
  } else {
    // AI
    if (!state.ai.movement) rightVy = 0;
    else {
      let target = AI_HOME_Y;
      let deadzone = AI_HOME_DEADZONE;
      if (
        state.ai.tracking &&
        state.screen === "playing" &&
        state.ball &&
        state.ball.vx > 0
      ) {
        target = state.ball.y - state.ball.vy * AI_REACT;
        deadzone = AI_DEADZONE;
      }
      const diff = target - rightP.cy;
      if (Math.abs(diff) <= deadzone) rightVy = 0;
      else if (dt > 0)
        rightVy = Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
      else rightVy = Math.sign(diff) * AI_SPEED;
    }
  }

  return {
    left: integratePaddle(leftP, leftVy, dt),
    right: integratePaddle(rightP, rightVy, dt),
  };
}

function appendTrail(ball: BallState, simTime: number): BallState {
  const trail = [...ball.trail, { x: ball.x, y: ball.y, t: simTime }].filter(
    (sample) => simTime - sample.t <= TRAIL_TIME,
  );
  return { ...ball, trail };
}

type Face = "left" | "right" | "top" | "bottom";

interface RectHit {
  face: Face;
  x: number;
  y: number;
}

function circleRect(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): RectHit | null {
  if (!(
    x > x0 - BALL_R &&
    x < x1 + BALL_R &&
    y > y0 - BALL_R &&
    y < y1 + BALL_R
  ))
    return null;
  const left = x - (x0 - BALL_R);
  const right = x1 + BALL_R - x;
  const top = y - (y0 - BALL_R);
  const bottom = y1 + BALL_R - y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { face: "left", x: x0 - BALL_R, y };
  if (min === right) return { face: "right", x: x1 + BALL_R, y };
  if (min === top) return { face: "top", x, y: y0 - BALL_R };
  return { face: "bottom", x, y: y1 + BALL_R };
}

interface Events {
  paddle: boolean;
  wall: boolean;
  obstacle: boolean;
}

function advanceBall(
  state: State & { paddles: PaddleMoves },
  dt: number,
): { ball: BallState; events: Events } | null {
  if (!state.ball) return null;
  let { x, y, vx, vy, spin } = state.ball;
  const events: Events = { paddle: false, wall: false, obstacle: false };
  const startSpeed = Math.hypot(vx, vy);
  const n = Math.max(1, Math.ceil((startSpeed * dt) / MAX_SUBSTEP));
  const h = dt / n;
  const leftP = state.paddles.left;
  const rightP = state.paddles.right;

  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(vx, vy);
    if (speed > 0) {
      const angle = (spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nvx = vx * cos - vy * sin;
      const nvy = vx * sin + vy * cos;
      vx = nvx;
      vy = nvy;
    }
    spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
    x += vx * h;
    y += vy * h;

    // Walls
    if (y - BALL_R < 0 && vy < 0) {
      y = BALL_R;
      vy = -vy;
      events.wall = true;
    } else if (y + BALL_R > FIELD_H && vy > 0) {
      y = FIELD_H - BALL_R;
      vy = -vy;
      events.wall = true;
    }

    // Paddles
    const paddles: {
      x0: number;
      x1: number;
      paddle: PaddleState;
      dir: 1 | -1;
      frontX: number;
    }[] = [
      {
        x0: P1_X0,
        x1: P1_X1,
        paddle: leftP,
        dir: 1,
        frontX: P1_X1 + BALL_R,
      },
      {
        x0: P2_X0,
        x1: P2_X1,
        paddle: rightP,
        dir: -1,
        frontX: P2_X0 - BALL_R,
      },
    ];
    for (const p of paddles) {
      const hit = circleRect(
        x,
        y,
        p.x0,
        p.paddle.cy - PADDLE_HALF,
        p.x1,
        p.paddle.cy + PADDLE_HALF,
      );
      if (!hit) continue;
      x = hit.x;
      y = hit.y;
      if (hit.face === "left" || hit.face === "right") {
        const offset = clamp((y - p.paddle.cy) / PADDLE_HALF, -1, 1);
        const theta = offset * MAX_BOUNCE_ANGLE;
        const contactSpeed = Math.hypot(vx, vy);
        const newSpeed = Math.min(contactSpeed * SPEED_MULT, SPEED_CAP);
        vx = p.dir * newSpeed * Math.cos(theta);
        vy = newSpeed * Math.sin(theta);
        spin = clamp(
          spin + p.paddle.vy * SPIN_FROM_PADDLE,
          -SPIN_CLAMP,
          SPIN_CLAMP,
        );
        x = p.frontX;
        events.paddle = true;
      } else if (hit.face === "top") {
        if (vy > 0) {
          vy = -vy;
          events.wall = true;
        }
      } else {
        if (vy < 0) {
          vy = -vy;
          events.wall = true;
        }
      }
    }

    // Obstacles in state order (indices 0,1)
    for (const obs of state.obstacles) {
      const rect = OBSTACLES[obs.index];
      if (!rect) continue;
      const hit = circleRect(x, y, rect.x0, rect.y0, rect.x1, rect.y1);
      if (!hit) continue;
      x = hit.x;
      y = hit.y;
      if (hit.face === "left" && vx > 0) {
        vx = -vx;
        events.obstacle = true;
      } else if (hit.face === "right" && vx < 0) {
        vx = -vx;
        events.obstacle = true;
      } else if (hit.face === "top" && vy > 0) {
        vy = -vy;
        events.obstacle = true;
      } else if (hit.face === "bottom" && vy < 0) {
        vy = -vy;
        events.obstacle = true;
      }
    }
  }

  return {
    ball: { ...state.ball, x, y, vx, vy, spin },
    events,
  };
}

function playEvents(api: UpdateApi, events: Events, scored: boolean): void {
  if (events.paddle) api.audio.play(CUES.paddleHit);
  if (events.wall) api.audio.play(CUES.wallBounce);
  if (events.obstacle) api.audio.play(CUES.obstacleBounce);
  if (scored) api.audio.play(CUES.score);
}

// ---- game -----------------------------------------------------------------

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    api.audio.define(CUES.paddleHit, {
      wave: "square",
      freq: 540,
      freqTo: 320,
      durationMs: 70,
      gain: 0.18,
    });
    api.audio.define(CUES.wallBounce, {
      wave: "sine",
      freq: 300,
      freqTo: 210,
      durationMs: 60,
      gain: 0.16,
    });
    api.audio.define(CUES.obstacleBounce, {
      wave: "triangle",
      freq: 430,
      freqTo: 260,
      durationMs: 80,
      gain: 0.18,
    });
    api.audio.define(CUES.score, {
      wave: "square",
      freq: 660,
      freqTo: 990,
      durationMs: 180,
      gain: 0.2,
    });

    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("score-p1", (s) => s.score.p1);
    api.diagnostics.register("score-p2", (s) => s.score.p2);
    api.diagnostics.register("ball-x", (s) =>
      s.ball ? Math.round(s.ball.x) : "none",
    );
    api.diagnostics.register("ball-y", (s) =>
      s.ball ? Math.round(s.ball.y) : "none",
    );
    api.diagnostics.register("ball-vx", (s) =>
      s.ball ? Math.round(s.ball.vx) : "none",
    );
    api.diagnostics.register("ball-vy", (s) =>
      s.ball ? Math.round(s.ball.vy) : "none",
    );
    api.diagnostics.register("ball-speed", (s) =>
      s.ball ? Math.round(Math.hypot(s.ball.vx, s.ball.vy)) : "none",
    );
    api.diagnostics.register("ball-spin", (s) =>
      s.ball ? Math.round(s.ball.spin) : "none",
    );
    api.diagnostics.register("paddle-left-cy", (s) =>
      Math.round(s.paddles.left.cy),
    );
    api.diagnostics.register("paddle-left-vy", (s) =>
      Math.round(s.paddles.left.vy),
    );
    api.diagnostics.register("paddle-right-cy", (s) =>
      Math.round(s.paddles.right.cy),
    );
    api.diagnostics.register("paddle-right-vy", (s) =>
      Math.round(s.paddles.right.vy),
    );

    return [initialState(false), debug];
  },

  update(state, api, dt): CaromState {
    const simTime = state.simTime + dt;

    // Mute: a press edge toggles the runtime bit. The state mirrors the
    // runtime bit, except that debug's setMuted writes the state bit and
    // the runtime follows it. The two disagree only after such a pose.
    const muteEdge = api.input.pressed("mute");
    let muted = state.muted;
    if (muteEdge) {
      api.audio.setMuted(!state.muted);
      muted = api.audio.muted();
    } else if (api.audio.muted() !== state.muted) {
      api.audio.setMuted(state.muted);
      muted = state.muted;
    }

    const base: CaromState = {
      ...(state as CaromState),
      simTime,
      muted,
    };

    // Read every edge once.
    const upEdge = api.input.pressed("p1-up") || api.input.pressed("p2-up");
    const downEdge =
      api.input.pressed("p1-down") || api.input.pressed("p2-down");
    const confirmEdge = api.input.pressed("confirm");
    const backEdge = api.input.pressed("back");
    const pauseEdge = api.input.pressed("pause");

    // Pointer / touch for menus.
    let pointerSelection: number | null = null;
    let pointerConfirm: number | null = null;
    const isMenu = menuItems(state.screen) !== null;
    if (isMenu) {
      const items = menuItems(state.screen) as readonly string[];
      const indexAt = (x: number, y: number): number | null => {
        for (let i = 0; i < items.length; i++) {
          const r = rectFor(state.screen, i);
          if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
            return i;
        }
        return null;
      };
      const pointer = api.input.pointer();
      pointerSelection = indexAt(pointer.x, pointer.y);
      const samples = api.input.pointerSamples();
      const downById = new Map<number, number | null>();
      for (const sample of samples) {
        const idx = indexAt(sample.x, sample.y);
        if (sample.type === "down") {
          downById.set(sample.id, idx);
          if (idx !== null) pointerSelection = idx;
        } else if (sample.type === "move") {
          if (idx !== null) pointerSelection = idx;
        } else {
          // up
          if (downById.has(sample.id)) {
            const downIdx = downById.get(sample.id) ?? null;
            if (downIdx !== null && downIdx === idx) pointerConfirm = downIdx;
          } else if (idx !== null && idx === state.menuIndex) {
            // A press on an earlier frame selected this item; a lift on
            // the same item confirms it, a lift elsewhere does not.
            pointerConfirm = idx;
          }
          if (idx !== null) pointerSelection = idx;
        }
      }
      for (const contact of api.input.pointerContacts()) {
        const idx = indexAt(contact.x, contact.y);
        if (idx !== null) pointerSelection = idx;
      }
      if (pointerConfirm !== null) pointerSelection = pointerConfirm;
    }

    const input: FrameInput = {
      upEdge,
      downEdge,
      confirmEdge,
      backEdge,
      pauseEdge,
      pointerSelection,
      pointerConfirm,
    };

    switch (state.screen) {
      case "title":
      case "howto":
      case "matchover":
        return handleMenu(base, input);
      case "paused":
        return handleMenu(base, input);
      case "countdown":
      case "playing": {
        if (pauseEdge) {
          return {
            ...base,
            resumeScreen: state.screen,
            screen: "paused",
            menuIndex: 0,
          };
        }
        const paddles = movePaddles(base, api, dt);
        const withPaddles: CaromState = { ...base, paddles };

        if (state.screen === "countdown") {
          if (!withPaddles.ball) return withPaddles;
          const holdTimer = withPaddles.ball.holdTimer - dt;
          if (holdTimer <= 0) {
            const dir = state.receiver === "left" ? -1 : 1;
            const served: BallState = {
              ...withPaddles.ball,
              holdTimer: 0,
              held: false,
              trail: [],
              vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
              vy:
                withPaddles.ball.serveSign *
                SERVE_SPEED *
                Math.sin(SERVE_ANGLE),
            };
            return { ...withPaddles, screen: "playing", ball: served };
          }
          const heldBall: BallState = {
            ...withPaddles.ball,
            holdTimer,
          };
          return {
            ...withPaddles,
            ball: appendTrail(heldBall, simTime),
          };
        }

        // playing
        if (!withPaddles.ball) return withPaddles;
        const advanced = advanceBall(
          withPaddles as State & { paddles: PaddleMoves },
          dt,
        );
        if (!advanced) return withPaddles;
        const ballWithTrail = appendTrail(advanced.ball, simTime);

        let scorer: Side | null = null;
        if (ballWithTrail.x - BALL_R > FIELD_W) scorer = "left";
        else if (ballWithTrail.x + BALL_R < 0) scorer = "right";

        if (!scorer) {
          playEvents(api, advanced.events, false);
          return { ...withPaddles, ball: ballWithTrail };
        }

        playEvents(api, advanced.events, true);
        const score =
          scorer === "left"
            ? { p1: state.score.p1 + 1, p2: state.score.p2 }
            : { p1: state.score.p1, p2: state.score.p2 + 1 };
        const p1Wins = score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD;
        const p2Wins = score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD;
        if (p1Wins || p2Wins) {
          return {
            ...withPaddles,
            score,
            winner: p1Wins ? "left" : "right",
            screen: "matchover",
            menuIndex: 0,
            ball: ballWithTrail,
          };
        }
        return {
          ...withPaddles,
          score,
          receiver: scorer === "left" ? "right" : "left",
          screen: "countdown",
          ball: parkedBall(),
        };
      }
    }
  },

  render(state, api): void {
    const ctx = api.ctx;
    // Field
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);

    const dimmed =
      state.screen === "title" ||
      state.screen === "howto" ||
      state.screen === "matchover";

    drawField(ctx, state, dimmed);

    if (
      state.screen === "playing" ||
      state.screen === "countdown" ||
      state.screen === "paused" ||
      state.screen === "matchover"
    ) {
      drawScores(ctx, state);
    }

    switch (state.screen) {
      case "title":
        drawTitle(ctx, state);
        break;
      case "howto":
        drawHowto(ctx, state);
        break;
      case "countdown":
        drawCountdown(ctx, state);
        break;
      case "paused":
        drawPause(ctx, state);
        break;
      case "matchover":
        drawMatchover(ctx, state);
        break;
      case "playing":
        break;
    }
  },
};

// ---- rendering ------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawField(
  ctx: CanvasRenderingContext2D,
  state: State,
  dimmed: boolean,
): void {
  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.45;
  // border
  ctx.strokeStyle = "#26335f";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, FIELD_W - 4, FIELD_H - 4);
  // net
  ctx.strokeStyle = "#3b4a7a";
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 12);
  ctx.lineTo(NET_X, FIELD_H - 12);
  ctx.stroke();
  ctx.setLineDash([]);
  // center circle
  ctx.strokeStyle = "#26335f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 70, 0, Math.PI * 2);
  ctx.stroke();

  // obstacles
  for (const obs of state.obstacles) {
    ctx.fillStyle = "#8b5cf6";
    roundRect(
      ctx,
      obs.cx - OBSTACLE_HW,
      obs.cy - OBSTACLE_HH,
      OBSTACLE_W,
      OBSTACLE_H,
      9,
    );
    ctx.fill();
    ctx.fillStyle = "#c4b5fd";
    ctx.fillRect(obs.cx - 3, obs.cy - OBSTACLE_HH + 12, 6, OBSTACLE_H - 24);
  }

  // trail
  if (state.ball && state.ball.trail.length > 1) {
    const trail = state.ball.trail;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      if (!a || !b) continue;
      ctx.strokeStyle = `rgba(250, 204, 21, ${0.12 + (0.5 * i) / trail.length})`;
      ctx.lineWidth = 3 + (5 * i) / trail.length;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // paddles
  ctx.fillStyle = "#22d3ee";
  roundRect(
    ctx,
    P1_X0,
    state.paddles.left.cy - PADDLE_HALF,
    PADDLE_W,
    PADDLE_H,
    7,
  );
  ctx.fill();
  ctx.fillStyle = "#fb7185";
  roundRect(
    ctx,
    P2_X0,
    state.paddles.right.cy - PADDLE_HALF,
    PADDLE_W,
    PADDLE_H,
    7,
  );
  ctx.fill();

  // ball
  if (state.ball) {
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fef9c3";
    ctx.beginPath();
    ctx.arc(state.ball.x - 3, state.ball.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawScores(ctx: CanvasRenderingContext2D, state: State): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.fillStyle = "#67e8f9";
  ctx.fillText(String(state.score.p1), FIELD_CX - 110, 58);
  ctx.fillStyle = "#fda4af";
  ctx.fillText(String(state.score.p2), FIELD_CX + 110, 58);
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(state.mode === "solo" ? "SOLO" : "VERSUS", FIELD_CX, 112);
}

function drawMenuItems(
  ctx: CanvasRenderingContext2D,
  state: State,
  items: readonly string[],
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < items.length; i++) {
    const r = rectFor(state.screen, i);
    const label = items[i];
    if (!r || label === undefined) continue;
    const selected = i === state.menuIndex;
    ctx.fillStyle = selected ? "#facc15" : "#1e293b";
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.strokeStyle = selected ? "#fef08a" : "#475569";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = selected ? "#111827" : "#e2e8f0";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }
}

function panel(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(3, 7, 18, 0.68)";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawTitle(ctx: CanvasRenderingContext2D, state: State): void {
  panel(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#facc15";
  ctx.font = "900 110px system-ui, sans-serif";
  ctx.fillText(TITLE_TEXT, FIELD_CX, 150);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "500 26px system-ui, sans-serif";
  ctx.fillText("Spin the ball. Bank it past the obstacles.", FIELD_CX, 225);
  ctx.font = "400 20px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    "First to 11, by 2  •  W/S or ↑/↓  •  P pause  •  M mute",
    FIELD_CX,
    265,
  );
  drawMenuItems(ctx, state, TITLE_ITEMS);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 18px system-ui, sans-serif";
  ctx.fillText("Enter / Space or click to choose", FIELD_CX, 620);
}

function drawHowto(ctx: CanvasRenderingContext2D, state: State): void {
  panel(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#facc15";
  ctx.font = "800 56px system-ui, sans-serif";
  ctx.fillText("HOW TO PLAY", FIELD_CX, 92);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "500 24px system-ui, sans-serif";
  const lines = [
    "Solo: move the left paddle with W/S or ↑/↓.",
    "Versus: left player W/S, right player ↑/↓.",
    "Move your paddle as it strikes to add spin —",
    "spin curves the ball in flight, then fades.",
    "The purple obstacles block the middle: bank shots",
    "around them, or curve the ball past them.",
    "Score by sending the ball past the far edge.",
    "First to 11 points, leading by 2, wins.",
    "P / Esc pauses, M mutes, Enter confirms.",
  ];
  lines.forEach((line, i) => ctx.fillText(line, FIELD_CX, 160 + i * 38));
  drawMenuItems(ctx, state, [HOWTO_ITEM]);
}

function drawCountdown(ctx: CanvasRenderingContext2D, state: State): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 54px system-ui, sans-serif";
  const n = state.ball ? Math.max(1, Math.ceil(state.ball.holdTimer)) : 1;
  ctx.fillText(String(n), FIELD_CX, FIELD_CY - 120);
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(
    state.receiver === "left" ? "Serve to the left" : "Serve to the right",
    FIELD_CX,
    FIELD_CY + 110,
  );
}

function drawPause(ctx: CanvasRenderingContext2D, state: State): void {
  panel(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 56px system-ui, sans-serif";
  ctx.fillText("PAUSED", FIELD_CX, 210);
  drawMenuItems(ctx, state, PAUSE_ITEMS);
}

function drawMatchover(ctx: CanvasRenderingContext2D, state: State): void {
  panel(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#facc15";
  ctx.font = "900 68px system-ui, sans-serif";
  ctx.fillText(
    state.winner === "left"
      ? "LEFT WINS!"
      : state.winner === "right"
        ? "RIGHT WINS!"
        : "MATCH OVER",
    FIELD_CX,
    190,
  );
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 44px system-ui, sans-serif";
  ctx.fillText(`${state.score.p1}  —  ${state.score.p2}`, FIELD_CX, 265);
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    state.mode === "solo"
      ? state.winner === "left"
        ? "You beat the AI."
        : "The AI takes this one."
      : "A hard-fought duel.",
    FIELD_CX,
    315,
  );
  drawMenuItems(ctx, state, MATCHOVER_ITEMS);
}
