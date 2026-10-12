import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import ErrorBoundary from "../src/components/ErrorBoundary";

function Boom(): React.JSX.Element {
  throw new Error("scan render exploded");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("shows a dark fallback with the cause instead of a blank screen", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(getByText("L'application a rencontré un problème")).toBeTruthy();
    expect(getByText("scan render exploded")).toBeTruthy();
  });

  it("offers a home action when provided", () => {
    const onHome = jest.fn();
    const { getByText } = render(
      <ErrorBoundary onHome={onHome}>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.press(getByText("Retour à l'accueil"));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("passes healthy children through untouched", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Contenu sain</Text>
      </ErrorBoundary>,
    );
    expect(getByText("Contenu sain")).toBeTruthy();
  });
});
