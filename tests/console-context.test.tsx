import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ConsoleProvider, useConsole } from "@/console-context";

function Probe() {
  const { environment, setEnvironment } = useConsole();
  return (
    <button
      onClick={() =>
        setEnvironment(environment === "test" ? "production" : "test")
      }
    >
      {environment}
    </button>
  );
}

describe("ConsoleProvider", () => {
  beforeEach(() => sessionStorage.clear());

  it("starts in test and persists an explicit production switch for the session", async () => {
    const user = userEvent.setup();
    render(
      <ConsoleProvider>
        <Probe />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("button", { name: "test" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "test" }));
    expect(
      screen.getByRole("button", { name: "production" }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("starcat-admin-environment")).toBe(
      "production",
    );
  });
});
