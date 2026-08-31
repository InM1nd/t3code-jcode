import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  useUsage: vi.fn(),
}));

vi.mock("../../state/usage", () => ({ useUsage: testState.useUsage }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => children,
  PopoverPopup: ({ children }: { children: React.ReactNode }) => children,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../ui/sidebar", () => ({ SidebarMenuButton: "button", SidebarMenuItem: "div" }));

import { ProviderLimitsWidgetButton } from "./ProviderLimitsPopover";

describe("ProviderLimitsWidgetButton", () => {
  it("renders provider limits once usage data has answered", () => {
    testState.useUsage.mockReturnValue({
      environments: [
        {
          environmentId: "local" as never,
          label: "MacBook",
          isPending: false,
          error: null,
          summary: {
            limits: [
              {
                provider: "codex",
                windows: [{ label: "5h", usedPercent: 42, resetsAt: null }],
              },
            ],
          } as never,
        },
      ],
      isPending: false,
      refresh: vi.fn(),
    });

    const markup = renderToStaticMarkup(<ProviderLimitsWidgetButton />);

    expect(markup).toContain("Codex");
    expect(markup).toContain("42%");
    expect(markup).toContain("View usage history");
    expect(markup).toContain("Refresh provider limits");
  });

  it("shows a pending state before any environment answers", () => {
    testState.useUsage.mockReturnValue({ environments: [], isPending: true, refresh: vi.fn() });

    const markup = renderToStaticMarkup(<ProviderLimitsWidgetButton />);

    expect(markup).toContain("Checking provider limits");
  });
});
