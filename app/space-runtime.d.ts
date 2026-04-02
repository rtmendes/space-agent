type SpaceExtend = typeof import("./L0/_all/mod/_core/framework/extensions.js").extend;

type SpaceRuntime = {
  extend: SpaceExtend;
  [key: string]: any;
};

declare global {
  var space: SpaceRuntime;

  interface Window {
    space: SpaceRuntime;
  }
}

export {};
