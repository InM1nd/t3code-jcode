import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";

import { useClientSettings, useUpdatePrimarySettings } from "~/hooks/useSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const LABELS = {
  blob: "Ambient blob",
  logo: "Tandem mark",
} as const;

/** Fork-owned control for the empty-chat ASCII canvas. */
export function JcodeAsciiAnimationRow() {
  const animation = useClientSettings((settings) => settings.jcodeAsciiAnimation);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("empty-chat-animation")}
      description="Choose the animated ASCII artwork shown in empty chats."
      resetAction={
        animation !== DEFAULT_CLIENT_SETTINGS.jcodeAsciiAnimation ? (
          <SettingResetButton
            label="empty chat animation"
            onClick={() =>
              updateSettings({ jcodeAsciiAnimation: DEFAULT_CLIENT_SETTINGS.jcodeAsciiAnimation })
            }
          />
        ) : null
      }
      control={
        <Select
          value={animation}
          onValueChange={(value) => {
            if (value === "blob" || value === "logo") {
              updateSettings({ jcodeAsciiAnimation: value });
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Empty chat animation">
            <SelectValue>{LABELS[animation]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {Object.entries(LABELS).map(([value, label]) => (
              <SelectItem hideIndicator key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
