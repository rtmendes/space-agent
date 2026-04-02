export default function setDeviceClassEndTrack() {
  const log = Array.isArray(globalThis.__spaceInitializerExtensionLog)
    ? globalThis.__spaceInitializerExtensionLog
    : (globalThis.__spaceInitializerExtensionLog = []);

  log.push("setDeviceClass:end");

  if (document.body) {
    document.body.dataset.initializerExtensions = "active";
  }
}
