import { buildUserIndexSnapshot } from "../../auth/user_index.js";
import { WatchdogHandler } from "../watchdog.js";

export default class UserIndexHandler extends WatchdogHandler {
  createInitialState() {
    return buildUserIndexSnapshot({
      filePaths: [],
      projectRoot: this.projectRoot,
      runtimeParams: this.runtimeParams
    });
  }

  rebuild(context) {
    const pathIndex = context.getIndex("path_index") || {};

    this.state = buildUserIndexSnapshot({
      filePaths: Object.keys(pathIndex),
      projectRoot: this.projectRoot,
      runtimeParams: this.runtimeParams
    });
  }

  async onStart(context) {
    this.rebuild(context);
  }

  async onChanges(context) {
    this.rebuild(context);
  }
}
