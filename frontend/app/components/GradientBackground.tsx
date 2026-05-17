'use client';

import { useEffect, useRef } from 'react';

export default function GradientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let animationId: number;
    let t = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    resize();
    window.addEventListener('resize', resize);

    const orbs = [
      { x: 0.2, y: 0.2, r: 0.5, color: '99,102,241', speed: 0.0003 },
      { x: 0.8, y: 0.7, r: 0.45, color: '59,130,246', speed: 0.0002 },
      { x: 0.5, y: 0.5, r: 0.35, color: '6,182,212', speed: 0.00025 },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Base background
      ctx.fillStyle = '#0a0f1e';
      ctx.fillRect(0, 0, width, height);

      // Animated blobs
      orbs.forEach((orb, i) => {
        const x = (orb.x + Math.sin(t * orb.speed * 1000 + i) * 0.15) * width;
        const y = (orb.y + Math.cos(t * orb.speed * 1000 + i * 1.3) * 0.12) * height;
        const r = orb.r * Math.min(width, height);

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${orb.color},0.12)`);
        gradient.addColorStop(0.5, `rgba(${orb.color},0.04)`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      });

      // Grid overlay
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      t += 16;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
