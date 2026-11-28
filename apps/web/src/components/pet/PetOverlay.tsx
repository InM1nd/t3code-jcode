import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "~/lib/utils";
import {
  clampPetPosition,
  defaultPetPosition,
  PET_SIZE_PX,
  usePetUiStore,
  type PetPosition,
} from "../../petUiStore";
import { PetAscii } from "./PetAscii";
import type { PetMood } from "./petMood";

export const PetOverlay = memo(function PetOverlay(props: { mood: PetMood }) {
  const storedPosition = usePetUiStore((state) => state.position);
  const setStoredPosition = usePetUiStore((state) => state.setPosition);
  // Only set while dragging; the store owns the resting position.
  const [dragPosition, setDragPosition] = useState<PetPosition | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const draggedRef = useRef(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to window resize to keep the pet inside the viewport
  useEffect(() => {
    const onResize = () => {
      const current = usePetUiStore.getState().position;
      if (current === null) return;
      setStoredPosition(clampPetPosition(current.x, current.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setStoredPosition]);

  const resolved = dragPosition ?? storedPosition ?? defaultPetPosition();

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    draggedRef.current = false;
    dragOffsetRef.current = { dx: event.clientX - rect.x, dy: event.clientY - rect.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    draggedRef.current = true;
    setDragPosition(clampPetPosition(event.clientX - offset.dx, event.clientY - offset.dy));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragOffsetRef.current) return;
    dragOffsetRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    if (!draggedRef.current) return;
    setDragPosition((current) => {
      const next = current ?? defaultPetPosition();
      setStoredPosition(clampPetPosition(next.x, next.y));
      return null;
    });
  };

  return (
    <div
      ref={shellRef}
      role="img"
      aria-label={`Companion pet, ${props.mood}`}
      className={cn("fixed z-[90] touch-none select-none", "cursor-grab active:cursor-grabbing")}
      style={{
        width: PET_SIZE_PX,
        height: PET_SIZE_PX,
        left: resolved.x,
        top: resolved.y,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full border border-border/60 bg-background/40 shadow-lg backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10"
      />
      <div className="relative size-full">
        <PetAscii mood={props.mood} size={PET_SIZE_PX} />
      </div>
    </div>
  );
});
