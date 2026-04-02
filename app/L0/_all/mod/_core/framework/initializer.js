import * as device from "./device.js";

export const initialize = globalThis.space.extend(import.meta, async function initialize() {
  await setDeviceClass();
});

const setDeviceClass = globalThis.space.extend(import.meta, async function setDeviceClass() {
  const type = await device.determineInputType();
  const body = document.body;

  body.classList.forEach((className) => {
    if (className.startsWith("device-")) {
      body.classList.remove(className);
    }
  });

  body.classList.add(`device-${type}`);
});
