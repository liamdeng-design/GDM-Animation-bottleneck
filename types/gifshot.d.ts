declare module 'gifshot' {
  interface Options {
    images?: string[];
    gifWidth?: number;
    gifHeight?: number;
    interval?: number;
    numFrames?: number;
    frameDuration?: number;
    fontWeight?: string;
    fontSize?: string;
    fontFamily?: string;
    fontColor?: string;
    textAlign?: string;
    textBaseline?: string;
    text?: string;
    sampleInterval?: number;
    numWorkers?: number;
    filter?: string;
    transparent?: string;
    offset?: number;
  }

  interface Response {
    error: boolean;
    errorCode?: string;
    errorMsg?: string;
    image: string;
  }

  function createGIF(options: Options, callback: (obj: Response) => void): void;

  export default {
    createGIF
  };
}
