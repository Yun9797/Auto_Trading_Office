"use client";

import { useEffect, useRef } from "react";

// 🟩 매트릭스 배경 — 화면 뒤로 초록 글자가 흘러내림 (장식용, 클릭 통과)
const GLYPHS = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ매수도익절손주식코스피닥0123456789₩%+-▲▼";
const SIZE = 16;

export default function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let drops: number[] = [];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drops = Array.from({ length: Math.ceil(canvas.width / SIZE) }, () => Math.random() * -50);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = 0;
    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 55) return;
      last = t;
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${SIZE}px "Share Tech Mono", monospace`;
      drops.forEach((y, i) => {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        ctx.fillStyle = Math.random() < 0.04 ? "#d6ffd0" : "#39ff14";
        ctx.fillText(ch, i * SIZE, y * SIZE);
        drops[i] = y * SIZE > canvas.height && Math.random() > 0.975 ? 0 : y + 1;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="matrix-rain" aria-hidden="true" />;
}
