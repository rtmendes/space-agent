import { createGuestUser } from "../lib/auth/user_manage.js";
import { areGuestUsersAllowed } from "../lib/utils/runtime_params.js";

export const allowAnonymous = true;

export async function post(context) {
  if (!areGuestUsersAllowed(context.runtimeParams)) {
    return {
      headers: {
        "Cache-Control": "no-store"
      },
      status: 403,
      body: {
        error: "Guest account creation is disabled."
      }
    };
  }

  const guestAccount = createGuestUser(context.projectRoot, {
    runtimeParams: context.runtimeParams
  });

  if (context.watchdog && typeof context.watchdog.refresh === "function") {
    await context.watchdog.refresh();
  }

  return {
    headers: {
      "Cache-Control": "no-store"
    },
    status: 200,
    body: {
      password: guestAccount.password,
      username: guestAccount.username
    }
  };
}
