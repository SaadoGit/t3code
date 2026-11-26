import "~/index.css";
import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { type EnvironmentPresentation, useEnvironments } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { SidebarMenu, SidebarProvider } from "../ui/sidebar";
import { SidebarEnvironmentsControl } from "./SidebarEnvironmentsControl";

vi.mock("../../state/environments", { spy: true });
vi.mock("../../state/use-atom-command", { spy: true });

function makeEnvironment(input: {
  id: string;
  label: string;
  primary?: boolean;
  enabled?: boolean;
  phase?: EnvironmentPresentation["connection"]["phase"];
}): EnvironmentPresentation {
  const environmentId = EnvironmentId.make(input.id);
  return {
    environmentId,
    label: input.label,
    displayUrl: input.primary ? "http://127.0.0.1:3773" : null,
    relayManaged: !input.primary,
    entry: {
      environmentId,
      enabled: input.enabled ?? true,
      target: input.primary
        ? {
            _tag: "PrimaryConnectionTarget",
            environmentId,
            label: input.label,
            httpBaseUrl: "http://127.0.0.1:3773",
            wsBaseUrl: "ws://127.0.0.1:3773",
          }
        : {
            _tag: "RelayConnectionTarget",
            environmentId,
            label: input.label,
          },
      profile: Option.none(),
      additionalRoutes: [],
    } as never,
    connection: {
      phase: input.phase ?? "connected",
      error: null,
      traceId: null,
    },
    serverConfig: null,
    refusedRouteIds: [],
  };
}

function setup(environments: EnvironmentPresentation[]) {
  const setEnabled = vi.fn().mockResolvedValue(AsyncResult.success(undefined));
  vi.mocked(useEnvironments).mockReturnValue({
    isReady: true,
    networkStatus: "online",
    environments,
    presentationById: new Map(
      environments.map((environment) => [environment.environmentId, environment] as const),
    ),
  });
  vi.mocked(useAtomCommand).mockReturnValue(setEnabled as never);
  return { setEnabled };
}

describe("SidebarEnvironmentsControl", () => {
  it("stays hidden when only the primary environment is registered", async () => {
    setup([makeEnvironment({ id: "local", label: "This Mac", primary: true })]);
    await using screen = await render(
      <SidebarProvider>
        <div className="mt-64 w-64">
          <SidebarMenu>
            <SidebarEnvironmentsControl />
          </SidebarMenu>
        </div>
      </SidebarProvider>,
    );
    await expect
      .element(screen.getByRole("button", { name: "Environments" }))
      .not.toBeInTheDocument();
  });

  it("opens the popover and toggles saved remote environments on and off", async () => {
    const buildBox = makeEnvironment({
      id: "build-box",
      label: "Build Box",
      enabled: true,
      phase: "connected",
    });
    const devLaptop = makeEnvironment({
      id: "dev-laptop",
      label: "Dev Laptop",
      enabled: false,
      phase: "available",
    });
    const { setEnabled } = setup([
      makeEnvironment({ id: "local", label: "Local Mac", primary: true }),
      buildBox,
      devLaptop,
    ]);

    await using screen = await render(
      <SidebarProvider>
        <div className="mt-64 w-64">
          <SidebarMenu>
            <SidebarEnvironmentsControl />
          </SidebarMenu>
        </div>
      </SidebarProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Environments" }));

    await expect.element(screen.getByText("Build Box")).toBeVisible();
    await expect.element(screen.getByText("Dev Laptop")).toBeVisible();
    await expect.element(screen.getByText("Local Mac")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Switch off Build Box" }));
    expect(setEnabled).toHaveBeenCalledWith({
      environmentId: EnvironmentId.make("build-box"),
      enabled: false,
    });

    await userEvent.click(screen.getByRole("switch", { name: "Switch on Dev Laptop" }));
    expect(setEnabled).toHaveBeenCalledWith({
      environmentId: EnvironmentId.make("dev-laptop"),
      enabled: true,
    });
  });
});
