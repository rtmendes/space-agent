export default function setDeviceClassStartTrack() {
  const log = Array.isArray(globalThis.__spaceInitializerExtensionLog)
    ? globalThis.__spaceInitializerExtensionLog
    : (globalThis.__spaceInitializerExtensionLog = []);

  log.push("setDeviceClass:start");
}

