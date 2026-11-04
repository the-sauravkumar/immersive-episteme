"use client";

import { useEffect, useRef, useState } from "react";
import { HELP_LINES, HELP_TITLE } from "@/features/process/domain/guidance";
import { practiceStation } from "../domain/route-plan";
import { WalkRuntime } from "../infrastructure/walk-runtime";
import "@/styles/walking-tokens.css";
import "./walkthrough.css";

const KEY_MOVES: Record<string, readonly [number, number]> = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };

export function WalkthroughPractice({ onFinished }: { readonly onFinished: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<WalkRuntime | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const instance = new WalkRuntime(element, [practiceStation()], () => [], { onStationEntered() { setReady(true); }, onStationLeft() {}, onObjectDwell() {}, onPath() {}, onWrongTurn() {} });
    runtime.current = instance;
    void instance.start(0);
    const pressed = new Set<string>();
    const apply = () => {
      let forward = 0;
      let strafe = 0;
      for (const code of pressed) {
        const move = KEY_MOVES[code];
        if (move) {
          forward += move[0];
          strafe += move[1];
        }
      }
      instance.setMove(Math.sign(forward), Math.sign(strafe));
    };
    const down = (event: KeyboardEvent) => {
      if (KEY_MOVES[event.code]) {
        pressed.add(event.code);
        apply();
      }
    };
    const up = (event: KeyboardEvent) => {
      pressed.delete(event.code);
      apply();
    };
    const resize = () => instance.resize(element.clientWidth, element.clientHeight);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("resize", resize);
      instance.dispose();
    };
  }, []);

  return (
    <div className="walkthrough walking" data-slot="walkthrough-practice">
      <div
        ref={host}
        className="walkthrough-view"
        role="application"
        aria-label="Practice yard. Use W, A, S and D to walk and drag to look."
        onPointerDown={(event) => {
          dragging.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = dragging.current;
          if (!start) return;
          runtime.current?.look((event.clientX - start.x) * 0.0032, (event.clientY - start.y) * 0.0032);
          dragging.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          dragging.current = null;
          runtime.current?.endLook();
        }}
      />
      {ready ? null : <div className="walkthrough-cover walkthrough-loading" role="status">Opening The Yard</div>}
      <div className="walkthrough-tools">
        <button type="button" onClick={() => setHelpOpen(true)}>{HELP_TITLE}</button>
      </div>
      <div className="walkthrough-move">
        <button type="button" className="walkthrough-next" onClick={onFinished}>Finish Practice</button>
      </div>
      {helpOpen ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label={HELP_TITLE}>
          <h2>{HELP_TITLE}</h2>
          <p>Walk with W, A, S and D or the arrow keys. Drag to look around.</p>
          {HELP_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <button type="button" onClick={() => setHelpOpen(false)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}
