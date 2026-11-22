import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestHostDeploymentMock } = vi.hoisted(() => ({ requestHostDeploymentMock: vi.fn() }));
vi.mock("./deployment-agent-client.js", () => ({ requestHostDeployment: requestHostDeploymentMock }));
import { dispatchHubDeployment } from "./hub-deployment-service.js";

describe("Hub deployment dispatcher", () => {
  beforeEach(() => requestHostDeploymentMock.mockReset());
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

  it("fails closed when the configured socket path is an empty string", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const pool = { query } as unknown as import("pg").Pool;

    await dispatchHubDeployment(
      pool,
      { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", desired_revision: 4 },
      { socketPath: "" }
    );

    expect(query).toHaveBeenCalledTimes(2);
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

  it("holds the desired revision row lock until host verification is recorded", async () => {
    const dbQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ desired_revision: 4 }], rowCount: 1 }) // locked state
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // deployment success
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // applied revision
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // COMMIT
    const db = { query: dbQuery, release: vi.fn() };
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const pool = { query: poolQuery, connect: vi.fn().mockResolvedValue(db) } as unknown as import("pg").Pool;
    requestHostDeploymentMock.mockImplementation(async () => {
      expect(dbQuery.mock.calls.some(call => String(call[0]).includes("FOR UPDATE"))).toBe(true);
      return { state: "succeeded", appliedOrigin: "https://hub.example.ts.net" };
    });

    await dispatchHubDeployment(
      pool,
      { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", desired_revision: 4 },
      { socketPath: "/run/pfsense-hub/agent.sock" }
    );

    expect(requestHostDeploymentMock).toHaveBeenCalledOnce();
    expect(dbQuery.mock.calls[dbQuery.mock.calls.length - 1]?.[0]).toBe("COMMIT");
    expect(db.release).toHaveBeenCalledOnce();
  });

  it("does not call the host agent for a stale revision", async () => {
    const dbQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ desired_revision: 5 }], rowCount: 1 }) // locked state
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // stale deployment
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // COMMIT
    const db = { query: dbQuery, release: vi.fn() };
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const pool = { query: poolQuery, connect: vi.fn().mockResolvedValue(db) } as unknown as import("pg").Pool;

    await dispatchHubDeployment(
      pool,
      { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", desired_revision: 4 },
      { socketPath: "/run/pfsense-hub/agent.sock" }
    );

    expect(requestHostDeploymentMock).not.toHaveBeenCalled();
    expect(dbQuery.mock.calls[2]?.[0]).toContain("STALE_DEPLOYMENT");
    expect(db.release).toHaveBeenCalledOnce();
  });


  it("records a safe failure if the database connection cannot be acquired", async () => {
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const pool = {
      query: poolQuery,
      connect: vi.fn().mockRejectedValue(new Error("DB_DOWN"))
    } as unknown as import("pg").Pool;

    await dispatchHubDeployment(
      pool,
      { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", desired_revision: 4 },
      { socketPath: "/run/pfsense-hub/agent.sock" }
    );

    expect(poolQuery).toHaveBeenCalledTimes(3);
    expect(poolQuery.mock.calls[2]?.[0]).toContain("state='failed'");
    expect(poolQuery.mock.calls[2]?.[1]).toContain("DB_DOWN");
    expect(requestHostDeploymentMock).not.toHaveBeenCalled();
  });

});
