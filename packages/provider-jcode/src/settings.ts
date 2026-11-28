import {
  CustomModelSetting,
  makeBinaryPathSetting,
  makeProviderSettingsSchema,
  TrimmedString,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const JcodeSettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(true)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("jcode").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the jcode CLI binary.",
        providerSettingsForm: { placeholder: "jcode", clearWhenEmpty: "omit" },
      }),
    ),
    model: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Model",
        description: "Optional jcode model passed at spawn (for example claude-opus-5).",
        providerSettingsForm: { placeholder: "claude-opus-5", clearWhenEmpty: "omit" },
      }),
    ),
    providerProfile: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Provider profile",
        description: "Optional jcode --provider-profile from ~/.jcode/config.toml.",
        providerSettingsForm: { placeholder: "my-gateway", clearWhenEmpty: "omit" },
      }),
    ),
    jcodeProvider: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Jcode provider",
        description: "Optional jcode -p provider (claude, openai, or another configured backend).",
        providerSettingsForm: { placeholder: "auto", clearWhenEmpty: "omit" },
      }),
    ),
    customModels: Schema.Array(CustomModelSetting).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "model", "jcodeProvider", "providerProfile"],
  },
);
export type JcodeSettings = typeof JcodeSettings.Type;
