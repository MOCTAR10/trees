import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Dimensions } from "react-native";

import RoleHeader from "../src/components/RoleHeader";
import GlossaryScreen from "../src/screens/GlossaryScreen";

describe("GlossaryScreen", () => {
  it("shows the log lifecycle, the file flow and chantier vs open project first", () => {
    const { getByTestId, getByText } = render(<GlossaryScreen onBack={jest.fn()} />);
    expect(getByTestId("glossary-lifecycle")).toBeTruthy();
    expect(getByText("Transformé")).toBeTruthy();
    expect(getByTestId("glossary-file-flow")).toBeTruthy();
    expect(getByText("Projet ouvert")).toBeTruthy();
  });

  it("filters acronyms without accents or case", () => {
    const { getByText, getByTestId, queryByTestId } = render(<GlossaryScreen onBack={jest.fn()} />);
    fireEvent.press(getByText("Sigles"));
    expect(getByTestId("glossary-term-DME")).toBeTruthy();
    fireEvent.changeText(getByTestId("glossary-search"), "diametre minimum");
    expect(getByTestId("glossary-term-DME")).toBeTruthy();
    expect(queryByTestId("glossary-term-CFAD")).toBeNull();
    fireEvent.changeText(getByTestId("glossary-search"), "zzz");
    expect(getByText("Aucun résultat.")).toBeTruthy();
  });

  it("goes back", () => {
    const onBack = jest.fn();
    const { getByLabelText } = render(<GlossaryScreen onBack={onBack} />);
    fireEvent.press(getByLabelText("← Retour"));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("RoleHeader on a phone", () => {
  it("puts the name on its own line and keeps icon-only actions labelled", () => {
    const spy = jest.spyOn(Dimensions, "get").mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    const { getByTestId, getByLabelText, queryByText } = render(
      <RoleHeader title="Foresterie" role="admin" roleLabel="Ministère" orgName="Paul Nguema" onOpenProfile={jest.fn()} />,
    );
    expect(getByTestId("header-org")).toHaveTextContent("Paul Nguema");
    expect(getByLabelText("Profil")).toBeTruthy();
    expect(queryByText("Profil")).toBeNull();
    spy.mockRestore();
  });
});
