'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore, getOrderedCitationMap } from '@/store/useStore';

interface Node {
  id: string;
  type: 'block' | 'citation';
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  source: string;
  target: string;
}

export default function CitationGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { currentProject } = useStore();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!currentProject) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    const blocks = currentProject.blocks;
    const citations = currentProject.citations;
    const citationMap = getOrderedCitationMap(blocks, citations);

    // Build nodes
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Block nodes
    blocks.forEach((b, i) => {
      const html = b.versions[b.activeVersion]?.html || '';
      const div = typeof document !== 'undefined' ? document.createElement('div') : null;
      if (div) div.innerHTML = html;
      const text = (div?.textContent || '').trim().substring(0, 20) || `Block ${i + 1}`;
      nodes.push({
        id: 'block_' + b.id,
        type: 'block',
        label: text || `Block ${i + 1}`,
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0, vy: 0,
      });
    });

    // Citation nodes
    citations.forEach(c => {
      const num = citationMap.get(c.id);
      const label = num ? `[${num}] ${(c.data.title || '').substring(0, 20)}` : (c.data.title || '').substring(0, 20);
      nodes.push({
        id: 'cit_' + c.id,
        type: 'citation',
        label,
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0, vy: 0,
      });
    });

    // Edges
    blocks.forEach(b => {
      b.citationIds.forEach(cid => {
        edges.push({ source: 'block_' + b.id, target: 'cit_' + cid });
      });
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // Force simulation
    function tick() {
      const ns = nodesRef.current;
      const es = edgesRef.current;
      const k = 0.03;
      const repulsion = 2500;
      const springLen = 120;

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[i].x - ns[j].x;
          const dy = ns[i].y - ns[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          ns[i].vx += fx;
          ns[i].vy += fy;
          ns[j].vx -= fx;
          ns[j].vy -= fy;
        }
      }

      for (const e of es) {
        const src = ns.find(n => n.id === e.source);
        const tgt = ns.find(n => n.id === e.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - springLen) * k;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx += fx; src.vy += fy;
        tgt.vx -= fx; tgt.vy -= fy;
      }

      for (const n of ns) {
        n.vx *= 0.8;
        n.vy *= 0.8;
        n.x = Math.max(20, Math.min(W - 20, n.x + n.vx));
        n.y = Math.max(20, Math.min(H - 20, n.y + n.vy));
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      // Edges
      ctx.strokeStyle = '#2d3140';
      ctx.lineWidth = 1;
      for (const e of edgesRef.current) {
        const src = nodesRef.current.find(n => n.id === e.source);
        const tgt = nodesRef.current.find(n => n.id === e.target);
        if (!src || !tgt) continue;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
      }

      // Nodes
      for (const n of nodesRef.current) {
        const isHovered = n.id === hoveredNode;
        if (n.type === 'block') {
          ctx.fillStyle = isHovered ? '#8b90a0' : '#4a5060';
          ctx.fillRect(n.x - 6, n.y - 6, 12, 12);
        } else {
          ctx.fillStyle = isHovered ? '#a0b4ff' : '#6c8aff';
          ctx.beginPath();
          ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Labels
        ctx.fillStyle = '#8b90a0';
        ctx.font = '9px monospace';
        ctx.fillText(n.label.substring(0, 18), n.x + 10, n.y + 4);
      }
    }

    let frame = 0;
    function loop() {
      if (frame < 80) tick();
      frame++;
      draw();
      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [currentProject]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const found = nodesRef.current.find(n => Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2) < 12);
    setHoveredNode(found?.id || null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const found = nodesRef.current.find(n => Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2) < 12);
    if (found && found.type === 'citation') {
      const citId = found.id.replace('cit_', '');
      // Highlight blocks that use this citation
      const event = new CustomEvent('highlight-citation-blocks', { detail: { citationId: citId } });
      window.dispatchEvent(event);
    }
  };

  if (!currentProject) return null;

  return (
    <div className="flex flex-col h-full bg-[#0f1117]">
      <div className="flex-shrink-0 px-3 py-2 border-b border-[#2d3140] flex items-center gap-2">
        <span className="text-[10px] text-[#8b90a0]">
          Circles = citations · Squares = blocks · Click a citation to highlight its blocks
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="flex-1 w-full"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        style={{ cursor: hoveredNode ? 'pointer' : 'default' }}
      />
    </div>
  );
}
