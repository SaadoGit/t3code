import {
  connectionErrorText,
  connectionStatusText,
  hasSavedBearerRoute,
} from "@t3tools/client-runtime/connection";
import { errorDisplayMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { resolveEnvironmentMachineKind, type EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { msg, T, useGT, useMessages } from "gt-react";
import { ServerIcon } from "lucide-react";
import { useState } from "react";

import { environmentCatalog } from "../../connection/catalog";
import { isDesktopLocalConnectionTarget } from "../../connection/desktopLocal";
import { m, type MessageResolver } from "../../i18n/messages";
import { cn } from "../../lib/utils";
import { type EnvironmentPresentation, useEnvironments } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SharedTooltipTrigger } from "../ui/shared-tooltip";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";

export function isToggleableRemoteEnvironment(environment: EnvironmentPresentation): boolean {
  return (
    environment.entry.target._tag !== "PrimaryConnectionTarget" &&
    !isDesktopLocalConnectionTarget(environment.entry.target)
  );
}

export function isEnvironmentToggleBlocked(environment: EnvironmentPresentation): boolean {
  return environment.connection.phase === "unsupported" && !hasSavedBearerRoute(environment.entry);
}

export function remoteEnvironmentStatus(
  environment: EnvironmentPresentation,
  resolve: MessageResolver = m,
): { readonly text: string; readonly tone: "connected" | "warning" | "error" | "muted" } {
  if (!environment.entry.enabled && environment.connection.phase !== "unsupported") {
    return {
      text: resolve(msg("Off", { $context: "environment switched off" })),
      tone: "muted",
    };
  }
  switch (environment.connection.phase) {
    case "connected":
      return { text: resolve(msg("Connected")), tone: "connected" };
    case "connecting":
      return { text: resolve(msg("Connecting")), tone: "muted" };
    case "reconnecting":
      return environment.connection.awaitingApproval
        ? { text: resolve(msg("Waiting for approval")), tone: "warning" }
        : { text: resolve(msg("Reconnecting")), tone: "error" };
    case "unsupported":
      return { text: resolve(msg("Client not supported")), tone: "muted" };
    case "error":
      return { text: resolve(msg("Connection failed")), tone: "error" };
    case "offline":
      return { text: resolve(msg("Offline")), tone: "warning" };
    case "available":
      return { text: resolve(msg("Not connected")), tone: "muted" };
  }
}

const STATUS_DOT_CLASS = {
  connected: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
  muted: "bg-muted-foreground/40",
} as const;

function summaryDotTone(
  environments: readonly EnvironmentPresentation[],
): keyof typeof STATUS_DOT_CLASS {
  let hasWarning = false;
  let hasConnected = false;
  for (const environment of environments) {
    if (!environment.entry.enabled) continue;
    const { phase, awaitingApproval } = environment.connection;
    if (phase === "error" || (phase === "reconnecting" && !awaitingApproval)) {
      return "error";
    }
    if (phase === "offline" || awaitingApproval) {
      hasWarning = true;
    } else if (phase === "connected") {
      hasConnected = true;
    }
  }
  if (hasWarning) return "warning";
  return hasConnected ? "connected" : "muted";
}

export function SidebarEnvironmentsControl() {
  const { environments } = useEnvironments();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const gt = useGT();
  const resolveMessage = useMessages();
  const [open, setOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<EnvironmentId>>(() => new Set());
  const setEnvironmentEnabled = useAtomCommand(environmentCatalog.setEnabled, {
    reportFailure: false,
  });

  const listedEnvironments = environments.filter(isToggleableRemoteEnvironment);
  if (listedEnvironments.length === 0) return null;

  const handleToggle = async (environmentId: EnvironmentId, enabled: boolean) => {
    setPendingIds((current) => new Set(current).add(environmentId));
    const result = await setEnvironmentEnabled({ environmentId, enabled });
    setPendingIds((current) => {
      if (!current.has(environmentId)) return current;
      const next = new Set(current);
      next.delete(environmentId);
      return next;
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const description =
        error instanceof Error
          ? (errorDisplayMessage(error, resolveMessage) ?? error.message)
          : enabled
            ? gt("Failed to switch the backend on.")
            : gt("Failed to switch the backend off.");
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: enabled ? gt("Could not switch backend on") : gt("Could not switch backend off"),
          description,
        }),
      );
    }
  };

  const handleManageClick = () => {
    setOpen(false);
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings/connections" });
  };

  const badgeTone = summaryDotTone(listedEnvironments);

  return (
    <SidebarMenuItem className="shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <SharedTooltipTrigger
          disabled={open}
          label={gt("Environments")}
          render={
            <PopoverTrigger
              render={
                <SidebarMenuButton aria-label={gt("Environments")} isActive={open} size="icon" />
              }
            />
          }
        >
          <span className="relative inline-flex size-5 items-center justify-center">
            <ServerIcon className="size-4" />
            <span
              className={cn(
                "absolute top-0 right-0 size-1.5 rounded-full ring-1 ring-sidebar",
                STATUS_DOT_CLASS[badgeTone],
              )}
              aria-hidden
            />
          </span>
        </SharedTooltipTrigger>
        <PopoverPopup align="start" padding="compact" side="top" sideOffset={8} width="sm">
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-medium text-muted-foreground">
              <T>Environments</T>
            </span>
            <Button onClick={handleManageClick} size="xs" variant="ghost-muted">
              <T>Manage</T>
            </Button>
          </div>
          <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
            {listedEnvironments.map((environment) => {
              const environmentId = environment.environmentId;
              const unsupported = environment.connection.phase === "unsupported";
              const blocked = isEnvironmentToggleBlocked(environment);
              const enabled = environment.entry.enabled && !unsupported;
              const status = remoteEnvironmentStatus(environment, resolveMessage);
              const machineKind = resolveEnvironmentMachineKind(environment.serverConfig);
              const tooltipText = unsupported
                ? (connectionErrorText(environment.connection, resolveMessage) ??
                  connectionStatusText(environment.connection, resolveMessage))
                : enabled
                  ? connectionStatusText(environment.connection, resolveMessage)
                  : gt("Switched off");
              return (
                <li
                  key={environmentId}
                  className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent/50"
                >
                  <span className="relative inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                    <EnvironmentMachineIcon className="size-4" kind={machineKind} />
                    <span
                      className={cn(
                        "absolute top-0 right-0 size-1.5 rounded-full ring-1 ring-popover",
                        STATUS_DOT_CLASS[status.tone],
                      )}
                      aria-hidden
                    />
                  </span>
                  <SharedTooltipTrigger
                    label={tooltipText}
                    render={<div className="min-w-0 flex-1" />}
                    side="left"
                  >
                    <span
                      className={cn(
                        "block truncate text-sm leading-4 font-medium",
                        enabled ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {environment.label}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-2xs leading-4",
                        enabled && status.tone === "error"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {status.text}
                    </span>
                  </SharedTooltipTrigger>
                  <Switch
                    aria-label={
                      enabled
                        ? gt("Switch off {label}", { label: environment.label })
                        : gt("Switch on {label}", { label: environment.label })
                    }
                    checked={enabled}
                    disabled={blocked || pendingIds.has(environmentId)}
                    onCheckedChange={(checked) => void handleToggle(environmentId, checked)}
                    size="sm"
                  />
                </li>
              );
            })}
          </ul>
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}
