import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
  type SurfaceMetrics,
} from "@clockwyrks/simple-2d";
import { FIELD_CX, FIELD_CY, FIELD_W } from "./constants";
import { game, type CaromDebugApi, type CaromState } from "./game";

type TestEngine = Engine<CaromState, CaromDebugApi>;

async function makeEngine(stepMs = 1000 / 60): Promise<TestEngine> {
  const canvas = createCanvas(1280, 720) as unknown as Record<
    string,
    unknown
  > & { getContext: unknown };
  const target = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => 1280,
    cssHeight: () => 720,
    dpr: () => 1,
    events: () => target,
  };
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 1280,
    height: 720,
    game,
    background: "#0a0e1a",
    layout: "dual-vertical",
    clock: new ConstantClock(stepMs),
    surface,
  });
  await engine.initialize();
  return engine;
}

const snap = (e: TestEngine) => e.debug.snapshot(e.state);

describe("Carom", () => {
  it("opens on the title screen", async () => {
    const e = await makeEngine();
    const s = snap(e);
    expect(s.version).toBe(1);
    expect(s.screen).toBe("title");
    expect(s.mode).toBe("solo");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.ball?.x).toBe(FIELD_CX);
    expect(s.ball?.y).toBe(FIELD_CY);
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
    expect(e.debug.menuItemRect(e.state, 0)).not.toBeNull();
    e.destroy();
  });

  it("clears and spawns the world", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.clearWorld(s));
    expect(snap(e).ball).toBeNull();
    expect(snap(e).obstacles).toEqual([]);
    e.apply((s) => e.debug.spawnBall(s));
    e.apply((s) => e.debug.spawnObstacle(s, 1));
    expect(snap(e).ball?.held).toBe(true);
    expect(snap(e).obstacles).toEqual([{ index: 1, cx: 790, cy: 500 }]);
    expect(() => e.apply((s) => e.debug.spawnObstacle(s, 7))).toThrow();
    expect(() => e.apply((s) => e.debug.clearWorld(s))).not.toThrow();
    // ball ops fail loudly with no ball
    expect(() => e.apply((s) => e.debug.setBallPosition(s, 1, 2))).toThrow();
    e.destroy();
  });

  it("serves after the hold and moves the ball", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.setScreen(s, "countdown"));
    e.apply((s) => e.debug.setBallServeSign(s, 1));
    await e.advance(70);
    const s = snap(e);
    expect(s.screen).toBe("playing");
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.speed).toBeGreaterThan(500);
    expect(s.ball?.x).toBeLessThan(FIELD_CX);
    e.destroy();
  });

  it("scores when the ball passes an edge", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.setBallPosition(s, FIELD_W - 5, FIELD_CY));
    e.apply((s) => e.debug.setBallVelocity(s, 600, 0));
    e.apply((s) => e.debug.setBallHeld(s, false));
    await e.advance(5);
    const s = snap(e);
    expect(s.score.p1).toBe(1);
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    e.destroy();
  });

  it("bounces off a paddle and speeds up", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.setPaddleCy(s, "left", FIELD_CY));
    e.apply((s) => e.debug.setBallPosition(s, 120, FIELD_CY));
    e.apply((s) => e.debug.setBallVelocity(s, -520, 0));
    e.apply((s) => e.debug.setBallHeld(s, false));
    await e.advance(10);
    const s = snap(e);
    expect(s.ball?.vx).toBeGreaterThan(0);
    expect(s.ball?.speed).toBeCloseTo(520 * 1.04, 0);
    e.destroy();
  });

  it("ends the match when the win rule holds", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.setScore(s, 10, 0));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.setBallPosition(s, FIELD_W - 5, FIELD_CY));
    e.apply((s) => e.debug.setBallVelocity(s, 600, 0));
    e.apply((s) => e.debug.setBallHeld(s, false));
    await e.advance(5);
    const s = snap(e);
    expect(s.screen).toBe("matchover");
    expect(s.winner).toBe("left");
    e.destroy();
  });

  it("drives a paddle via drivenVy", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.setPaddleVy(s, "left", 300));
    e.apply((s) => e.debug.setPaddleDriven(s, "left", true));
    const before = snap(e).paddles.left.cy;
    await e.advance(10);
    const after = snap(e).paddles.left;
    expect(after.cy).toBeGreaterThan(before);
    expect(after.vy).toBeCloseTo(300, 0);
    e.destroy();
  });

  it("reset restores the title state preserving muted", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.setMuted(s, true));
    e.apply((s) => e.debug.setScore(s, 5, 4));
    e.apply((s) => e.debug.reset(s));
    const s = snap(e);
    expect(s.screen).toBe("title");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.muted).toBe(true);
    expect(s.simTime).toBe(0);
    e.destroy();
  });

  it("spin curves the ball and decays", async () => {
    const e = await makeEngine();
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.setBallPosition(s, FIELD_CX, FIELD_CY));
    e.apply((s) => e.debug.setBallVelocity(s, 400, 0));
    e.apply((s) => e.debug.setBallSpin(s, 900));
    e.apply((s) => e.debug.setBallHeld(s, false));
    await e.advance(20);
    const s = snap(e);
    expect(s.ball?.vy).toBeGreaterThan(0);
    expect(Math.abs(s.ball?.spin ?? 999)).toBeLessThan(900);
    e.destroy();
  });

  it("is deterministic across step sizes for paddle contacts", async () => {
    const run = async (step: number) => {
      const e = await makeEngine(step);
      e.apply((s) => e.debug.setScreen(s, "playing"));
      e.apply((s) => e.debug.setBallPosition(s, 400, FIELD_CY));
      e.apply((s) => e.debug.setBallVelocity(s, -520, 40));
      e.apply((s) => e.debug.setBallHeld(s, false));
      await e.advance(Math.round(2000 / step));
      const s = snap(e);
      e.destroy();
      return s;
    };
    const a = await run(16);
    const b = await run(4);
    expect(Math.abs((a.ball?.speed ?? 0) - (b.ball?.speed ?? 0))).toBeLessThan(
      10,
    );
  });
});
