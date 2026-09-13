import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "./game3d/engine";
import { audio } from "./game/audio";
import { clearAll } from "./game/input";
import type { RunStats } from "./game/types";
import Controls from "./components/Controls";
import Hud from "./components/Hud";
import { MainMenu, PauseMenu, GameOverMenu } from "./components/Menus";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Screen = "menu" | "playing" | "over";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [muted, setMuted] = useState(audio.muted);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    let engine: Engine | null = null;
    let rafA = 0;
    let rafB = 0;
    let cancelled = false;
    setBooting(true);
    setBootError(null);

    // Let React paint the loading screen before building the 3D city. Two
    // frames also give mobile browsers time to allocate a stable WebGL context.
    rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(() => {
        if (cancelled || !canvasRef.current) return;
        try {
          engine = new Engine(canvasRef.current, {
            onGameOver: (s) => { setStats(s); setScreen("over"); },
            onPauseRequest: () => setPaused(true),
            onFatal: (message) => {
              setBootError(message);
              setBooting(false);
            },
          });
          if (cancelled) {
            engine.destroy();
            return;
          }
          setGame(engine);
          // smoke-test / debug handle (harmless in production)
          (window as unknown as { __engine?: Engine }).__engine = engine;
          // Keep the loader up until the first engine frame has been submitted.
          requestAnimationFrame(() => setBooting(false));
        } catch (err) {
          console.error("engine init failed", err);
          const message = err instanceof Error ? err.message : "مرورگر نتوانست موتور سه‌بعدی را اجرا کند.";
          setBootError(message);
          setBooting(false);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      engine?.destroy();
    };
  }, [bootAttempt]);

  useEffect(() => {
    if (!paused) return;
    const fn = (e: KeyboardEvent) => {
      if (e.code === "KeyP" || e.code === "Escape" || e.code === "Enter") setPaused(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [paused]);

  useEffect(() => {
    const fn = () => { if (document.hidden) setPaused(true); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);

  useEffect(() => {
    if (game) game.paused = paused;
    if (paused) clearAll();
  }, [game, paused]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      audio.setMuted(!m);
      return !m;
    });
  }, []);

  const start = useCallback(() => {
    if (!game) return;
    audio.ensure();
    game.startRun();
    setPaused(false);
    setStats(null);
    setScreen("playing");
  }, [game]);

  const quit = useCallback(() => {
    if (!game) return;
    game.toMenu();
    setPaused(false);
    setStats(null);
    setScreen("menu");
  }, [game]);

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-[#060a1a]"
      onPointerDown={() => audio.ensure()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* filmic overlay */}
      <div className="vignette-soft pointer-events-none absolute inset-0" />

      {booting && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#060a1a]">
          <div className="flex flex-col items-center gap-5">
            <div className="h-11 w-11 animate-spin rounded-full border-2 border-indigo-300/20 border-t-[#ffd23f]" />
            <div className="font-display text-xl tracking-[0.4em] text-[#ffd23f]">LOADING CITY...</div>
          </div>
        </div>
      )}

      {bootError && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#060a1a] p-5">
          <div className="w-[min(480px,94vw)] border border-rose-400/25 bg-[#0d132c] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
            <AlertTriangle className="mx-auto mb-4 text-rose-400" size={34} />
            <h2 className="font-display text-2xl tracking-[0.12em] text-white">3D ENGINE ERROR</h2>
            <p className="mt-3 font-hud text-sm leading-6 text-indigo-100/70">
              موتور سه‌بعدی اجرا نشد. Hardware Acceleration مرورگر را فعال کنید و صفحه را دوباره بارگذاری کنید.
            </p>
            <code className="mt-4 block break-all bg-black/30 p-3 text-left text-[11px] text-rose-200/80">{bootError}</code>
            <button
              onClick={() => setBootAttempt((n) => n + 1)}
              className="mt-5 inline-flex items-center gap-2 bg-[#ffd23f] px-6 py-3 font-display tracking-[0.15em] text-[#241003] active:scale-95"
            >
              <RefreshCw size={17} /> RETRY
            </button>
          </div>
        </div>
      )}

      {game && screen === "playing" && (
        <>
          <Hud game={game} muted={muted} onToggleMute={toggleMute} />
          {!paused && <Controls game={game} />}
          {paused && (
            <PauseMenu
              onResume={() => setPaused(false)}
              onRestart={start}
              onQuit={quit}
              muted={muted}
              onToggleMute={toggleMute}
            />
          )}
        </>
      )}

      {screen === "menu" && <MainMenu onStart={start} muted={muted} onToggleMute={toggleMute} />}

      {screen === "over" && stats && <GameOverMenu stats={stats} onRetry={start} onQuit={quit} />}
    </div>
  );
}
