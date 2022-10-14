/* tslint:disable */
/* eslint-disable */
/**
* @param {string | undefined} json_params
* @returns {WrappedClient}
*/
export function initialize(json_params?: string): WrappedClient;
/**
* @param {WrappedClient} c
* @param {Uint8Array} seed
* @param {boolean} generate_pub_params
* @returns {Uint8Array | undefined}
*/
export function generate_keys(c: WrappedClient, seed: Uint8Array, generate_pub_params: boolean): Uint8Array | undefined;
/**
* @param {WrappedClient} c
* @param {string} id
* @param {number} idx_target
* @returns {Uint8Array}
*/
export function generate_query(c: WrappedClient, id: string, idx_target: number): Uint8Array;
/**
* @param {WrappedClient} c
* @param {Uint8Array} data
* @returns {Uint8Array}
*/
export function decode_response(c: WrappedClient, data: Uint8Array): Uint8Array;
/**
*/
export class WrappedClient {
  free(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wrappedclient_free: (a: number) => void;
  readonly initialize: (a: number, b: number) => number;
  readonly generate_keys: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly generate_query: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly decode_response: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_malloc: (a: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
