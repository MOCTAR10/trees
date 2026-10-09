import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import LoginScreen from "../src/screens/LoginScreen";

const mocked = client as jest.Mocked<typeof client>;

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("LoginScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("signs in and returns the session", async () => {
    mocked.login.mockResolvedValue({
      access_token: "token-1",
      token_type: "bearer",
      expires_in: 3600,
      role: "admin",
      display_name: "Administrateur",
    });
    mocked.getMe.mockResolvedValue({
      id: 1,
      email: "admin@x",
      display_name: "Administrateur",
      role: "admin",
      is_active: true,
      cooperative_id: null,
      company_id: null,
    });

    const onLogin = jest.fn();
    const { getByPlaceholderText, getByText } = render(<LoginScreen onLogin={onLogin} />);

    fireEvent.changeText(getByPlaceholderText("Adresse e-mail"), "admin@x");
    fireEvent.changeText(getByPlaceholderText("Mot de passe"), "secret");
    fireEvent.press(getByText("Se connecter"));
    await flush();

    expect(mocked.login).toHaveBeenCalledWith("admin@x", "secret");
    expect(onLogin).toHaveBeenCalledWith({
      token: "token-1",
      user: expect.objectContaining({ role: "admin" }),
    });
  });

  it("shows an error when credentials fail", async () => {
    mocked.login.mockRejectedValue(new Error("401"));

    const { getByPlaceholderText, getByText } = render(<LoginScreen onLogin={jest.fn()} />);
    fireEvent.changeText(getByPlaceholderText("Adresse e-mail"), "admin@x");
    fireEvent.changeText(getByPlaceholderText("Mot de passe"), "wrong");
    fireEvent.press(getByText("Se connecter"));
    await flush();

    expect(getByText("Connexion impossible. Vérifiez vos identifiants.")).toBeTruthy();
  });
});
