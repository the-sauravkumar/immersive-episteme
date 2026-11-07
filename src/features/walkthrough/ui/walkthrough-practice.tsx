"use client";

import { useEffect, useRef, useState } from "react";
import { HELP_TITLE, PRACTICE_HELP_LINES } from "@/features/process/domain/guidance";
import type { WalkEngine, WalkEngineFactory } from "../application/walk-engine";
import { practiceStation } from "../domain/route-plan";
import "@/styles/walking-tokens.css";
import "./walkthrough.css";

const KEY_MOVES: Record<string, readonly [number, number]> = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };

export interface WalkthroughPracticeProps {
  readonly createEngine: WalkEngineFactory;
  readonly onFinished: () => void;
  readonly onRenderFailed: () => void;
  readonly onContextLost: () => void;
}

export function WalkthroughPractice({ createEngine, onFinished, onRenderFailed, onContextLost }: WalkthroughPracticeProps) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<WalkEngine | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const failedHandler = useRef(onRenderFailed);
  const lostHandler = useRef(onContextLost);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    failedHandler.current = onRenderFailed;
    lostHandler.current = onContextLost;
  }, [onRenderFailed, onContextLost]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let instance: WalkEngine | null = null;
    const close = () => {
      instance?.dispose();
      instance = null;
      runtime.current = null;
    };
    let leaving = false;
    const markLeaving = () => {
      leaving = true;
    };
    window.addEventListener("pagehide", markLeaving);
    const fail = () => {
      close();
      if (leaving) return;
      setFailed(true);
      failedHandler.current();
    };
    try {
      instance = createEngine(element, [practiceStation()], () => [], {
        onStationEntered() {
          setReady(true);
        },
        onStationLeft() {},
        onObjectDwell() {},
        onPath() {},
        onWrongTurn() {},
        onContextLost() {
          if (!leaving) lostHandler.current();
          fail();
        },
      });
    } catch {
      fail();
      return () => window.removeEventListener("pagehide", markLeaving);
    }
    runtime.current = instance;
    instance.start(0).catch(() => {
      if (instance) fail();
    });
    const resize = () => runtime.current?.resize(element.clientWidth, element.clientHeight);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", markLeaving);
      close();
    };
  }, [createEngine]);

  useEffect(() => {
    if (!ready) return;
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
      runtime.current?.setMove(Math.sign(forward), Math.sign(strafe));
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
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ready]);

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
        <button type="button" className="walkthrough-next" disabled={!ready} onClick={onFinished}>Finish Practice</button>
      </div>
      {helpOpen ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label={HELP_TITLE}>
          <h2>{HELP_TITLE}</h2>
          <p>Walk with W, A, S and D or the arrow keys. Drag to look around.</p>
          {PRACTICE_HELP_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <button type="button" onClick={() => setHelpOpen(false)}>Close</button>
        </div>
      ) : null}
      {failed ? <div className="walkthrough-cover walkthrough-loading" role="alert">This Device Cannot Show The Yard</div> : null}
    </div>
  );
}
