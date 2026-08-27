import { describe, it, expect } from "vitest";
import {
  buildFlow,
  hasFlow,
  type FlowLinkSpec,
  type FlowNodeSpec,
} from "./sankey";

const nodes: FlowNodeSpec[] = [
  { id: "a", label: "A", tone: "flow" },
  { id: "b", label: "B", tone: "flow" },
  { id: "c", label: "C", tone: "goal" },
  { id: "out", label: "Out", tone: "drop" },
];

describe("buildFlow", () => {
  it("resolves link endpoints to node indices and carries the labels", () => {
    const flow = buildFlow(nodes, [
      { source: "a", target: "b", value: 10, tone: "flow" },
      { source: "b", target: "c", value: 4, tone: "goal" },
    ]);
    expect(flow.nodes.map((n) => n.name)).toEqual(["A", "B", "C"]);
    expect(flow.links[0]).toMatchObject({
      source: 0,
      target: 1,
      value: 10,
      sourceName: "A",
      targetName: "B",
    });
  });

  it("assigns each node its longest-path column", () => {
    const flow = buildFlow(nodes, [
      { source: "a", target: "b", value: 10, tone: "flow" },
      { source: "b", target: "c", value: 4, tone: "goal" },
      // A shortcut must not pull C back into column 1.
      { source: "a", target: "c", value: 1, tone: "goal" },
    ]);
    const depth = (name: string) =>
      flow.nodes.find((n) => n.name === name)!.depth;
    expect(depth("A")).toBe(0);
    expect(depth("B")).toBe(1);
    expect(depth("C")).toBe(2);
    expect(flow.maxDepth).toBe(2);
  });

  it("drops links carrying nobody, and the nodes left with none", () => {
    const flow = buildFlow(nodes, [
      { source: "a", target: "b", value: 10, tone: "flow" },
      { source: "b", target: "out", value: 0, tone: "drop" },
    ]);
    expect(flow.links).toHaveLength(1);
    expect(flow.nodes.map((n) => n.name)).toEqual(["A", "B"]);
  });

  it("ignores self-links, unknown endpoints, and non-finite values", () => {
    const flow = buildFlow(nodes, [
      { source: "a", target: "a", value: 5, tone: "flow" },
      { source: "a", target: "nope", value: 5, tone: "flow" },
      { source: "a", target: "b", value: Number.NaN, tone: "flow" },
    ]);
    expect(hasFlow(flow)).toBe(false);
  });

  it("breaks a cycle rather than letting the layout chase it forever", () => {
    const flow = buildFlow(nodes, [
      { source: "a", target: "b", value: 5, tone: "flow" },
      { source: "b", target: "c", value: 5, tone: "flow" },
      { source: "c", target: "a", value: 5, tone: "flow" },
    ]);
    expect(flow.droppedLinks).toBe(1);
    expect(flow.links).toHaveLength(2);
    expect(flow.maxDepth).toBe(2);
  });

  it("preserves node order so callers control the column stacking", () => {
    const links: FlowLinkSpec[] = [
      { source: "a", target: "b", value: 8, tone: "flow" },
      { source: "a", target: "out", value: 2, tone: "drop" },
    ];
    // B and Out share column 1; B is listed first, so it stacks on top.
    expect(buildFlow(nodes, links).nodes.map((n) => n.name)).toEqual([
      "A",
      "B",
      "Out",
    ]);
  });

  it("has nothing to draw with no links", () => {
    expect(hasFlow(buildFlow(nodes, []))).toBe(false);
  });
});
