import { ComposerControl, type ComposerControlSize } from "./ComposerControl";
import { JcodeIcon } from "./JcodeIcon";

/**
 * Turns the Jcode harness on for the model already selected in the picker.
 * Pressed means the next turn launches `jcode` with that model's backend.
 */
export function JcodeHarnessToggle(props: {
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly size: ComposerControlSize;
  readonly detail: string;
  readonly onToggle: () => void;
}) {
  return (
    <ComposerControl
      type="button"
      size={props.size}
      aria-pressed={props.pressed}
      aria-label={props.detail}
      title={props.detail}
      disabled={props.disabled}
      data-jcode-harness-toggle={props.pressed ? "on" : "off"}
      onClick={props.onToggle}
    >
      <JcodeIcon className={props.size === "xs" ? "size-3" : "size-3.5"} />
      {props.size === "sm" ? "Jcode" : null}
    </ComposerControl>
  );
}
