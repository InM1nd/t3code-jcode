import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";

import { useClientSettings, useUpdatePrimarySettings } from "~/hooks/useSettings";
import { Switch } from "../ui/switch";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** Fork-owned toggle for the floating companion. Off until the user opts in. */
export function PetEnabledRow() {
  const petEnabled = useClientSettings((settings) => settings.petEnabled);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("companion-pet")}
      description="Show a small floating companion you can drag around the window. It reacts when the active thread is working."
      resetAction={
        petEnabled !== DEFAULT_CLIENT_SETTINGS.petEnabled ? (
          <SettingResetButton
            label="companion pet"
            onClick={() => updateSettings({ petEnabled: DEFAULT_CLIENT_SETTINGS.petEnabled })}
          />
        ) : null
      }
      control={
        <Switch
          checked={petEnabled}
          onCheckedChange={(checked) => updateSettings({ petEnabled: Boolean(checked) })}
          aria-label="Show companion pet"
        />
      }
    />
  );
}
