'use client'

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export default function FlowAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Refs for recording access
  const recordStateRef = useRef({
    isRecording: false,
    recordingType: null as 'left' | 'right' | null,
    frames: [] as string[],
    frameCount: 0,
    maxFrames: 60, // ~3 seconds at 20fps for a clean loop
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
    const LEFT_RELEASE_INTERVAL = 1100;
    const LEFT_RELEASE_SPEED = 0.9;
    const LEFT_CHAMBER_DRIFT = 0.15; // Increased gravity
    const BEFORE_REFILL_INTERVAL = 600;
    const INITIAL_BEFORE_COUNT = 180; // Significantly more balls for a solid mass
    const TOP_FILL_OFFSET = 25;
    const SURFACE_DIP = 45; // more curve

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
      seededAfter: false
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

    function drawFunnelOutline(ctx: CanvasRenderingContext2D, f: any) {
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1.0; 
      
      // Left curve
      ctx.beginPath();
      for (let y = f.topY; y <= f.bottomY; y += 2) {
        const r = getFunnelRadius(f, y);
        if (y === f.topY) ctx.moveTo(f.cx - r, y);
        else ctx.lineTo(f.cx - r, y);
      }
      ctx.stroke();

      // Right curve
      ctx.beginPath();
      for (let y = f.topY; y <= f.bottomY; y += 2) {
        const r = getFunnelRadius(f, y);
        if (y === f.topY) ctx.moveTo(f.cx + r, y);
        else ctx.lineTo(f.cx + r, y);
      }
      ctx.stroke();

      // Rims - Using full ellipses (360 degrees) to show complete circles at entrances and exits
      ctx.beginPath();
      ctx.ellipse(f.cx, f.topY, f.topWidth / 2, 7, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(f.cx, f.bottomY, f.bottomWidth / 2, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---------- curved surface ----------
    function getBeforeSurfaceY(f: any, x: number) {
      const t = Math.abs((x - f.cx) / (f.topWidth * 0.5));
      return f.topY + TOP_FILL_OFFSET + SURFACE_DIP * (1 - t * t);
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

      for (let k = 0; k < 200; k++) { // Further increased iterations for a rock-solid initial state
        resolveBeforeCollisions(layout);
        constrainBeforeParticles(layout);
      }

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
      const x = rand(f.cx - f.topWidth / 2 + BALL_R + 15, f.cx + f.topWidth / 2 - BALL_R - 15);

      state.beforeParticles.push({
        x,
        y: f.topY - rand(20, 40),
        r: BALL_R,
        vx: rand(-0.02, 0.02),
        vy: rand(0.3, 0.6),
        released: false,
        fallingIn: true,
        alpha: 1.0 // Start fully opaque to prevent "ghost" particles
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

      if (state.beforeRefillQueue > 0 && now - state.lastBeforeRefill > BEFORE_REFILL_INTERVAL) {
        spawnBeforeRefill(layout);
        state.beforeRefillQueue -= 1;
        state.lastBeforeRefill = now;
      }

      for (const p of state.beforeParticles) {
        // Safety: Ensure every active particle is fully opaque
        p.alpha = 1.0;

        if (p.released) {
          p.vy = lerp(p.vy, LEFT_RELEASE_SPEED, 0.1);
          p.vx = 0;
        } else {
          if (p.fallingIn) {
            p.vy += 0.05; // Faster falling
          } else {
            // Apply strong downward pressure and horizontal vibration
            p.vy = lerp(p.vy, LEFT_CHAMBER_DRIFT + 0.5, 0.2); 
            p.vx *= 0.95; // Reduced damping to allow for better settling
            p.vx += rand(-0.04, 0.04); // Increased vibration to break up jams
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
        if (p.y > f.bottomY + 18) {
          state.beforeRefillQueue += 1;
        } else {
          remaining.push(p);
        }
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

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDist = a.r + b.r + 0.05; // Reduced margin for tighter packing
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

            a.x -= nx * overlap * wA;
            a.y -= ny * overlap * wA;
            b.x += nx * overlap * wB;
            b.y += ny * overlap * wB;
          }
        }
      }
    }

    // ---------- before constraints ----------
    function constrainBeforeParticles(layout: any) {
      const f = layout.funnel;
      const gateY = f.neckY - 50;

      for (const p of state.beforeParticles) {
        if (!p.released) {
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
        }

        if (p.released) {
          // Snap particle exactly to center output line gracefully
          p.x = lerp(p.x, f.cx, 0.3);
          continue;
        }

        const sampleY = Math.min(p.y, gateY);
        const b = funnelBoundsAtY(f, sampleY, p.r + 0.5);
        p.x = clamp(p.x, b.leftBound, b.rightBound);
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
      for (const p of state.beforeParticles) {
        drawBall(ctx, p.x, p.y, p.r, COLORS.problem, p.alpha);
      }

      drawFunnelOutline(ctx, f);
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

      // Recording logic - high quality capture
      if (recordStateRef.current.isRecording) {
        const type = recordStateRef.current.recordingType;
        const bounds = type === 'left' ? layout.left : layout.right;
        
        // Use a 2x scale for capture to maintain "clarity" on high-res displays
        const scale = 2; 
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = bounds.width * scale;
        tempCanvas.height = bounds.height * scale;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          // Draw the background color manually to ensure no transparency issues in GIF
          tempCtx.fillStyle = '#09090B';
          tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          
          tempCtx.drawImage(
            canvas, 
            (layout.sceneX + bounds.x) * DPR, (layout.sceneY + bounds.y) * DPR, 
            bounds.width * DPR, bounds.height * DPR,
            0, 0, tempCanvas.width, tempCanvas.height
          );
          recordStateRef.current.frames.push(tempCanvas.toDataURL('image/jpeg', 0.9)); // JPEG is faster for large frames
        }
        
        recordStateRef.current.frameCount++;
        setProgress(Math.round((recordStateRef.current.frameCount / recordStateRef.current.maxFrames) * 100));

        if (recordStateRef.current.frameCount >= recordStateRef.current.maxFrames) {
          finalizeGif();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    }

    async function finalizeGif() {
      recordStateRef.current.isRecording = false;
      const type = recordStateRef.current.recordingType;
      const frames = recordStateRef.current.frames;
      
      const gifshot = (await import('gifshot')).default;
      
      gifshot.createGIF({
        images: frames,
        gifWidth: 760,  // Doubled resolution for clarity
        gifHeight: 1040, // Doubled resolution for clarity
        interval: 0.05,  // 20fps
        numFrames: frames.length,
        sampleInterval: 2, // Best quality/speed balance for color quantization
        numWorkers: 4,     // Multi-core processing for high-res GIF
      }, (obj: any) => {
        if (!obj.error) {
          const link = document.createElement('a');
          link.href = obj.image;
          link.download = `flow_${type}_ultra_hd.gif`;
          link.click();
        }
        setIsExporting(null);
        recordStateRef.current.frames = [];
        recordStateRef.current.frameCount = 0;
        setProgress(0);
      });
    }

    (window as any).startExport = (type: 'left' | 'right') => {
      setIsExporting(type);
      recordStateRef.current.recordingType = type;
      recordStateRef.current.frames = [];
      recordStateRef.current.frameCount = 0;
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
