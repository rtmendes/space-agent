const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("spaceDesktop", {
  platform: process.platform
});
