import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Alert, Platform, Text } from "react-native";

jest.mock("expo-updates", () => ({
  __esModule: true,
  isEnabled: true,
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: true })),
  reloadAsync: jest.fn(async () => undefined),
}));

import UpdateBanner from "../src/components/UpdateBanner";
import { useAppUpdate } from "../src/utils/useAppUpdate";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockUpdates = require("expo-updates") as {
  isEnabled: boolean;
  checkForUpdateAsync: jest.Mock;
  fetchUpdateAsync: jest.Mock;
  reloadAsync: jest.Mock;
};

function Probe() {
  const { ready, install } = useAppUpdate(60_000);
  return (
    <Text testID="probe" onPress={() => void install()}>
      {ready ? "ready" : "idle"}
    </Text>
  );
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("Over-the-air updates applied by the user", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdates.isEnabled = true;
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
  });

  it("downloads a new version silently and waits for the user", async () => {
    const view = render(<Probe />);
    await flush();
    expect(mockUpdates.fetchUpdateAsync).toHaveBeenCalled();
    expect(view.getByTestId("probe")).toHaveTextContent("ready");
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId("probe"));
    expect(mockUpdates.reloadAsync).toHaveBeenCalled();
  });

  it("stays quiet when nothing new is published or updates are off", async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const view = render(<Probe />);
    await flush();
    expect(view.getByTestId("probe")).toHaveTextContent("idle");
    expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
    mockUpdates.isEnabled = false;
    jest.clearAllMocks();
    render(<Probe />);
    await flush();
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it("never checks on the web (the site is updated by deployment)", async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    render(<Probe />);
    await flush();
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  });

  it("shows the header badge and asks before restarting", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const onInstall = jest.fn();
    const view = render(
      <UpdateBanner ready onInstall={onInstall} />,
    );
    fireEvent.press(view.getByTestId("update-badge"));
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe("Nouvelle version prête");
    expect(message).toMatch(/terminez d'abord votre saisie/);
    const install = (buttons as { text: string; onPress?: () => void }[]).find((b) => b.text === "Installer maintenant");
    install?.onPress?.();
    expect(onInstall).toHaveBeenCalled();
    const without = render(<UpdateBanner />);
    expect(without.queryByTestId("update-badge")).toBeNull();
  });
});
