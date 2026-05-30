'use client'

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export default function FlowAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Recording target: 24fps × 12 seconds = 288 frames of real animation, played back
  // at 24fps for a 12-second real-time GIF (no slow-mo).
  const TARGET_FPS = 24;
  const TARGET_DURATION_S = 12;
  const CAPTURE_INTERVAL_MS = 1000 / TARGET_FPS;
  const MAX_FRAMES = TARGET_FPS * TARGET_DURATION_S;

  // Frames are stored as lossless PNG data URIs. At 288 frames raw RGBA would be
  // ~1.7 GB and would crash the tab; PNGs compress the mostly-black background
  // very efficiently (~150 KB / frame, ~45 MB total).
  const recordStateRef = useRef({
    isRecording: false,
    recordingType: null as 'left' | 'right' | null,
    frames: [] as string[],
    frameCount: 0,
    maxFrames: MAX_FRAMES,
    gifWidth: 0,
    gifHeight: 0,
    lastCaptureTime: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let animationFrameId: number;

    const DPR = window.devicePixelRatio || 1;

    // ---------- fixed scene size ----------
    const SCENE_W = 1280;
    const SCENE_H = 720;

    // ---------- particles ----------
    const BALL_R = 7;
    const SOLVER_ITERS = 12; // Increased for better stability

    // ---------- colors ----------
    const COLORS = {
      problem: '230, 115, 125',    // "Heavier" Coral Red (matched to reference image)
      solution: '115, 230, 180',  // Balanced Deep Green (matched to red weight)
      center: '77, 109, 154',    
      line: 'rgba(255, 255, 255, 0.45)', // Slightly darker/dimmer outlines
    };

    // ---------- left side behavior ----------
    const LEFT_RELEASE_INTERVAL = 1500; // bottleneck is now tighter — fewer balls drain through the neck
    const LEFT_RELEASE_SPEED = 0.55;    // and the ones that do trickle through fall slower
    const LEFT_CHAMBER_DRIFT = 0.15; // Increased gravity
    const BEFORE_REFILL_INTERVAL = 240;
    const INITIAL_BEFORE_COUNT = 450; // enough mass for the mound to peak above the rim and spill
    const MOUND_HEIGHT = 50;          // how far above the rim the center of the granular pile peaks
    const LEAK_GRAVITY = 0.12;        // gravity applied to balls that have escaped the bowl
    const LEAK_LIFETIME = 54;         // frames a leaked ball lives before fully fading (~0.9s at 60fps)

    // ---------- right side behavior ----------
    const AFTER_FLOW_SPEED = 0.85;
    const AFTER_SPAWN_INTERVAL = 1100;
    const AFTER_LANES = 8; // simplified

    // ---------- global state ----------
    const state = {
      beforeParticles: [] as any[],
      afterParticles: [] as any[],
      lastTubeRelease: 0,
      lastBeforeRefill: 0,
      lastAfterSpawnByLane: Array(AFTER_LANES).fill(0),
      laneIndex: 0,
      beforeRefillQueue: 0,
      seededBefore: false,
      seededAfter: false,
      seeding: false  // true while seedBeforeParticles is running — used to suppress leak-marking
    };

    function resize() {
      if (!canvas || !ctx) return;
      canvas.width = window.innerWidth * DPR;
      canvas.height = window.innerHeight * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    window.addEventListener("resize", resize);
    resize();

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
    function rand(a: number, b: number) { return a + Math.random() * (b - a); }

    // ---------- layout ----------
    function getLayout() {
      const sceneX = Math.round((window.innerWidth - SCENE_W) / 2);
      const sceneY = Math.round((window.innerHeight - SCENE_H) / 2);

      const left = {
        x: 170,
        y: 70,
        width: 380,
        height: 520
      };

      const right = {
        x: 730,
        y: 70,
        width: 380,
        height: 520
      };

      const funnel = {
        topY: left.y + 40,
        topWidth: 380,
        neckY: left.y + 360,
        neckWidth: 18,
        bottomY: left.y + 510,
        bottomWidth: 18, // matches neckWidth for a straight tube
        cx: left.x + left.width * 0.5,
        isLeft: true
      };

      const rightFunnel = {
        topY: right.y + 40,
        topWidth: 380,
        neckY: right.y + 300,
        neckWidth: 160,
        bottomY: right.y + 510,
        bottomWidth: 260,
        cx: right.x + right.width * 0.5,
        isLeft: false
      };

      return { sceneX, sceneY, left, right, funnel, rightFunnel };
    }

    // ---------- geometry ----------
    function getFunnelRadius(f: any, y: number) {
      if (y <= f.topY) return f.topWidth / 2;
      
      // For the left bottleneck: go straight down after the neck reached
      if (f.isLeft && y >= f.neckY) {
        return f.neckWidth / 2;
      }
      
      if (y >= f.bottomY) return f.bottomWidth / 2;
      
      // Using cosine-based interpolation for C1 continuity (matching 0-derivatives at transitions)
      // This removes the "sharp turn" or "kink" at the neck by ensuring a smooth, rounded waist.
      if (y <= f.neckY) {
        const localT = (y - f.topY) / (f.neckY - f.topY);
        const curve = (1 + Math.cos(localT * Math.PI)) * 0.5; // Starts at 1, ends at 0 with 0 slope
        return f.neckWidth / 2 + (f.topWidth / 2 - f.neckWidth / 2) * curve;
      } else {
        const localT = (y - f.neckY) / (f.bottomY - f.neckY);
        const curve = (1 - Math.cos(localT * Math.PI)) * 0.5; // Starts at 0, ends at 1 with 0 slope
        return f.neckWidth / 2 + (f.bottomWidth / 2 - f.neckWidth / 2) * curve;
      }
    }

    function getAfterLaneX(f: any, laneIndex: number, y: number) {
      const r = getFunnelRadius(f, y);
      const laneSpace = r * 2 - 40;
      const startX = f.cx - laneSpace / 2;
      const laneGap = laneSpace / (AFTER_LANES - 1);
      return startX + laneIndex * laneGap;
    }
    
    function funnelBoundsAtY(f: any, y: number, margin = 0) {
      const r = getFunnelRadius(f, y);
      return {
        leftBound: f.cx - r + margin,
        rightBound: f.cx + r - margin
      };
    }

    // Modes: 'full' draws the whole outline. 'back' draws only the back half of the top
    // rim ellipse (so balls above the rim can be drawn over it for depth). 'front' draws
    // the side walls, the front half of the top rim, and the bottom rim.
    function drawFunnelOutline(ctx: CanvasRenderingContext2D, f: any, mode: 'full' | 'back' | 'front' = 'full') {
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1.0;

      if (mode === 'back') {
        // Back arc of the top rim only — the half farther from the viewer (upper half of the ellipse).
        // Drawn first so balls cresting above the rim occlude it correctly.
        ctx.beginPath();
        ctx.ellipse(f.cx, f.topY, f.topWidth / 2, 7, 0, Math.PI, 2 * Math.PI);
        ctx.stroke();
        return;
      }

      // 'front' and 'full' both draw the side walls.
      ctx.beginPath();
      for (let y = f.topY; y <= f.bottomY; y += 2) {
        const r = getFunnelRadius(f, y);
        if (y === f.topY) ctx.moveTo(f.cx - r, y);
        else ctx.lineTo(f.cx - r, y);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let y = f.topY; y <= f.bottomY; y += 2) {
        const r = getFunnelRadius(f, y);
        if (y === f.topY) ctx.moveTo(f.cx + r, y);
        else ctx.lineTo(f.cx + r, y);
      }
      ctx.stroke();

      if (mode === 'front') {
        // Front arc only — the half closer to the viewer (lower half of the ellipse).
        ctx.beginPath();
        ctx.ellipse(f.cx, f.topY, f.topWidth / 2, 7, 0, 0, Math.PI);
        ctx.stroke();
      } else {
        // 'full' — whole top-rim ellipse.
        ctx.beginPath();
        ctx.ellipse(f.cx, f.topY, f.topWidth / 2, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Bottom rim — always drawn full (small, at the exit of the tube).
      ctx.beginPath();
      ctx.ellipse(f.cx, f.bottomY, f.bottomWidth / 2, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---------- curved surface ----------
    function getBeforeSurfaceY(f: any, x: number) {
      // Granular mound: peak in the center sits MOUND_HEIGHT above the rim and tapers
      // to rim level at the bowl walls. Beyond the walls (t>1) we clamp to t=1 so the
      // formula stays well-defined; leaked balls bypass this constraint anyway.
      const t = Math.min(1, Math.abs((x - f.cx) / (f.topWidth * 0.5)));
      return f.topY - MOUND_HEIGHT * (1 - t * t);
    }

    // ---------- before seed ----------
    function seedBeforeParticles(layout: any) {
      const f = layout.funnel;
      const gateY = f.neckY - 50; // keep chamber stable above the neck

      state.beforeParticles = [];

      // 1. Seed already-released balls in the tube to show "started" state
      const tubeBallsCount = 3;
      const tubeSpacing = (f.bottomY - gateY) / (tubeBallsCount + 1);
      for (let i = 1; i <= tubeBallsCount; i++) {
        state.beforeParticles.push({
          x: f.cx,
          y: gateY + i * tubeSpacing,
          r: BALL_R,
          vx: 0,
          vy: LEFT_RELEASE_SPEED,
          released: true,
          fallingIn: false,
          alpha: 1.0
        });
      }

      // 2. Seed the main chamber
      for (let i = 0; i < INITIAL_BEFORE_COUNT; i++) {
        const x = rand(f.cx - f.topWidth / 2 + BALL_R + 6, f.cx + f.topWidth / 2 - BALL_R - 6);
        const surfaceY = getBeforeSurfaceY(f, x);
        const y = rand(surfaceY + BALL_R, gateY - BALL_R);

        state.beforeParticles.push({
          x,
          y,
          r: BALL_R,
          vx: rand(-0.06, 0.06),
          vy: rand(-0.02, 0.02),
          released: false,
          fallingIn: false,
          alpha: 1.0 // Fully visible on seed
        });
      }

      // Pre-settle: apply a gravity step every iteration so particles actually fall
      // and pack densely from the gate upward, instead of staying at their random spawn y.
      // We mark `state.seeding = true` so the constraint doesn't leak balls during this
      // packing phase — otherwise edge balls would be marked leaked from collisions and
      // the chamber would start under-filled.
      state.seeding = true;
      for (let k = 0; k < 260; k++) {
        for (const p of state.beforeParticles) {
          if (!p.released) p.y += 1.2;
        }
        resolveBeforeCollisions(layout);
        constrainBeforeParticles(layout);
      }
      state.seeding = false;

      state.seededBefore = true;
    }

    // ---------- after seed ----------
    function seedAfterParticles(layout: any) {
      const f = layout.rightFunnel;
      state.afterParticles = [];

      // Calculate approximate spacing between frames in a lane
      const spacing = 45; // Fixed spacing for a clean look
      
      for (let i = 0; i < AFTER_LANES; i++) {
        // Offset starting Y per lane for a staggered/natural appearance
        const startYOffset = (i % 2 === 0) ? -20 : 0;
        
        for (let y = f.topY + startYOffset; y < f.bottomY + 10; y += spacing) {
          state.afterParticles.push({
            x: getAfterLaneX(f, i, y),
            y: y,
            r: BALL_R,
            vy: AFTER_FLOW_SPEED,
            laneIndex: i,
            alpha: 1.0
          });
        }
      }
      
      state.seededAfter = true;
    }

    // ---------- before refill ----------
    function spawnBeforeRefill(layout: any) {
      const f = layout.funnel;
      // Drop refills near the center — like pouring grain on top of a pile, so the
      // mound is fed at its peak and the mass redistributes outward via collisions.
      // Varied x and y so balls in flight don't all overlap into one stream.
      const x = f.cx + rand(-38, 38);

      state.beforeParticles.push({
        x,
        y: f.topY - MOUND_HEIGHT - rand(40, 110), // start well above the mound so balls are airborne for a while
        r: BALL_R,
        vx: rand(-0.04, 0.04),
        vy: rand(0.2, 0.55),
        released: false,
        fallingIn: true,
        alpha: 1.0
      });
    }

    // ---------- after spawn ----------
    function spawnAfterParticle(layout: any) {
      // Handled entirely by row-spawning logic directly in updateAfter now
    }

    // ---------- before update ----------
    function updateBefore(layout: any, now: number) {
      const f = layout.funnel;
      const gateY = f.neckY - 50;

      if (now - state.lastTubeRelease > LEFT_RELEASE_INTERVAL) {
        const candidates = state.beforeParticles.filter(
          p => !p.released && p.y > gateY - BALL_R * 3
        );

        if (candidates.length > 0) {
          // Sort to find particle closest to the gate and center
          candidates.sort((a, b) => {
            const distA = Math.abs(a.x - f.cx);
            const distB = Math.abs(b.x - f.cx);
            return (b.y - distB) - (a.y - distA); 
          });
          candidates[0].released = true;
          // Ensure released particles are fully visible
          candidates[0].alpha = 1.0;
          state.lastTubeRelease = now;
        }
      }

      // Spawn refills on a steady schedule, regardless of queue. Excess mass naturally
      // leaves via the bottleneck or by overflowing the rim, so the chamber self-balances.
      // This is what gives the "constant rain from above" look the user wants.
      if (now - state.lastBeforeRefill > BEFORE_REFILL_INTERVAL) {
        spawnBeforeRefill(layout);
        if (state.beforeRefillQueue > 0) state.beforeRefillQueue -= 1;
        state.lastBeforeRefill = now;
      }

      for (const p of state.beforeParticles) {
        if (p.leaked) {
          // Escaped the bowl: gravity dominates. Horizontal motion is damped
          // aggressively so the ball doesn't sail outward — after clearing the rim
          // it should fall almost straight down, the way a real grain would.
          p.vy += LEAK_GRAVITY * (p.leakGFactor ?? 1);
          p.vx *= 0.94;   // strong horizontal damping — kills outward drift within ~12 frames
          p.vy *= 0.998;  // very gentle vertical damping so gravity wins

          p.leakAge = (p.leakAge ?? 0) + 1;
          const t = Math.min(1, p.leakAge / LEAK_LIFETIME);
          p.alpha = Math.max(0, 1 - t * t);
          p.r = BALL_R * (1 - 0.25 * t);
        } else if (p.released) {
          p.alpha = 1.0;
          p.vy = lerp(p.vy, LEFT_RELEASE_SPEED, 0.1);
          p.vx = 0;
        } else if (p.fallingIn) {
          p.alpha = 1.0;
          p.vy += 0.06; // refill drops in from above
        } else {
          p.alpha = 1.0;
          // Granular flow: depth determines liveliness.
          //   - top of pile (depth ~ 0): full gravity, light damping, lateral noise — looks alive.
          //   - bottom of pile (depth ~ 1): weight is supported by the balls above, so we
          //     scale gravity DOWN (the ball below it is holding it up) AND damp HARD
          //     (relative motion dies in 2–3 frames). Together they kill the residual
          //     "elastic jitter" from collision-only solvers.
          const surfaceY = getBeforeSurfaceY(f, p.x);
          const depthRange = Math.max(gateY - surfaceY, 1);
          const depth = clamp((p.y - surfaceY) / depthRange, 0, 1);

          const gravity = lerp(0.06, 0.012, depth); // bottom: almost no net gravity (supported)
          const dampY = lerp(0.96, 0.30, depth);    // bottom: vy *= 0.3 each frame -> motion vanishes
          const dampX = lerp(0.94, 0.22, depth);    // top keeps lateral motion long enough to spill

          p.vy += gravity;
          p.vy *= dampY;
          p.vx *= dampX;

          // Near the crest of the mound the surface is "alive": a small random jitter and,
          // critically, a CONTINUOUS directional outward push for balls near the rim wall.
          // This is the granular-physics analog of grains rolling down the slope of a heap
          // and tipping over the edge of the bowl. Without it the system is symmetric and
          // balls would never reliably reach the rim corner — overflow would stall.
          if (depth < 0.35) {
            p.vx += rand(-0.015, 0.015);
            const distFromCenter = Math.abs(p.x - f.cx);
            const nearWall = distFromCenter > f.topWidth / 2 - 70;
            if (nearWall) {
              const outwardSign = p.x > f.cx ? 1 : -1;
              // Push grows the closer the ball is to the wall — like grains rolling off a slope.
              const wallProximity = (distFromCenter - (f.topWidth / 2 - 70)) / 70; // 0 at 70px from wall, 1 at wall
              p.vx += outwardSign * (0.05 + 0.06 * wallProximity);
            }
          }
        }

        p.x += p.vx;
        p.y += p.vy;
      }

      for (let k = 0; k < SOLVER_ITERS; k++) {
        resolveBeforeCollisions(layout);
        constrainBeforeParticles(layout);
      }

      const remaining = [];
      for (const p of state.beforeParticles) {
        // Drained through the neck
        if (p.y > f.bottomY + 18 && !p.leaked) {
          state.beforeRefillQueue += 1;
          continue;
        }
        // Spilled over the rim and either faded out or fell off-screen
        if (p.leaked && (p.alpha <= 0 || p.y > f.bottomY + 80)) {
          state.beforeRefillQueue += 1;
          continue;
        }
        remaining.push(p);
      }
      state.beforeParticles = remaining;
    }

    // ---------- before collisions ----------
    function resolveBeforeCollisions(layout: any) {
      const particles = state.beforeParticles;
      const f = layout.funnel;

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];

          // Spilled balls have left the chamber — they don't collide with the pile any more.
          if (a.leaked || b.leaked) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDist = a.r + b.r + 0.05;
          const d2 = dx * dx + dy * dy;

          if (d2 < minDist * minDist) {
            const d = Math.sqrt(d2) || 0.0001;
            const overlap = minDist - d;
            const nx = dx / d;
            const ny = dy / d;

            const aFixed = a.released;
            const bFixed = b.released;

            const wA = aFixed ? 0 : (bFixed ? 1 : 0.5);
            const wB = bFixed ? 0 : (aFixed ? 1 : 0.5);

            // Position correction — push overlapping balls apart along the normal.
            a.x -= nx * overlap * wA;
            a.y -= ny * overlap * wA;
            b.x += nx * overlap * wB;
            b.y += ny * overlap * wB;

            // Inelastic contact damping — kill any approaching relative velocity along
            // the collision normal. Without this, balls in a pressed pile keep gaining
            // velocity from gravity each frame and the collision-vs-constraint cycle
            // makes the bottom look bouncy. This makes contacts behave like grains of
            // sand (no rebound), which is what the user wants.
            const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rvn < 0) {
              a.vx += rvn * nx * wA;
              a.vy += rvn * ny * wA;
              b.vx -= rvn * nx * wB;
              b.vy -= rvn * ny * wB;
            }
          }
        }
      }
    }

    // ---------- before constraints ----------
    function constrainBeforeParticles(layout: any) {
      const f = layout.funnel;
      const gateY = f.neckY - 50;

      for (const p of state.beforeParticles) {
        if (p.leaked) continue;

        const distFromCenter = Math.abs(p.x - f.cx);

        // STEP 1: Leak detection runs FIRST. If a non-released ball has drifted past the
        // rim corner near rim height, mark it leaked immediately — before the wall clamp
        // gets a chance to pull it back. (That was the bug: wall clamp ran first, x was
        // clamped back inside, and the leak condition could never fire.)
        // Skipped during seed so we don't drain the chamber while pre-packing it.
        if (!state.seeding && !p.released && distFromCenter > f.topWidth / 2 && p.y < f.topY + p.r * 2.2) {
          p.leaked = true;
          p.leakAge = 0;
          const side = p.x > f.cx ? 1 : -1;
          // Per-ball variation, but keep horizontal velocity small — the ball has just
          // tipped over the rim, gravity should dominate, not horizontal momentum.
          //   - vx: small outward kick, only a fraction of the inherited chamber velocity.
          //   - vy: tiny variation around 0 — no big upward pop, gravity takes it from there.
          p.vx = p.vx * rand(0.10, 0.35) + side * rand(0.08, 0.30);
          p.vy = p.vy * rand(0.2, 0.6) + rand(-0.2, 0.25);
          p.leakGFactor = rand(0.85, 1.15);
          continue;
        }

        const insideBowlH = distFromCenter < f.topWidth / 2;

        if (!p.released && insideBowlH) {
          // Mound ceiling applies only when the ball is still inside the bowl horizontally.
          const surfaceY = getBeforeSurfaceY(f, p.x);

          if (p.fallingIn) {
            if (p.y >= surfaceY) {
              p.fallingIn = false;
              p.y = surfaceY;
              p.vy = 0;
            }
          } else {
            if (p.y < surfaceY) {
              p.y = surfaceY;
              p.vy = Math.max(0, p.vy);
            }
          }
        }

        if (!p.released && p.y > gateY) {
          p.y = gateY;
          p.vy = 0;
        }

        if (p.released) {
          p.x = lerp(p.x, f.cx, 0.3);
          continue;
        }

        // STEP 2: Wall clamp — only when clearly below the rim. We leave a transit zone
        // of ~p.r/2 around the rim line so a ball drifting outward at the crest can
        // actually reach the leak threshold above instead of being immediately yanked back.
        if (p.y > f.topY + p.r * 0.5) {
          const sampleY = Math.min(p.y, gateY);
          const b = funnelBoundsAtY(f, sampleY, p.r + 0.5);
          const beforeX = p.x;
          p.x = clamp(p.x, b.leftBound, b.rightBound);
          if (p.x !== beforeX) {
            p.vx = 0;
          }
        }
      }
    }

    // ---------- after update ----------
    function updateAfter(layout: any, now: number) {
      const f = layout.rightFunnel;

      for (let i = 0; i < AFTER_LANES; i++) {
        // Init with offset so they start spawning immediately but staggered
        if (state.lastAfterSpawnByLane[i] === 0) {
          state.lastAfterSpawnByLane[i] = now - rand(0, AFTER_SPAWN_INTERVAL);
        }

        // Randomize the interval slightly so it feels organic
        const interval = AFTER_SPAWN_INTERVAL + rand(-200, 200);

        if (now - state.lastAfterSpawnByLane[i] > interval) {
          state.afterParticles.push({
            x: getAfterLaneX(f, i, f.topY),
            y: f.topY,
            r: BALL_R,
            vy: AFTER_FLOW_SPEED,
            laneIndex: i,
            alpha: 0.0
          });
          state.lastAfterSpawnByLane[i] = now;
        }
      }

      for (const p of state.afterParticles) {
        p.alpha = Math.min(1, p.alpha + 0.05);
        p.vy = AFTER_FLOW_SPEED;
        p.y += p.vy;
        p.x = getAfterLaneX(f, p.laneIndex, p.y);
      }

      state.afterParticles = state.afterParticles.filter(
        p => p.y < f.bottomY + 24
      );
    }

    // ---------- drawing ----------
    function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colorRGB: string, alpha = 1) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(${colorRGB},${alpha})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawBackgroundGlow(ctx: CanvasRenderingContext2D) {
      // Main central glow
      const g = ctx.createRadialGradient(
        SCENE_W * 0.5, SCENE_H * 0.5, 0,
        SCENE_W * 0.5, SCENE_H * 0.5, SCENE_W * 0.7
      );
      g.addColorStop(0, "rgba(255,255,255,0.015)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);

      // Spot glows for modules
      const glows = [
        { x: 360, y: 360, color: COLORS.problem, size: 300, alpha: 0.04 },
        { x: 920, y: 360, color: COLORS.solution, size: 300, alpha: 0.04 },
        { x: 640, y: 360, color: '255,255,255', size: 150, alpha: 0.03 }
      ];

      glows.forEach(glow => {
        const rg = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.size);
        rg.addColorStop(0, `rgba(${glow.color}, ${glow.alpha})`);
        rg.addColorStop(1, `rgba(${glow.color}, 0)`);
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      });
    }

    function drawText(ctx: CanvasRenderingContext2D, layout: any) {
      // Clear out text generation to strictly leave visual physics running
    }

    function drawBefore(ctx: CanvasRenderingContext2D, layout: any) {
      const f = layout.funnel;

      ctx.save();

      // Depth pass 1: BACK arc of the rim. Anything drawn after this with overlap
      // (the mound balls above the rim line) will correctly cover it.
      drawFunnelOutline(ctx, f, 'back');

      // Pile + mound balls (everything still inside the bowl).
      for (const p of state.beforeParticles) {
        if (p.leaked) continue;
        drawBall(ctx, p.x, p.y, p.r, COLORS.problem, p.alpha);
      }

      // Depth pass 2: side walls + FRONT arc of the rim + bottom ellipse.
      // These remain in front of the pile.
      drawFunnelOutline(ctx, f, 'front');

      // Spilled balls outside the bowl — drawn last so they read as being in the foreground.
      for (const p of state.beforeParticles) {
        if (!p.leaked) continue;
        drawBall(ctx, p.x, p.y, p.r, COLORS.problem, p.alpha);
      }
      ctx.restore();
    }

    function drawAfter(ctx: CanvasRenderingContext2D, layout: any) {
      const f = layout.rightFunnel;

      ctx.save();
      for (const p of state.afterParticles) {
        // Adding slight x-noise for more organic flow
        const wobble = Math.sin(p.y * 0.05 + p.laneIndex) * 2;
        drawBall(ctx, p.x + wobble, p.y, p.r, COLORS.solution, p.alpha);
      }

      drawFunnelOutline(ctx, f);
      ctx.restore();
    }

    // ---------- main ----------
    function render(now: number) {
      if (!canvas || !ctx) return;
      const layout = getLayout();

      // Clear the canvas. For recording, we now include the background to match visual clarity.
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(layout.sceneX, layout.sceneY);

      if (!state.seededBefore) {
        seedBeforeParticles(layout);
      }
      if (!state.seededAfter) {
        seedAfterParticles(layout);
      }

      updateBefore(layout, now);
      updateAfter(layout, now);

      // Always draw background effects for visual consistency and "clarity"
      drawBackgroundGlow(ctx);
      
      drawBefore(ctx, layout);
      drawAfter(ctx, layout);
      drawText(ctx, layout);

      ctx.restore();

      // Capture-bound margins (kept as constants so the recording capture and the
      // on-screen wireframe preview always use exactly the same area).
      const CAPTURE_MARGIN_X = 110;
      const CAPTURE_MARGIN_TOP = 180;
      const CAPTURE_MARGIN_BOTTOM = 50;

      // Recording logic - high quality capture
      if (recordStateRef.current.isRecording) {
        // 60fps render -> 24fps capture: only grab a frame every ~42ms.
        // Use a "next deadline" scheme so we don't drift over a 12s recording.
        if (now < recordStateRef.current.lastCaptureTime + CAPTURE_INTERVAL_MS) {
          animationFrameId = requestAnimationFrame(render);
          return;
        }
        recordStateRef.current.lastCaptureTime = now;

        const type = recordStateRef.current.recordingType;
        const bounds = type === 'left' ? layout.left : layout.right;

        const captureX = bounds.x - CAPTURE_MARGIN_X;
        const captureY = bounds.y - CAPTURE_MARGIN_TOP;
        const captureW = bounds.width + CAPTURE_MARGIN_X * 2;
        const captureH = bounds.height + CAPTURE_MARGIN_TOP + CAPTURE_MARGIN_BOTTOM;

        // 2x scale capture for retina sharpness.
        const scale = 2;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = captureW * scale;
        tempCanvas.height = captureH * scale;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.fillStyle = '#09090B';
          tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

          tempCtx.drawImage(
            canvas,
            (layout.sceneX + captureX) * DPR, (layout.sceneY + captureY) * DPR,
            captureW * DPR, captureH * DPR,
            0, 0, tempCanvas.width, tempCanvas.height
          );
          // Lossless PNG data URI. At 288 frames raw RGBA would exhaust memory,
          // so we store compressed PNG and decode back to RGBA during encoding.
          recordStateRef.current.frames.push(tempCanvas.toDataURL('image/png'));
          recordStateRef.current.gifWidth = tempCanvas.width;
          recordStateRef.current.gifHeight = tempCanvas.height;
        }

        recordStateRef.current.frameCount++;
        setProgress(Math.round((recordStateRef.current.frameCount / recordStateRef.current.maxFrames) * 100));

        if (recordStateRef.current.frameCount >= recordStateRef.current.maxFrames) {
          finalizeGif();
        }
      }

      // Wireframe preview for the export bounds. Drawn AFTER the recording's
      // drawImage above so it never ends up inside the actual GIF — it's
      // purely a visual guide for the user to see what each export captures.
      const drawCaptureWireframe = (b: { x: number; y: number; width: number; height: number }) => {
        const x = layout.sceneX + b.x - CAPTURE_MARGIN_X;
        const y = layout.sceneY + b.y - CAPTURE_MARGIN_TOP;
        const w = b.width + CAPTURE_MARGIN_X * 2;
        const h = b.height + CAPTURE_MARGIN_TOP + CAPTURE_MARGIN_BOTTOM;
        ctx.strokeRect(x, y, w, h);
      };

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 6]);
      drawCaptureWireframe(layout.left);
      drawCaptureWireframe(layout.right);
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    }

    async function finalizeGif() {
      recordStateRef.current.isRecording = false;
      const type = recordStateRef.current.recordingType;
      const frames = recordStateRef.current.frames;
      const width = recordStateRef.current.gifWidth;
      const height = recordStateRef.current.gifHeight;

      // gifenc: modern GIF encoder with median-cut palette quantization in rgb565
      // precision. Source frames are PNG (lossless) — we decode each one back to
      // RGBA right before quantizing it, so the only quality loss is the GIF
      // format's 256-color palette per frame.
      const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
      const gif = GIFEncoder();

      // Shared decode canvas — we reuse it across all frames to avoid thrashing.
      const decodeCanvas = document.createElement('canvas');
      decodeCanvas.width = width;
      decodeCanvas.height = height;
      const decodeCtx = decodeCanvas.getContext('2d', { willReadFrequently: true })!;

      const frameDelay = Math.round(1000 / TARGET_FPS); // ~42 ms at 24fps

      // Reset progress for the encoding phase so the user sees it tick up again.
      setProgress(0);

      for (let i = 0; i < frames.length; i++) {
        // Decode the PNG data URI back to RGBA pixels.
        const img = new Image();
        img.src = frames[i];
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('frame decode failed'));
        });
        decodeCtx.clearRect(0, 0, width, height);
        decodeCtx.drawImage(img, 0, 0);
        const rgba = decodeCtx.getImageData(0, 0, width, height).data;

        // Per-frame palette — best for animations whose color distribution shifts.
        const palette = quantize(rgba, 256, { format: 'rgb565' });
        const index = applyPalette(rgba, palette, 'rgb565');
        gif.writeFrame(index, width, height, {
          palette,
          delay: frameDelay,
        });

        // Drop the PNG data we just consumed so memory doesn't pile up across 288 frames.
        frames[i] = '';

        setProgress(Math.round(((i + 1) / frames.length) * 100));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      gif.finish();
      const bytes = gif.bytes();
      const blob = new Blob([bytes as BlobPart], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `flow_${type}_24fps.gif`;
      link.click();

      setTimeout(() => URL.revokeObjectURL(url), 1500);

      setIsExporting(null);
      recordStateRef.current.frames = [];
      recordStateRef.current.frameCount = 0;
      setProgress(0);
    }

    (window as any).startExport = (type: 'left' | 'right') => {
      setIsExporting(type);
      recordStateRef.current.recordingType = type;
      recordStateRef.current.frames = [];
      recordStateRef.current.frameCount = 0;
      recordStateRef.current.lastCaptureTime = 0; // capture the very next frame
      recordStateRef.current.isRecording = true;
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };

  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090B] font-sans text-white m-0 p-0 relative flex items-center justify-center">
      {/* Background Texture Layers */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/p6.png")' }} />

      {/* Canvas layer */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 block w-full h-full pointer-events-none z-0" 
      />
      
      {/* 1280x720 Overlay Container (Empty to show only animations) */}
      <div className="relative w-[1280px] h-[720px] pointer-events-none z-10" />

      {/* Floating Export Controls */}
      <div className="absolute top-8 right-8 flex flex-col gap-4 z-50">
        <button 
          disabled={isExporting !== null}
          onClick={() => (window as any).startExport('left')}
          className="flex items-center gap-3 px-6 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50"
        >
          {isExporting === 'left' ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
          Export Left GIF {isExporting === 'left' && `(${progress}%)`}
        </button>
        <button 
          disabled={isExporting !== null}
          onClick={() => (window as any).startExport('right')}
          className="flex items-center gap-3 px-6 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50"
        >
          {isExporting === 'right' ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
          Export Right GIF {isExporting === 'right' && `(${progress}%)`}
        </button>
      </div>
    </div>
  );
}
