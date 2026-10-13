import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

type Listener = (data: { rotation: { alpha: number; beta: number; gamma: number } }) => void;
const motion: { listener: Listener | null } = { listener: null };

jest.mock("expo-sensors", () => ({
  DeviceMotion: {
    isAvailableAsync: jest.fn(async () => true),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((cb: Listener) => {
      motion.listener = cb;
      return { remove: jest.fn() };
    }),
  },
}));

import Clinometer from "../src/components/Clinometer";

const aim = (elevationDeg: number) =>
  act(() => {
    motion.listener?.({
      rotation: { alpha: 0, beta: Math.PI / 2 + (elevationDeg * Math.PI) / 180, gamma: 0 },
    });
  });

describe("Clinometer", () => {
  it("measures the height from two sightings and returns it", async () => {
    const onDone = jest.fn();
    const { getByTestId } = render(
      <Clinometer visible initialDistanceM={20} onDone={onDone} onClose={jest.fn()} />,
    );
    expect(getByTestId("clino-distance").props.value).toBe("20");
    fireEvent.press(getByTestId("clino-start"));
    await waitFor(() => expect(motion.listener).not.toBeNull());

    await aim(55);
    expect(getByTestId("clino-angle").props.children).toBe("+55.0°");
    fireEvent.press(getByTestId("clino-capture"));
    await aim(-5);
    fireEvent.press(getByTestId("clino-capture"));

    expect(getByTestId("clino-result").props.children).toBe("30.3 m");
    fireEvent.press(getByTestId("clino-use"));
    expect(onDone).toHaveBeenCalledWith(30.3);
  });

  it("refuses an inconsistent sighting", async () => {
    const onDone = jest.fn();
    const { getByTestId, queryByTestId, getByText } = render(
      <Clinometer visible onDone={onDone} onClose={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId("clino-distance"), "15");
    fireEvent.press(getByTestId("clino-start"));
    await waitFor(() => expect(motion.listener).not.toBeNull());
    await aim(-10);
    fireEvent.press(getByTestId("clino-capture"));
    await aim(20);
    fireEvent.press(getByTestId("clino-capture"));
    expect(queryByTestId("clino-result")).toBeNull();
    expect(getByText(/Visée incohérente/)).toBeTruthy();
    fireEvent.press(getByTestId("clino-use"));
    expect(onDone).not.toHaveBeenCalled();
  });
});
