import type { Api } from "teleproto";
import type { Plugin } from "./pluginBase";

type CommandRisk = "normal" | "dangerous";
type CommandDelegation = "all" | "owner-only";

interface CommandPolicy {
  risk?: CommandRisk;
  delegation?: CommandDelegation;
  blockedSubcommands?: string[];
  reason?: string;
}

interface CommandInvocation {
  cmd: string;
  messageText: string;
  plugin: Plugin;
  trigger?: Api.Message;
}

function tokenizeCommand(messageText: string): string[] {
  return messageText.trim().split(/\s+/).filter(Boolean);
}

function getCommandPolicy(plugin: Plugin, cmd: string): CommandPolicy {
  return plugin.commandPolicies?.[cmd] || {};
}

function isDelegatedInvocation(trigger?: Api.Message): boolean {
  return Boolean(trigger);
}

function hasBlockedSubcommand(policy: CommandPolicy, messageText: string): string | null {
  if (!policy.blockedSubcommands?.length) return null;
  const tokens = tokenizeCommand(messageText).slice(1).map((part) => part.toLowerCase());
  for (const blocked of policy.blockedSubcommands) {
    const blockedTokens = blocked.toLowerCase().split(/\s+/).filter(Boolean);
    if (
      blockedTokens.length > 0 &&
      blockedTokens.every((part, index) => tokens[index] === part)
    ) {
      return blocked;
    }
  }
  return null;
}

function assertCommandAllowedForInvocation(invocation: CommandInvocation): void {
  const policy = getCommandPolicy(invocation.plugin, invocation.cmd);
  if (!isDelegatedInvocation(invocation.trigger)) return;

  const ownerOnly =
    policy.delegation === "owner-only" ||
    policy.risk === "dangerous";
  if (ownerOnly) {
    throw new Error(
      policy.reason ||
        `Command "${invocation.cmd}" is owner-only and cannot be used through sudo/sure delegation.`
    );
  }

  const blocked = hasBlockedSubcommand(policy, invocation.messageText);
  if (blocked) {
    throw new Error(
      policy.reason ||
        `Command "${invocation.cmd} ${blocked}" is blocked for delegated users.`
    );
  }
}

export type { CommandPolicy };
export { assertCommandAllowedForInvocation, getCommandPolicy, hasBlockedSubcommand };
