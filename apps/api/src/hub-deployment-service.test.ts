import { describe, expect, it, vi } from "vitest";
import { dispatchHubDeployment } from "./hub-deployment-service.js";

describe("Hub deployment dispatcher", () => {
  it("fails closed when the host agent is not configured", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const pool = { query } as unknown as import("pg").Pool;

    await dispatchHubDeployment(
      pool,
      { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", desired_revision: 4 },
      { socketPath: null }
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("state='validating'");
    expect(query.mock.calls[1]?.[0]).toContain("state='failed'");
    expect(query.mock.calls[1]?.[1]).toContain("HOST_AGENT_NOT_CONFIGURED");
  });

  it("does not dispatch a deployment that was already claimed", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const pool = { query } as unknown as import("pg").Pool;

    await dispatchHubDeployment(
      pool,
      { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", desired_revision: 4 },
      { socketPath: "/run/pfsense-hub/deployment-agent.sock" }
    );

    expect(query).toHaveBeenCalledTimes(1);
  });
});
