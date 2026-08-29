import * as Schema from "effect/Schema";

export const JcodeAsciiAnimation = Schema.Literals(["blob", "logo"]);
export type JcodeAsciiAnimation = typeof JcodeAsciiAnimation.Type;
export const DEFAULT_JCODE_ASCII_ANIMATION: JcodeAsciiAnimation = "blob";
