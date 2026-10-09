import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import RoleHeader from "../src/components/RoleHeader";
import { fr } from "../src/i18n/fr";

describe("RoleHeader", () => {
  it("renders title, role and handles logout", () => {
    const onLogout = jest.fn();
    const { getByText } = render(
      <RoleHeader
        title="Espace entreprise"
        subtitle="Résidus"
        roleLabel="Entreprise · Ada"
        onLogout={onLogout}
      />,
    );

    expect(getByText("Espace entreprise")).toBeTruthy();
    expect(getByText("Entreprise · Ada")).toBeTruthy();

    fireEvent.press(getByText(fr.common.logout));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
