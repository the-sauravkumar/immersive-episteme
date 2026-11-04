"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface ItemFigureImage {
  path: string;
  alt: string;
}

export function ItemFigure({ image }: { image: ItemFigureImage }) {
  return <Image className="walking-figure" src={image.path} alt={image.alt} width={840} height={560} sizes="(max-width: 480px) 100vw, 420px" unoptimized draggable={false} />;
}

export function ItemAccount({ account, sampleText }: { account: string; sampleText: boolean }) {
  return (
    <div className="flex max-w-[65ch] flex-col gap-2">
      {sampleText ? <span className="walking-sample self-start">Sample Text</span> : null}
      <p className="whitespace-pre-line text-[18px] leading-[1.5]">{account}</p>
    </div>
  );
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" className="mx-auto" style={direction === "down" ? { transform: "rotate(180deg)" } : undefined}>
      <path d="M8 14V3M3 8l5-5 5 5" />
    </svg>
  );
}

export function moveCard(order: readonly string[], index: number, by: -1 | 1): string[] {
  const target = index + by;
  if (target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function moveCardTo(order: readonly string[], from: number, to: number): string[] {
  const next = [...order];
  const [card] = next.splice(from, 1);
  next.splice(to, 0, card!);
  return next;
}

export function SequenceField({ name, options }: { name: string; options: readonly { id: string; label: string }[] }) {
  const [order, setOrder] = useState(() => options.map((option) => option.id));
  const [touched, setTouched] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const labelOf = (id: string) => options.find((option) => option.id === id)?.label ?? id;
  const apply = (next: string[], moved: string) => {
    setOrder(next);
    setTouched(true);
    setAnnouncement(`${labelOf(moved)} is now number ${next.indexOf(moved) + 1} of ${next.length}.`);
  };
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {order.map((id, index) => (
          <li
            key={id}
            className="walking-card"
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging !== null && dragging !== index) apply(moveCardTo(order, dragging, index), order[dragging]!);
              setDragging(null);
            }}
          >
            <span className="min-w-6 text-right tabular-nums">{index + 1}</span>
            <span className="min-w-0 flex-1">{labelOf(id)}</span>
            <button type="button" className="walking-icon-button" aria-label={`Move ${labelOf(id)} up`} disabled={index === 0} onClick={() => apply(moveCard(order, index, -1), id)}>
              <ArrowIcon direction="up" />
            </button>
            <button type="button" className="walking-icon-button" aria-label={`Move ${labelOf(id)} down`} disabled={index === order.length - 1} onClick={() => apply(moveCard(order, index, 1), id)}>
              <ArrowIcon direction="down" />
            </button>
          </li>
        ))}
      </ol>
      {touched ? null : (
        <div>
          <button type="button" className="walking-button" onClick={() => setTouched(true)}>
            Keep This Order
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-[15px]">
        {announcement}
      </p>
      {touched ? order.map((id) => <input key={id} type="hidden" name={name} value={id} />) : null}
    </div>
  );
}

export function MatchingField({ name, pairs, options }: { name: string; pairs: readonly { id: string; image: ItemFigureImage }[]; options: readonly { id: string; label: string }[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {pairs.map((pair, index) => (
        <li key={pair.id} className="flex flex-col gap-2">
          <ItemFigure image={pair.image} />
          <label className="flex flex-col gap-2 text-[18px]">
            Stage for image {index + 1}
            <select className="walking-field" name={name} defaultValue="">
              <option value="">Choose a stage</option>
              {options.map((option) => (
                <option key={option.id} value={`${pair.id}=${option.id}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </li>
      ))}
    </ul>
  );
}

const SKETCH_SCALE = 1000;
const SKETCH_WIDTH = 1600;
const SKETCH_HEIGHT = 1000;

export type SketchStroke = [number, number][];

export function SketchField({ name, maxBytes }: { name: string; maxBytes: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const drawing = useRef<SketchStroke | null>(null);

  const paint = useCallback((all: readonly SketchStroke[]) => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
    context.strokeStyle = "#101d42";
    context.lineWidth = 5;
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const stroke of all) {
      context.beginPath();
      stroke.forEach(([x, y], index) => {
        const px = (x / SKETCH_SCALE) * SKETCH_WIDTH;
        const py = (y / SKETCH_SCALE) * SKETCH_HEIGHT;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.stroke();
    }
  }, []);

  useEffect(() => paint(strokes), [paint, strokes]);

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.max(0, Math.min(SKETCH_SCALE, Math.round(value * SKETCH_SCALE)));
    return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
  };

  const serialized = JSON.stringify(strokes);
  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvas}
        className="walking-canvas"
        width={SKETCH_WIDTH}
        height={SKETCH_HEIGHT}
        role="img"
        aria-label={`Sketch area, ${strokes.length} lines drawn`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = [pointOf(event)];
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          drawing.current.push(pointOf(event));
          paint([...strokes, drawing.current]);
        }}
        onPointerUp={() => {
          if (drawing.current) setStrokes((all) => [...all, drawing.current!]);
          drawing.current = null;
        }}
      />
      <div className="flex gap-3">
        <button type="button" className="walking-button" disabled={strokes.length === 0} onClick={() => setStrokes((all) => all.slice(0, -1))}>
          Undo
        </button>
        <button type="button" className="walking-button" disabled={strokes.length === 0} onClick={() => setStrokes([])}>
          Clear
        </button>
      </div>
      {serialized.length > maxBytes ? <p className="walking-error">This sketch is too detailed to save. Undo a few lines.</p> : null}
      <input type="hidden" name={name} value={strokes.length === 0 ? "" : serialized} />
    </div>
  );
}
