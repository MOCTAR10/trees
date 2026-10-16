import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Linking } from "react-native";

import AboutScreen from "../src/screens/AboutScreen";
import ProfileScreen from "../src/screens/ProfileScreen";

describe("AboutScreen", () => {
  it("presents the app, then answers the FAQ one question at a time", () => {
    const { getByText, getByTestId, queryByText } = render(<AboutScreen onBack={jest.fn()} />);
    expect(getByText("Pour qui")).toBeTruthy();
    fireEvent.press(getByText("Questions fréquentes"));
    expect(getByText(/Les scans et l'abattage s'enregistrent/)).toBeTruthy();
    fireEvent.press(getByTestId("faq-2"));
    expect(getByText(/Uniquement le code national/)).toBeTruthy();
    expect(queryByText(/Les scans et l'abattage s'enregistrent/)).toBeNull();
  });
});

describe("AboutScreen — Green Leaves", () => {
  it("credits Green Leaves Gabon and offers a call to each contact", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const { getByText, getByTestId } = render(<AboutScreen onBack={jest.fn()} />);
    expect(getByText("Green Leaves Gabon")).toBeTruthy();
    expect(getByText("Sabine Anotho")).toBeTruthy();
    expect(getByText("077 52 37 17")).toBeTruthy();
    expect(getByText("Sidibe Moctar")).toBeTruthy();
    expect(getByText("077 72 44 99")).toBeTruthy();
    fireEvent.press(getByTestId("contact-sabine"));
    expect(open).toHaveBeenCalledWith("tel:077523717");
  });
});

describe("ProfileScreen", () => {
  it("shows the organisation and opens À propos", () => {
    const onOpenAbout = jest.fn();
    const user = { id: 1, email: "a@b", role: "operator", first_name: "Jean", last_name: "Ndong" } as any;
    const { getByTestId } = render(
      <ProfileScreen user={user} onLogout={jest.fn()} onBack={jest.fn()} orgName="Bois du Haut-Ogooué" onOpenAbout={onOpenAbout} />,
    );
    expect(getByTestId("profile-org")).toHaveTextContent(/Bois du Haut-Ogooué/);
    fireEvent.press(getByTestId("profile-about"));
    expect(onOpenAbout).toHaveBeenCalled();
  });
});
