import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import AdminUsers from "../src/components/AdminUsers";

const mocked = client as jest.Mocked<typeof client>;

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("AdminUsers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists users and toggles their active state", async () => {
    mocked.listUsers.mockResolvedValue([
      {
        id: 4,
        email: "field@x",
        display_name: "Field",
        role: "operator",
        is_active: true,
        cooperative_id: null,
        company_id: 2,
      },
    ]);
    mocked.adminCooperatives.mockResolvedValue([]);
    mocked.setUserActive.mockResolvedValue({
      id: 4,
      email: "field@x",
      display_name: "Field",
      role: "operator",
      is_active: false,
      cooperative_id: null,
      company_id: 2,
    });

    const { getByText, getByRole } = render(<AdminUsers />);
    await flush();

    expect(getByText("field@x")).toBeTruthy();

    fireEvent(getByRole("switch"), "valueChange", false);
    await flush();

    expect(mocked.setUserActive).toHaveBeenCalledWith(4, false);
  });

  it("creates a field agent with first name, last name and matricule", async () => {
    mocked.listUsers.mockResolvedValue([]);
    mocked.adminCooperatives.mockResolvedValue([]);
    mocked.createUser.mockResolvedValue({
      id: 20,
      email: "agent@x",
      display_name: "Nzé Obiang",
      role: "operator",
      is_active: true,
      cooperative_id: null,
      company_id: null,
    });
    const view = render(<AdminUsers />);
    await flush();
    fireEvent.press(view.getByText("+ Nouveau compte"));
    fireEvent.changeText(view.getByTestId("admin-first-name"), "Nzé");
    fireEvent.changeText(view.getByTestId("admin-last-name"), "Obiang");
    fireEvent.changeText(view.getByTestId("admin-matricule"), "AGT-0009");
    fireEvent.changeText(view.getByPlaceholderText("Email"), "agent@x");
    fireEvent.changeText(view.getByPlaceholderText("Mot de passe"), "Secret123");
    fireEvent.press(view.getByText("Créer le compte"));
    await flush();
    expect(mocked.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "agent@x",
        first_name: "Nzé",
        last_name: "Obiang",
        matricule: "AGT-0009",
        role: "operator",
      }),
    );
  });
});
