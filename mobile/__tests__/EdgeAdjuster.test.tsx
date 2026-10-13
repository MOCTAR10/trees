import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import EdgeAdjuster, { Edges } from "../src/components/EdgeAdjuster";

function Harness({ distanceM, onEdges }: { distanceM: number | null; onEdges: (e: Edges) => void }) {
  const [edges, setEdges] = React.useState<Edges>({ left: 0.35, right: 0.65 });
  return (
    <EdgeAdjuster
      uri="file:///dbh.jpg"
      widthPx={4032}
      heightPx={3024}
      focal35mm={26}
      distanceM={distanceM}
      edges={edges}
      onChange={(e) => {
        setEdges(e);
        onEdges(e);
      }}
    />
  );
}

function layout(view: ReturnType<typeof render>) {
  fireEvent(view.getByTestId("edge-adjuster"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 300 } },
  });
}

describe("EdgeAdjuster", () => {
  it("shows a live DBH and asks for the distance when missing", () => {
    const noDistance = render(<Harness distanceM={null} onEdges={jest.fn()} />);
    layout(noDistance);
    expect(noDistance.getByTestId("edge-dbh").props.children).toMatch(/distance/);
    noDistance.unmount();

    const view = render(<Harness distanceM={2} onEdges={jest.fn()} />);
    layout(view);
    expect(view.getByTestId("edge-dbh").props.children).toMatch(/^DBH ≈ \d+,\d cm$/);
  });

  it("renders both draggable edge lines over the photo", () => {
    const view = render(<Harness distanceM={2} onEdges={jest.fn()} />);
    layout(view);
    expect(view.getByTestId("edge-left").props.onResponderMove).toBeDefined();
    expect(view.getByTestId("edge-right").props.onResponderMove).toBeDefined();
  });
});
