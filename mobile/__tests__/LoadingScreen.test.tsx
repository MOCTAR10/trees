import { act, render } from "@testing-library/react-native";
import React from "react";

import LoadingScreen from "../src/components/LoadingScreen";

describe("LoadingScreen", () => {
  it("says what is happening, then reassures when it takes long", () => {
    jest.useFakeTimers();
    const { getByText, queryByTestId } = render(<LoadingScreen message="Démarrage de l'application…" />);
    expect(getByText("Démarrage de l'application…")).toBeTruthy();
    expect(queryByTestId("loading-slow")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(6500);
    });
    expect(queryByTestId("loading-slow")).toBeTruthy();
    jest.useRealTimers();
  });
});
