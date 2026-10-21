import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Platform, Vibration } from "react-native";

import { BarList, ColumnChart, Donut, MIN_COLUMN_SLOT } from "../src/design/charts";
import { haptic, setHapticsEnabled } from "../src/utils/haptics";

const SPECIES = [
  { label: "Okoumé", value: 600, text: "600 m³" },
  { label: "Padouk d’Afrique", value: 300, text: "300 m³" },
  { label: "Azobé", value: 100, text: "100 m³" },
];

const layout = (width: number) => ({ nativeEvent: { layout: { width, height: 200, x: 0, y: 0 } } });

describe("interactive charts", () => {
  it("highlights a donut slice from its legend and shows its value and share in the centre", () => {
    const view = render(<Donut testID="d" data={[{ label: "Valide", value: 8 }, { label: "Expirée", value: 2 }]} centerLabel="pièces" />);
    expect(view.getByText("10")).toBeTruthy();
    fireEvent.press(view.getByTestId("d-item-1"));
    expect(view.getByText("20 %")).toBeTruthy();
    expect(view.getByTestId("d-item-1").props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(view.getByTestId("d-item-1"));
    expect(view.getByText("pièces")).toBeTruthy();
  });

  it("keeps columns on a wide card and spells out the tapped one", () => {
    const view = render(<ColumnChart testID="c" data={SPECIES} />);
    fireEvent(view.getByTestId("c"), "layout", layout(SPECIES.length * (MIN_COLUMN_SLOT + 40)));
    fireEvent.press(view.getByTestId("c-item-1"));
    const callout = view.getByTestId("c-callout");
    expect(callout).toHaveTextContent(/Padouk d’Afrique/);
    expect(callout).toHaveTextContent(/300 m³/);
    expect(callout).toHaveTextContent(/30 %/);
  });

  it("turns into horizontal bars when the columns would be too narrow, so no label is cut", () => {
    const many = [...SPECIES, { label: "Moabi", value: 50 }, { label: "Kévazingo", value: 40 }, { label: "Iroko", value: 30 }];
    const view = render(<ColumnChart testID="c" data={many} />);
    fireEvent(view.getByTestId("c"), "layout", layout(320));
    expect(view.queryByTestId("c-callout")).toBeNull();
    expect(view.getByText("Padouk d’Afrique")).toBeTruthy();
    fireEvent.press(view.getByTestId("c-item-0"));
    expect(view.getByTestId("c-item-0")).toHaveTextContent(/54 %/);
  });

  it("folds a long list (30 species) into « Autres » and shows everything on request", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => ({ label: `Essence ${i + 1}`, value: 30 - i, text: `${30 - i} m³` }));
    const view = render(<ColumnChart testID="c" data={thirty} formatValue={(v) => `${v} m³`} />);
    fireEvent(view.getByTestId("c"), "layout", layout(1200));
    expect(view.getAllByTestId(/^c-item-\d+$/)).toHaveLength(8);
    expect(view.getByText("Autres (23)")).toBeTruthy();
    expect(view.getByText("276 m³")).toBeTruthy();
    expect(view.queryByText("Essence 30")).toBeNull();
    fireEvent.press(view.getByText("Tout afficher (30)"));
    expect(view.getAllByTestId(/^c-item-\d+$/)).toHaveLength(30);
    expect(view.getByText("Essence 30")).toBeTruthy();
    fireEvent.press(view.getByTestId("c-item-0"));
    expect(view.getByTestId("c-item-0")).toHaveTextContent(/6 %/);
    fireEvent.press(view.getByText("Réduire"));
    expect(view.getByText("Autres (23)")).toBeTruthy();
  });

  it("lists bars with full labels and a share on tap", () => {
    const view = render(<BarList testID="b" data={[{ label: "FSC", value: 2, text: "2 · 50 k ha" }, { label: "OLB", value: 2 }]} />);
    expect(view.getByText("2 · 50 k ha")).toBeTruthy();
    fireEvent.press(view.getByTestId("b-item-1"));
    expect(view.getByTestId("b-item-1")).toHaveTextContent(/50 %/);
  });
});

describe("haptics", () => {
  const os = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
    setHapticsEnabled(true);
  });

  it("vibrates briefly on Android only, and can be switched off", () => {
    const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => undefined);
    haptic("select");
    expect(vibrate).not.toHaveBeenCalled();
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    haptic("select");
    expect(vibrate).toHaveBeenCalledWith(35);
    setHapticsEnabled(false);
    haptic("confirm");
    expect(vibrate).toHaveBeenCalledTimes(1);
    vibrate.mockRestore();
  });
});
