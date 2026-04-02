import {
  addGroupEntry,
  createGroup,
  removeGroupEntry
} from "../server/lib/customware/group_files.js";

function takeFlagValue(args, index, flagName) {
  const value = String(args[index + 1] || "");

  if (!value) {
    throw new Error(`Missing value for ${flagName}.`);
  }

  return value;
}

function normalizeEntryType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "user" || normalized === "users") {
    return "user";
  }

  if (normalized === "group" || normalized === "groups") {
    return "group";
  }

  return "";
}

function parseCreateArgs(args) {
  const options = {
    force: false,
    groupId: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!options.groupId && !arg.startsWith("--")) {
      options.groupId = arg;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--layer") {
      throw new Error("The group command only writes L1 groups. Remove --layer.");
    }

    throw new Error(`Unknown group create argument: ${arg}`);
  }

  if (!options.groupId) {
    throw new Error("Usage: node space group create <group-id> [--force]");
  }

  return options;
}

function parseMembershipArgs(args, verb) {
  const options = {
    entryId: "",
    entryType: "",
    groupId: "",
    manager: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!options.groupId && !arg.startsWith("--")) {
      options.groupId = arg;
      continue;
    }

    if (!options.entryType && !arg.startsWith("--")) {
      options.entryType = normalizeEntryType(arg);
      if (!options.entryType) {
        throw new Error(`Unsupported group entry type: ${arg}`);
      }
      continue;
    }

    if (!options.entryId && !arg.startsWith("--")) {
      options.entryId = arg;
      continue;
    }

    if (arg === "--manager") {
      options.manager = true;
      continue;
    }

    if (arg === "--layer") {
      throw new Error("The group command only writes L1 groups. Remove --layer.");
    }

    throw new Error(`Unknown group ${verb} argument: ${arg}`);
  }

  if (!options.groupId || !options.entryType || !options.entryId) {
    throw new Error(
      `Usage: node space group ${verb} <group-id> <user|group> <id> [--manager]`
    );
  }

  return options;
}

function describeRole(options) {
  return options.manager ? "manager" : "member";
}

export const help = {
  name: "group",
  summary: "Manage writable L1 groups and their membership relations.",
  usage: [
    "node space group create <group-id> [--force]",
    "node space group add <group-id> <user|group> <id> [--manager]",
    "node space group remove <group-id> <user|group> <id> [--manager]"
  ],
  description:
    "Creates and updates writable L1 group directories under app/L1. This command never writes L0 firmware groups. Use it to create a group, add users or groups to included_* lists, and manage managing_* lists in group.yaml.",
  arguments: [
    {
      name: "<group-id>",
      description: "Target group id. The command writes app/L1/<group-id>/group.yaml and app/L1/<group-id>/mod/."
    },
    {
      name: "<user|group>",
      description: "Entry kind for add/remove. Use user to target included_users or managing_users, or group to target included_groups or managing_groups."
    },
    {
      name: "<id>",
      description: "User id or group id to add or remove from the target group's membership or manager list."
    }
  ],
  options: [
    {
      flag: "create",
      description: "Create app/L1/<group-id>/ with mod/ and group.yaml."
    },
    {
      flag: "add",
      description: "Add a user or group entry to the target group's included_* list, or to the managing_* list with --manager."
    },
    {
      flag: "remove",
      description: "Remove a user or group entry from the target group's included_* list, or from the managing_* list with --manager."
    },
    {
      flag: "--manager",
      description: "Target the managing_users or managing_groups list instead of included_users or included_groups."
    },
    {
      flag: "--force",
      description: "Replace the full group directory during create."
    }
  ],
  examples: [
    "node space group create team-red",
    "node space group add team-red user alice",
    "node space group add team-red group qa-team",
    "node space group add team-red user alice --manager",
    "node space group remove team-red user alice"
  ]
};

export async function execute(context) {
  const subcommand = String(context.args[0] || "").trim().toLowerCase();
  const subcommandArgs = context.args.slice(1);

  if (subcommand === "create") {
    const options = parseCreateArgs(subcommandArgs);
    const result = createGroup(context.projectRoot, options.groupId, {
      force: options.force
    });
    console.log(`Created group ${result.layer}/${result.groupId}`);
    return 0;
  }

  if (subcommand === "add") {
    const options = parseMembershipArgs(subcommandArgs, "add");
    addGroupEntry(
      context.projectRoot,
      options.groupId,
      options.entryType,
      options.entryId,
      {
        manager: options.manager
      }
    );
    console.log(
      `Added ${options.entryType} ${options.entryId} as ${describeRole(options)} of L1/${options.groupId}`
    );
    return 0;
  }

  if (subcommand === "remove") {
    const options = parseMembershipArgs(subcommandArgs, "remove");
    removeGroupEntry(
      context.projectRoot,
      options.groupId,
      options.entryType,
      options.entryId,
      {
        manager: options.manager
      }
    );
    console.log(
      `Removed ${options.entryType} ${options.entryId} from ${describeRole(options)} list of L1/${options.groupId}`
    );
    return 0;
  }

  throw new Error(
    'Unknown group subcommand. Use "node space help group" for available subcommands.'
  );
}
