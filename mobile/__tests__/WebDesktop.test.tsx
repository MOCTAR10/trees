import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Linking, Text } from "react-native";

import DesktopFrame from "../src/web/DesktopFrame";
import WebFieldNotice from "../src/web/WebFieldNotice";

const admin = {
  id: 1,
  email: "mef.dp2@pilote.ga",
  display_name: "Paul Nguema",
  role: "admin" as const,
  is_active: true,
  cooperative_id: null,
  company_id: null,
  first_name: "Paul",
  last_name: "Nguema",
};

describe("Web desktop layout", () => {
  it("passes the screen through untouched on the phone", () => {
    const view = render(
      <DesktopFrame enabled={false} user={admin} active="home" roleLabel="Ministère" onChange={jest.fn()} onLogout={jest.fn()}>
        <Text>contenu</Text>
      </DesktopFrame>,
    );
    expect(view.queryByTestId("desktop-frame")).toBeNull();
    expect(view.getByText("contenu")).toBeTruthy();
  });

  it("shows the Ministry side menu, the user, and navigates", () => {
    const onChange = jest.fn();
    const onLogout = jest.fn();
    const view = render(
      <DesktopFrame
        enabled
        user={admin}
        active="inbox"
        roleLabel="Ministère"
        orgName="Paul Nguema"
        online
        onChange={onChange}
        onLogout={onLogout}
      >
        <Text>contenu</Text>
      </DesktopFrame>,
    );
    for (const key of ["home", "inbox", "map", "orgs", "menu"]) expect(view.getByTestId(`side-${key}`)).toBeTruthy();
    expect(view.getByTestId("side-inbox").props.accessibilityState).toEqual({ selected: true });
    expect(view.getByText("Ministère")).toBeTruthy();
    expect(view.queryByText("Ministère · Paul Nguema")).toBeNull();
    fireEvent.press(view.getByTestId("side-orgs"));
    expect(onChange).toHaveBeenCalledWith("orgs");
    fireEvent.press(view.getByTestId("side-logout"));
    expect(onLogout).toHaveBeenCalled();
    expect(view.getByText("contenu")).toBeTruthy();
  });

  it("hides and shows the side menu from the top bar", () => {
    const view = render(
      <DesktopFrame enabled user={admin} active="home" roleLabel="Ministère" onChange={jest.fn()} onLogout={jest.fn()}>
        <Text>contenu</Text>
      </DesktopFrame>,
    );
    expect(view.getByTestId("desktop-side")).toBeTruthy();
    expect(view.getByTestId("side-ministry")).toHaveTextContent("Ministère des Eaux et Forêts");
    fireEvent.press(view.getByLabelText("Masquer le menu"));
    expect(view.queryByTestId("desktop-side")).toBeNull();
    expect(view.getByText("contenu")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Afficher le menu"));
    expect(view.getByTestId("side-home")).toBeTruthy();
  });

  it("lists every Ministry domain in the side menu instead of the Menu tab", () => {
    const onPress = jest.fn();
    const view = render(
      <DesktopFrame
        enabled
        user={admin}
        active="home"
        roleLabel="Ministère"
        onChange={jest.fn()}
        onLogout={jest.fn()}
        hiddenTabs={["menu"]}
        groups={[{ key: "titres", title: "Titres", items: [{ key: "titres", label: "Titres forestiers", icon: () => null, active: true, onPress }] }]}
      >
        <Text>contenu</Text>
      </DesktopFrame>,
    );
    expect(view.queryByTestId("side-menu")).toBeNull();
    expect(view.getByText("Titres")).toBeTruthy();
    expect(view.getByTestId("side-domain-titres").props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(view.getByTestId("side-domain-titres"));
    expect(onPress).toHaveBeenCalled();
  });

  it("sends field accounts to the Android app", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const onLogout = jest.fn();
    const view = render(<WebFieldNotice role="operator" onLogout={onLogout} />);
    expect(view.getByTestId("web-field-notice")).toHaveTextContent(/au pied de l'arbre/);
    fireEvent.press(view.getByText("Télécharger l'application Android"));
    expect(open).toHaveBeenCalledWith("https://greenleaves.ga/app/foresterie.apk");
    fireEvent.press(view.getByText("Déconnexion"));
    expect(onLogout).toHaveBeenCalled();
  });
});
