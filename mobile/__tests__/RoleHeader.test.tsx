import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import RoleHeader from "../src/components/RoleHeader";

describe("RoleHeader", () => {
  it("renders title, subtitle and opens profile from the top", () => {
    const onOpenProfile = jest.fn();
    const { getByText, getByLabelText } = render(
      <RoleHeader
        title="Espace entreprise"
        subtitle="Résidus · Ada"
        onOpenProfile={onOpenProfile}
      />,
    );

    expect(getByText("ESPACE ENTREPRISE")).toBeTruthy();
    expect(getByText("Ministère des Eaux et Forêts")).toBeTruthy();
    expect(getByText("Résidus · Ada")).toBeTruthy();

    fireEvent.press(getByLabelText("Profil"));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it("renders no profile action when no handler is provided", () => {
    const { queryByLabelText } = render(<RoleHeader title="Titre" />);
    expect(queryByLabelText("Profil")).toBeNull();
  });

  it("renders seal header with ministry, role badge, org and labeled actions", () => {
    const onOpenProjects = jest.fn();
    const { getByText, getByLabelText } = render(
      <RoleHeader
        title="Foresterie Numérique"
        roleLabel="Agent de terrain"
        orgName="Terrain"
        onOpenProfile={() => undefined}
        onOpenProjects={onOpenProjects}
      />,
    );

    expect(getByText("FORESTERIE NUMÉRIQUE")).toBeTruthy();
    expect(getByText("Ministère des Eaux et Forêts")).toBeTruthy();
    expect(getByText("Agent de terrain")).toBeTruthy();
    expect(getByText("Terrain")).toBeTruthy();
    expect(getByText("Projets")).toBeTruthy();
    expect(getByText("Profil")).toBeTruthy();

    fireEvent.press(getByLabelText("Projets"));
    expect(onOpenProjects).toHaveBeenCalledTimes(1);
  });

  it("renders the GPS row with coordinates, or a locating fallback", () => {
    const { getByText, rerender } = render(
      <RoleHeader title="Foresterie Numérique" coords={{ latitude: 0.4162, longitude: 9.4541 }} />,
    );
    expect(getByText("0.4162, 9.4541")).toBeTruthy();

    rerender(<RoleHeader title="Foresterie Numérique" coords={null} />);
    expect(getByText("Localisation…")).toBeTruthy();
  });

  it("shows the uniform rank stripes for Ministry and company roles only", () => {
    const { queryByTestId, rerender } = render(<RoleHeader title="T" roleLabel="Administrateur" role="admin" />);
    expect(queryByTestId("rank-stripes")?.children).toHaveLength(2);
    rerender(<RoleHeader title="T" roleLabel="Entreprise" role="company" />);
    expect(queryByTestId("rank-stripes")?.children).toHaveLength(1);
    rerender(<RoleHeader title="T" roleLabel="Agent de terrain" role="operator" />);
    expect(queryByTestId("rank-stripes")).toBeNull();
  });

  it("shows the server connection badge, with the waiting scans when offline", () => {
    const { getByTestId, rerender } = render(
      <RoleHeader title="T" coords={null} connection="online" pending={2} />,
    );
    expect(getByTestId("connection-badge")).toHaveTextContent("En ligne");
    rerender(<RoleHeader title="T" coords={null} connection="offline" pending={2} />);
    expect(getByTestId("connection-badge")).toHaveTextContent("Hors-ligne · 2 en attente");
    rerender(<RoleHeader title="T" coords={null} connection="offline" />);
    expect(getByTestId("connection-badge")).toHaveTextContent("Hors-ligne");
    rerender(<RoleHeader title="T" coords={null} connection="checking" />);
    expect(getByTestId("connection-badge")).toHaveTextContent("Connexion…");
  });

  it("hides the GPS row when coords are not provided", () => {
    const { queryByText } = render(<RoleHeader title="Titre" />);
    expect(queryByText("Localisation…")).toBeNull();
  });
});
