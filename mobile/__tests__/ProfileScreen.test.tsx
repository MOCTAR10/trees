import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";
import ProfileScreen from "../src/screens/ProfileScreen";

jest.mock("../src/api/client", () => ({
  ...jest.requireActual("../src/api/client"),
  updateMyNames: jest.fn(),
}));

const mocked = client as jest.Mocked<typeof client>;

const user: client.AuthUser = {
  id: 15,
  email: "agent.demo@forestry.local",
  display_name: "Operateur Terrain",
  role: "operator",
  is_active: true,
  cooperative_id: null,
  company_id: 14,
  first_name: null,
  last_name: null,
  matricule: "AGT-DEMO-01",
};

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("ProfileScreen names", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lets the agent set their first and last name", async () => {
    mocked.updateMyNames.mockResolvedValue({
      id: 15,
      first_name: "Nzé",
      last_name: "Obiang",
      matricule: "AGT-DEMO-01",
      display_name: "Nzé Obiang",
    });
    const onUserUpdate = jest.fn();
    const view = render(
      <ProfileScreen user={user} onLogout={jest.fn()} onBack={jest.fn()} onUserUpdate={onUserUpdate} />,
    );
    expect(view.getByText("AGT-DEMO-01")).toBeTruthy();
    fireEvent.press(view.getByTestId("profile-edit-names"));
    fireEvent.press(view.getByTestId("profile-save-names"));
    expect(view.getByTestId("profile-message").props.children).toBe("Prénom et nom requis");

    fireEvent.changeText(view.getByTestId("profile-first-name"), "Nzé");
    fireEvent.changeText(view.getByTestId("profile-last-name"), "Obiang");
    fireEvent.press(view.getByTestId("profile-save-names"));
    await flush();
    expect(mocked.updateMyNames).toHaveBeenCalledWith("Nzé", "Obiang");
    expect(onUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: "Nzé", last_name: "Obiang", display_name: "Nzé Obiang" }),
    );
  });
});
