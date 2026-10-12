import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import LoginScreen from "../src/screens/LoginScreen";

const mocked = client as jest.Mocked<typeof client>;

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  });

describe("LoginScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("signs in and returns the session after email verification", async () => {
    mocked.checkEmail.mockResolvedValue({
      role: "admin",
      display_name: "Administrateur",
      organization: null,
      organization_type: null,
    });
    mocked.login.mockResolvedValue({
      access_token: "token-1",
      token_type: "bearer",
      expires_in: 3600,
      role: "admin",
      display_name: "Administrateur",
    });
    mocked.getMe.mockResolvedValue({
      id: 1,
      email: "admin@x.com",
      display_name: "Administrateur",
      role: "admin",
      is_active: true,
      cooperative_id: null,
      company_id: null,
    });

    const onLogin = jest.fn();
    const { getByPlaceholderText, getByTestId, getByText, getByLabelText } = render(
      <LoginScreen onLogin={onLogin} />,
    );

    fireEvent.changeText(getByPlaceholderText("Adresse e-mail"), "admin@x.com");
    fireEvent.press(getByTestId("verify-button"));
    await flush();
    expect(mocked.checkEmail).toHaveBeenCalledWith("admin@x.com");
    expect(getByText(/Espace/)).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText("Mot de passe"), "secret");
    fireEvent.press(getByText("Se connecter"));
    await flush();

    expect(mocked.login).toHaveBeenCalledWith("admin@x.com", "secret");
    expect(onLogin).toHaveBeenCalledWith({
      token: "token-1",
      user: expect.objectContaining({ role: "admin" }),
    });
  });

  it("shows the linked company when the operator is attached to one", async () => {
    mocked.checkEmail.mockResolvedValue({
      role: "operator",
      display_name: "Jean",
      organization: "Green Leave SARL",
      organization_type: "company",
    });

    const { getByPlaceholderText, getByTestId, getByText } = render(
      <LoginScreen onLogin={jest.fn()} />,
    );
    fireEvent.changeText(getByPlaceholderText("Adresse e-mail"), "jean@x.com");
    fireEvent.press(getByTestId("verify-button"));
    await flush();

    expect(getByText(/Opérateur/)).toBeTruthy();
    expect(getByText(/Green Leave SARL/)).toBeTruthy();
  });

  it("shows a not-found error when the email is unknown", async () => {
    mocked.checkEmail.mockRejectedValue(new Error("404"));

    const { getByPlaceholderText, getByTestId, getByText } = render(<LoginScreen onLogin={jest.fn()} />);
    fireEvent.changeText(getByPlaceholderText("Adresse e-mail"), "ghost@x.com");
    fireEvent.press(getByTestId("verify-button"));
    await flush();

    expect(getByText("Aucun compte associé à cette adresse.")).toBeTruthy();
  });

  it("shows an error when credentials fail", async () => {
    mocked.checkEmail.mockResolvedValue({
      role: "admin",
      display_name: "Administrateur",
      organization: null,
      organization_type: null,
    });
    mocked.login.mockRejectedValue(new Error("401"));

    const { getByPlaceholderText, getByTestId, getByText } = render(<LoginScreen onLogin={jest.fn()} />);
    fireEvent.changeText(getByPlaceholderText("Adresse e-mail"), "admin@x.com");
    fireEvent.press(getByTestId("verify-button"));
    await flush();

    fireEvent.changeText(getByPlaceholderText("Mot de passe"), "wrong");
    fireEvent.press(getByText("Se connecter"));
    await flush();

    expect(getByText("Connexion impossible. Vérifiez vos identifiants.")).toBeTruthy();
  });
});