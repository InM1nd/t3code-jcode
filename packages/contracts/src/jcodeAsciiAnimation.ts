import * as Schema from "effect/Schema";

export const JcodeAsciiAnimation = Schema.Literals(["blob", "logo", "static", "off"]);
export type JcodeAsciiAnimation = typeof JcodeAsciiAnimation.Type;
export const DEFAULT_JCODE_ASCII_ANIMATION: JcodeAsciiAnimation = "blob";
