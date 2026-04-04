import { createAppAccessScope } from "../lib/customware/file_access.js";
import { getRuntimeGroupIndex } from "../lib/customware/group_runtime.js";

export function get(context) {
  const username = String(context.user?.username || "").trim();
  const userIndex =
    context.watchdog && typeof context.watchdog.getIndex === "function"
      ? context.watchdog.getIndex("user_index")
      : null;
  const groupIndex = getRuntimeGroupIndex(context.watchdog, context.runtimeParams);
  const userRecord =
    userIndex && typeof userIndex.getUser === "function" ? userIndex.getUser(username) : null;
  const groups =
    groupIndex && typeof groupIndex.getOrderedGroupsForUser === "function"
      ? groupIndex.getOrderedGroupsForUser(username)
      : [];
  const managedGroups =
    groupIndex && typeof groupIndex.getManagedGroupsForUser === "function"
      ? groupIndex.getManagedGroupsForUser(username)
      : [];
  const isAdmin =
    groupIndex && typeof groupIndex.isUserInGroup === "function"
      ? groupIndex.isUserInGroup(username, "_admin")
      : false;
  const scope = createAppAccessScope({
    groupIndex,
    runtimeParams: context.runtimeParams,
    username
  });

  return {
    fullName: String(userRecord?.fullName || username),
    groups: Array.isArray(groups) ? groups : [],
    isAdmin,
    managedGroups: Array.isArray(managedGroups) ? managedGroups : [],
    scope,
    username
  };
}
