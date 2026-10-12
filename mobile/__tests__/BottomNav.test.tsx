import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthUser } from "../src/api/client";
import BottomNav from "../src/components/BottomNav";
import { tabsForRole } from "../src/navigation/tabs";

function user(role: AuthUser["role"]): AuthUser {
  return {
    id: 1,
    email: "a@b.c",
    display_name: "Test",
    role,
    is_active: true,
    cooperative_id: null,
    company_id: null,
  };
}

const initialMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
} as const;

function renderNav(role: AuthUser["role"], active: string = "home") {
  const onChange = jest.fn();
  const view = render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <BottomNav user={user(role)} active={active} onChange={onChange} />
    </SafeAreaProvider>,
  );
  return { view, onChange };
}

describe("BottomNav", () => {
  it("renders operator tabs with a Scan center action and no group", () => {
    const { view } = renderNav("operator");
    for (const t of tabsForRole("operator")) {
      expect(view.getByLabelText(t.label)).toBeTruthy();
    }
    expect(view.getByLabelText("Scan")).toBeTruthy();
    expect(view.queryByLabelText("Groupe")).toBeNull();
  });

  it("renders company/admin tabs without the Scan action", () => {
    for (const role of ["company", "admin"] as const) {
      const { view } = renderNav(role);
      for (const t of tabsForRole(role)) {
        expect(view.getByLabelText(t.label)).toBeTruthy();
      }
      expect(view.queryByLabelText("Scan")).toBeNull();
    }
  });

  it("renders four tabs for a cooperative", () => {
    const { view } = renderNav("cooperative");
    expect(tabsForRole("cooperative")).toHaveLength(4);
    for (const t of tabsForRole("cooperative")) {
      expect(view.getByLabelText(t.label)).toBeTruthy();
    }
  });

  it("marks the active tab as selected and fires onChange", () => {
    const { view, onChange } = renderNav("operator", "map");
    expect(view.getByLabelText("Carte").props.accessibilityState.selected).toBe(true);

    fireEvent.press(view.getByLabelText("Activités"));
    expect(onChange).toHaveBeenCalledWith("history");
  });
});
