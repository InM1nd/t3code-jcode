import { useAtomValue } from "@effect/atom-react";
import { useId } from "react";

import { APP_STAGE_LABEL } from "../branding";
import { resolveServerBackedAppStageLabel } from "../branding.logic";
import { primaryServerConfigAtom } from "../state/server";

export type SidebarStageBackdropVariant = "nightly" | "dev";
export type EnvironmentIdentificationPillLabel = "Dev" | "Nightly";

// A wide viewBox keeps the 96-unit art height at a fixed scale while sidebar resizing reveals
// more horizontal canvas instead of zooming the scene.
const STAGE_BACKDROP_VIEW_BOX = "0 0 8192 96";

export function resolveSidebarStageBackdropVariant(
  stageLabel: string,
  enabled = true,
): SidebarStageBackdropVariant | null {
  if (!enabled) return null;
  const normalized = stageLabel.trim().toLowerCase();
  if (normalized === "nightly") return "nightly";
  if (normalized === "dev") return "dev";
  return null;
}

export function resolveEnvironmentIdentificationPillLabel(
  stageLabel: string,
): EnvironmentIdentificationPillLabel | null {
  const normalized = stageLabel.trim().toLowerCase();
  if (normalized === "dev") return "Dev";
  if (normalized === "nightly") return "Nightly";
  return null;
}

export function useEnvironmentStageLabel(): string {
  const primaryServerVersion =
    useAtomValue(primaryServerConfigAtom)?.environment.serverVersion ?? null;

  return resolveServerBackedAppStageLabel({
    primaryServerVersion,
    fallbackStageLabel: APP_STAGE_LABEL,
  });
}

export function useSidebarStageBackdropVariant(enabled = true): SidebarStageBackdropVariant | null {
  return resolveSidebarStageBackdropVariant(useEnvironmentStageLabel(), enabled);
}

/** Stage-channel header art; palettes mirror the per-channel app icons in `assets/`. */
export function SidebarStageBackdrop({ variant }: { variant: SidebarStageBackdropVariant }) {
  return (
    <div
      aria-hidden
      className="sidebar-stage-backdrop pointer-events-none absolute inset-x-0 top-0 z-0 h-20 select-none overflow-hidden"
    >
      <StageBackdropArt variant={variant} />
    </div>
  );
}

export function StageBackdropArt({ variant }: { variant: SidebarStageBackdropVariant }) {
  return variant === "nightly" ? <NightlySkyArt /> : <DevBlueprintArt />;
}

const NIGHTLY_STARS: ReadonlyArray<{
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}> = [
  { cx: 14, cy: 10, r: 0.6, opacity: 0.85 },
  { cx: 38, cy: 22, r: 0.4, opacity: 0.55 },
  { cx: 58, cy: 8, r: 0.5, opacity: 0.7 },
  { cx: 84, cy: 16, r: 0.4, opacity: 0.5 },
  { cx: 104, cy: 7, r: 0.6, opacity: 0.8 },
  { cx: 126, cy: 20, r: 0.4, opacity: 0.55 },
  { cx: 148, cy: 11, r: 0.5, opacity: 0.7 },
  { cx: 170, cy: 24, r: 0.4, opacity: 0.5 },
  { cx: 192, cy: 9, r: 0.6, opacity: 0.8 },
  { cx: 214, cy: 18, r: 0.4, opacity: 0.55 },
  { cx: 236, cy: 8, r: 0.5, opacity: 0.7 },
  { cx: 258, cy: 20, r: 0.45, opacity: 0.6 },
  { cx: 278, cy: 11, r: 0.55, opacity: 0.75 },
  { cx: 26, cy: 34, r: 0.4, opacity: 0.45 },
  { cx: 118, cy: 34, r: 0.4, opacity: 0.45 },
  { cx: 202, cy: 32, r: 0.4, opacity: 0.5 },
  { cx: 268, cy: 34, r: 0.4, opacity: 0.45 },
];

const NIGHTLY_SPARKLES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 70, y: 28 },
  { x: 160, y: 36 },
  { x: 246, y: 26 },
];

function NightlySkyArt() {
  const idPrefix = useId().replaceAll(":", "");
  const skyId = `${idPrefix}-stage-night-sky`;
  const glowId = `${idPrefix}-stage-night-glow`;
  const cloudId = `${idPrefix}-stage-night-cloud`;
  const softId = `${idPrefix}-stage-night-soft`;
  const starsId = `${idPrefix}-stage-night-stars`;
  const glowsId = `${idPrefix}-stage-night-glows`;

  return (
    <svg
      className="h-full w-full"
      fill="none"
      preserveAspectRatio="xMinYMin slice"
      viewBox={STAGE_BACKDROP_VIEW_BOX}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={skyId}
          x1="24"
          y1="0"
          x2="264"
          y2="96"
          gradientUnits="userSpaceOnUse"
          spreadMethod="reflect"
        >
          <stop stopColor="#07152F" />
          <stop offset="0.5" stopColor="#151443" />
          <stop offset="1" stopColor="#32155B" />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(216 18) rotate(137) scale(120 84)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5165D8" stopOpacity="0.4" />
          <stop offset="0.5" stopColor="#283075" stopOpacity="0.16" />
          <stop offset="1" stopColor="#111635" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cloudId} x1="0" y1="60" x2="288" y2="96" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4EA4FF" stopOpacity="0.5" />
          <stop offset="0.52" stopColor="#696FEA" stopOpacity="0.62" />
          <stop offset="1" stopColor="#A85BEA" stopOpacity="0.5" />
        </linearGradient>
        <filter id={softId} x="-24" y="-24" width="336" height="144" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <pattern id={starsId} width="288" height="96" patternUnits="userSpaceOnUse">
          <g fill="#E4EAFF">
            {NIGHTLY_STARS.map((star) => (
              <circle
                key={`${star.cx}-${star.cy}`}
                cx={star.cx}
                cy={star.cy}
                r={star.r}
                fillOpacity={star.opacity}
              />
            ))}
          </g>
          <g stroke="#C8D7FF" strokeLinecap="round" strokeOpacity="0.7" strokeWidth="0.6">
            {NIGHTLY_SPARKLES.map((sparkle) => (
              <g key={`${sparkle.x}-${sparkle.y}`}>
                <path d={`M${sparkle.x - 1.5} ${sparkle.y}H${sparkle.x + 1.5}`} />
                <path d={`M${sparkle.x} ${sparkle.y - 1.5}V${sparkle.y + 1.5}`} />
              </g>
            ))}
          </g>
        </pattern>
        <pattern id={glowsId} width="640" height="96" patternUnits="userSpaceOnUse">
          <rect width="640" height="96" fill={`url(#${glowId})`} />
        </pattern>
      </defs>

      <rect width="100%" height="96" fill={`url(#${skyId})`} />
      <rect width="100%" height="96" fill={`url(#${glowsId})`} />
      <rect width="100%" height="96" fill={`url(#${starsId})`} />

      <g filter={`url(#${softId})`}>
        <path
          d="M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z"
          fill={`url(#${cloudId})`}
        />
      </g>
      <g filter={`url(#${softId})`}>
        <path
          d="M150 96C151 84 161 75 173 75C176 64 186 57 198 57C210 57 220 64 223 75C231 75 238 80 241 87C250 87 257 91 260 96H150Z"
          fill={`url(#${cloudId})`}
          fillOpacity="0.8"
        />
      </g>
    </svg>
  );
}

function DevBlueprintArt() {
  const idPrefix = useId().replaceAll(":", "");
  const paperId = `${idPrefix}-stage-jc-paper`;
  const glowId = `${idPrefix}-stage-jc-glow`;
  const glow2Id = `${idPrefix}-stage-jc-glow-2`;
  const dotsId = `${idPrefix}-stage-jc-dots`;
  const softId = `${idPrefix}-stage-jc-soft`;
  const glowsId = `${idPrefix}-stage-jc-glows`;

  // Sparse sampling of the jcode mark, mapped into a 288×96 tile.
  const tileDots: ReadonlyArray<{ cx: number; cy: number; r: number; o: number }> = [
    { cx: 42, cy: 18, r: 1.8, o: 0.55 },
    { cx: 52, cy: 14, r: 2.1, o: 0.7 },
    { cx: 62, cy: 20, r: 1.9, o: 0.6 },
    { cx: 72, cy: 28, r: 2.0, o: 0.65 },
    { cx: 82, cy: 36, r: 1.7, o: 0.5 },
    { cx: 34, cy: 28, r: 1.6, o: 0.45 },
    { cx: 44, cy: 34, r: 2.0, o: 0.62 },
    { cx: 54, cy: 42, r: 2.2, o: 0.72 },
    { cx: 64, cy: 50, r: 2.1, o: 0.68 },
    { cx: 74, cy: 58, r: 1.8, o: 0.55 },
    { cx: 26, cy: 40, r: 1.5, o: 0.4 },
    { cx: 36, cy: 48, r: 1.9, o: 0.58 },
    { cx: 46, cy: 56, r: 2.0, o: 0.64 },
    { cx: 56, cy: 64, r: 1.9, o: 0.6 },
    { cx: 66, cy: 72, r: 1.6, o: 0.48 },
    { cx: 188, cy: 16, r: 1.7, o: 0.5 },
    { cx: 198, cy: 22, r: 2.0, o: 0.66 },
    { cx: 208, cy: 30, r: 1.8, o: 0.58 },
    { cx: 218, cy: 38, r: 2.1, o: 0.7 },
    { cx: 228, cy: 46, r: 1.7, o: 0.52 },
    { cx: 180, cy: 34, r: 1.5, o: 0.42 },
    { cx: 190, cy: 42, r: 1.9, o: 0.6 },
    { cx: 200, cy: 50, r: 2.0, o: 0.66 },
    { cx: 210, cy: 58, r: 1.8, o: 0.55 },
    { cx: 220, cy: 66, r: 1.5, o: 0.42 },
  ];

  return (
    <svg
      className="stage-blueprint h-full w-full"
      fill="none"
      preserveAspectRatio="xMinYMin slice"
      viewBox={STAGE_BACKDROP_VIEW_BOX}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={paperId}
          x1="40"
          y1="0"
          x2="240"
          y2="96"
          gradientUnits="userSpaceOnUse"
          spreadMethod="reflect"
        >
          <stop style={{ stopColor: "var(--stage-bp-bottom)" }} />
          <stop offset="0.48" style={{ stopColor: "var(--stage-bp-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--stage-bp-top)" }} />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(120 20) rotate(130) scale(140 90)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--stage-bp-glow)" stopOpacity="0.42" />
          <stop offset="0.55" stopColor="var(--stage-bp-glow-mid)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--stage-bp-glow-fade)" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id={glow2Id}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(520 36) rotate(150) scale(160 95)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--stage-bp-glow)" stopOpacity="0.36" />
          <stop offset="0.5" stopColor="var(--stage-bp-glow-mid)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--stage-bp-glow-fade)" stopOpacity="0" />
        </radialGradient>
        <filter id={softId} x="-24" y="-24" width="336" height="144" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <pattern id={dotsId} width="288" height="96" patternUnits="userSpaceOnUse">
          <g filter={`url(#${softId})`}>
            {tileDots.map((dot) => (
              <circle
                key={`${dot.cx}-${dot.cy}`}
                cx={dot.cx}
                cy={dot.cy}
                r={dot.r}
                fill="var(--stage-bp-dot)"
                fillOpacity={dot.o}
              />
            ))}
          </g>
          <g fill="var(--stage-bp-spark)" fillOpacity="0.35">
            <circle cx="140" cy="22" r="0.7" />
            <circle cx="156" cy="48" r="0.55" />
            <circle cx="248" cy="18" r="0.65" />
            <circle cx="268" cy="54" r="0.5" />
            <circle cx="18" cy="62" r="0.55" />
          </g>
        </pattern>
        <pattern id={glowsId} width="640" height="96" patternUnits="userSpaceOnUse">
          <rect width="640" height="96" fill={`url(#${glowId})`} />
          <rect width="640" height="96" fill={`url(#${glow2Id})`} />
        </pattern>
      </defs>

      <rect width="100%" height="96" fill={`url(#${paperId})`} />
      <rect width="100%" height="96" fill={`url(#${glowsId})`} />
      <rect width="100%" height="96" fill={`url(#${dotsId})`} />
    </svg>
  );
}
