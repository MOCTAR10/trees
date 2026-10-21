import { render } from "@testing-library/react-native";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useDialog } from "../src/design/layout";

const metrics = { frame: { x: 0, y: 0, width: 360, height: 760 }, insets: { top: 24, left: 0, right: 0, bottom: 48 } };

function Probe({ pad }: { pad?: "lg" | "xl" }) {
  const dialog = useDialog(640, pad);
  return (
    <View testID="sheet" style={dialog.sheet}>
      <Text>contenu</Text>
    </View>
  );
}

describe("bottom sheets on an edge-to-edge Android phone", () => {
  it("keep their last row above the system navigation bar", () => {
    const view = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Probe />
      </SafeAreaProvider>,
    );
    expect(view.getByTestId("sheet").props.style).toMatchObject({ paddingBottom: 24 + 48 });
    view.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <Probe pad="lg" />
      </SafeAreaProvider>,
    );
    expect(view.getByTestId("sheet").props.style).toMatchObject({ paddingBottom: 16 + 48 });
  });

  it("change nothing without a navigation bar (no provider, web, tests)", () => {
    const view = render(<Probe />);
    expect(view.getByTestId("sheet").props.style).toBeFalsy();
  });
});
