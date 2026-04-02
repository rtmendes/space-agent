import { WatchdogHandler } from "../watchdog.js";

function buildPathIndex(paths) {
  const index = Object.create(null);

  for (const projectPath of paths) {
    index[projectPath] = true;
  }

  return index;
}

export default class PathIndexHandler extends WatchdogHandler {
  createInitialState() {
    return Object.create(null);
  }

  rebuild(context) {
    this.state = buildPathIndex(context.getCurrentPaths());
  }

  async onStart(context) {
    this.rebuild(context);
  }

  async onChanges(context) {
    this.rebuild(context);
  }
}
