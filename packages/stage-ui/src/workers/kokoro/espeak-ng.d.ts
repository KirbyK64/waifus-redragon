// @echogarden/espeak-ng-emscripten ships no types; only what pt-br.ts uses.
declare module '@echogarden/espeak-ng-emscripten' {
  export interface ESpeakNGWorker {
    set_voice: (name: string) => void
    /** Returns a pointer to a NUL terminated UTF-8 string in `HEAPU8` */
    convert_to_phonemes: (text: string, ipa: boolean) => { ptr: number }
  }

  export interface ESpeakNGModule {
    HEAPU8: Uint8Array
    eSpeakNGWorker: new () => ESpeakNGWorker
  }

  export default function createModule(options?: {
    locateFile?: (path: string, prefix: string) => string
  }): Promise<ESpeakNGModule>
}
