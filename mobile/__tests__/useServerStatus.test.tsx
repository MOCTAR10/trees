import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import * as client from "../src/api/client";
import { useServerStatus } from "../src/utils/useServerStatus";

jest.mock("../src/api/client", () => ({ pingGateway: jest.fn() }));

const ping = client.pingGateway as jest.Mock;

function Probe({ onOnline }: { onOnline: () => void }) {
  const { status, recheck } = useServerStatus(true, onOnline);
  (Probe as unknown as { recheck: () => Promise<void> }).recheck = recheck;
  return <Text testID="status">{status}</Text>;
}

describe("useServerStatus", () => {
  it("reports offline, then online, and fires onOnline on the transition", async () => {
    ping.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onOnline = jest.fn();
    const view = render(<Probe onOnline={onOnline} />);
    await act(async () => undefined);
    expect(view.getByTestId("status").props.children).toBe("offline");
    await act(async () => {
      await (Probe as unknown as { recheck: () => Promise<void> }).recheck();
    });
    expect(view.getByTestId("status").props.children).toBe("online");
    expect(onOnline).toHaveBeenCalledTimes(1);
  });
});
