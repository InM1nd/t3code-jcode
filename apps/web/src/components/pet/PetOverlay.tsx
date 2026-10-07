import {
  memo,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

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
  const [position, setPosition] = useState<PetPosition | null>(storedPosition);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const draggedRef = useRef(false);

  const syncFromStore = useEffectEvent((next: PetPosition | null) => {
    setPosition(next);
  });

  useEffect(() => {
    syncFromStore(storedPosition);
  }, [storedPosition]);

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => {
        if (current === null) return current;
        const next = clampPetPosition(current.x, current.y);
        setStoredPosition(next);
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setStoredPosition]);

  const resolved = position ?? defaultPetPosition();

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
    const next = clampPetPosition(event.clientX - offset.dx, event.clientY - offset.dy);
    setPosition(next);
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
    setPosition((current) => {
      const next = current ?? defaultPetPosition();
      const clamped = clampPetPosition(next.x, next.y);
      setStoredPosition(clamped);
      return clamped;
    });
  };

  return (
    <div
      ref={shellRef}
      role="img"
      aria-label={`Companion pet, ${props.mood}`}
      className={cn(
        "fixed z-[90] touch-none select-none overflow-hidden rounded-full border border-border/60",
        "bg-background/40 shadow-lg backdrop-blur-md",
        "cursor-grab active:cursor-grabbing",
        "ring-1 ring-black/5 dark:ring-white/10",
      )}
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
      <PetAscii mood={props.mood} size={PET_SIZE_PX} />
    </div>
  );
});
