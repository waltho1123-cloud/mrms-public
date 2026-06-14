// Type declarations for packages that ship without their own .d.ts files.

declare module 'ffmpeg-static' {
  /** Absolute path to the bundled ffmpeg binary, or null on unsupported platforms. */
  const ffmpegPath: string | null;
  export default ffmpegPath;
}

declare module 'ffprobe-static' {
  /** Absolute path to the bundled ffprobe binary for the current platform. */
  export const path: string;
}
