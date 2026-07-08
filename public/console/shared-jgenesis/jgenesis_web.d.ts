/* tslint:disable */
/* eslint-disable */

export class AudioProcessor {
    free(): void;
    [Symbol.dispose](): void;
    constructor(audio_queue: any);
    process(output_l: Float32Array, output_r: Float32Array): void;
}

export class AudioQueue {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

export class EmulatorChannel {
    free(): void;
    [Symbol.dispose](): void;
    clone(): EmulatorChannel;
    current_file_name(): string;
    constructor();
    request_configure_input(name: string): void;
    request_open_file(): void;
    request_open_gba_bios(): void;
    request_open_rom_bytes(rom: Uint8Array, rom_file_name: string): void;
    request_open_sega_cd_bios(): void;
    request_reset(): void;
    request_upload_save_file(): void;
}

export class WebConfigRef {
    free(): void;
    [Symbol.dispose](): void;
    auto_prescale(): boolean;
    clone(): WebConfigRef;
    filter_mode(): string;
    gba_audio_interpolation(): string;
    gba_color_correction(): string;
    gba_frame_blending(): boolean;
    gba_psg_low_pass(): boolean;
    gba_skip_bios_animation(): boolean;
    genesis_aspect_ratio(): string;
    genesis_emulate_low_pass(): boolean;
    genesis_m68k_divider(): number;
    genesis_non_linear_color_scale(): boolean;
    genesis_remove_sprite_limits(): boolean;
    genesis_render_horizontal_border(): boolean;
    genesis_render_vertical_border(): boolean;
    gg_aspect_ratio(): string;
    constructor();
    preprocess_shader(): string;
    restore_defaults(): void;
    set_auto_prescale(auto_prescale: boolean): void;
    set_filter_mode(filter_mode: string): void;
    set_gba_audio_interpolation(audio_interpolation: string): void;
    set_gba_color_correction(color_correction: string): void;
    set_gba_frame_blending(frame_blending: boolean): void;
    set_gba_psg_low_pass(psg_low_pass: boolean): void;
    set_gba_skip_bios_animation(skip_bios_animation: boolean): void;
    set_genesis_aspect_ratio(aspect_ratio: string): void;
    set_genesis_emulate_low_pass(emulate_low_pass: boolean): void;
    set_genesis_m68k_divider(m68k_divider: string): void;
    set_genesis_non_linear_color_scale(non_linear_color_scale: boolean): void;
    set_genesis_remove_sprite_limits(remove_sprite_limits: boolean): void;
    set_genesis_render_horizontal_border(render_horizontal_border: boolean): void;
    set_genesis_render_vertical_border(render_vertical_border: boolean): void;
    set_gg_aspect_ratio(aspect_ratio: string): void;
    set_preprocess_shader(preprocess_shader: string): void;
    set_sms_aspect_ratio(aspect_ratio: string): void;
    set_sms_crop_left_border(crop: boolean): void;
    set_sms_crop_vertical_border(crop: boolean): void;
    set_sms_fm_enabled(enabled: boolean): void;
    set_sms_remove_sprite_limit(remove_sprite_limit: boolean): void;
    set_sms_timing_mode(timing_mode: string): void;
    set_snes_aspect_ratio(aspect_ratio: string): void;
    set_snes_audio_interpolation(audio_interpolation: string): void;
    sms_aspect_ratio(): string;
    sms_crop_left_border(): boolean;
    sms_crop_vertical_border(): boolean;
    sms_fm_enabled(): boolean;
    sms_remove_sprite_limit(): boolean;
    sms_timing_mode(): string;
    snes_aspect_ratio(): string;
    snes_audio_interpolation(): string;
}

export function build_commit_hash(): string | undefined;

/**
 * # Panics
 *
 * This function will panic if it cannot initialize the console logger.
 */
export function init_logger(): void;

/**
 * # Panics
 */
export function run_emulator(config_ref: WebConfigRef, emulator_channel: EmulatorChannel): Promise<void>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly __wbg_audioprocessor_free: (a: number, b: number) => void;
    readonly __wbg_audioqueue_free: (a: number, b: number) => void;
    readonly __wbg_emulatorchannel_free: (a: number, b: number) => void;
    readonly __wbg_webconfigref_free: (a: number, b: number) => void;
    readonly audioprocessor_new: (a: any) => number;
    readonly audioprocessor_process: (a: number, b: number, c: number, d: any, e: number, f: number, g: any) => void;
    readonly build_commit_hash: () => [number, number];
    readonly emulatorchannel_clone: (a: number) => number;
    readonly emulatorchannel_current_file_name: (a: number) => [number, number];
    readonly emulatorchannel_new: () => number;
    readonly emulatorchannel_request_configure_input: (a: number, b: number, c: number) => void;
    readonly emulatorchannel_request_open_file: (a: number) => void;
    readonly emulatorchannel_request_open_gba_bios: (a: number) => void;
    readonly emulatorchannel_request_open_rom_bytes: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly emulatorchannel_request_open_sega_cd_bios: (a: number) => void;
    readonly emulatorchannel_request_reset: (a: number) => void;
    readonly emulatorchannel_request_upload_save_file: (a: number) => void;
    readonly init_logger: () => void;
    readonly run_emulator: (a: number, b: number) => any;
    readonly webconfigref_auto_prescale: (a: number) => number;
    readonly webconfigref_clone: (a: number) => number;
    readonly webconfigref_filter_mode: (a: number) => [number, number];
    readonly webconfigref_gba_audio_interpolation: (a: number) => [number, number];
    readonly webconfigref_gba_color_correction: (a: number) => [number, number];
    readonly webconfigref_gba_frame_blending: (a: number) => number;
    readonly webconfigref_gba_psg_low_pass: (a: number) => number;
    readonly webconfigref_gba_skip_bios_animation: (a: number) => number;
    readonly webconfigref_genesis_aspect_ratio: (a: number) => [number, number];
    readonly webconfigref_genesis_emulate_low_pass: (a: number) => number;
    readonly webconfigref_genesis_m68k_divider: (a: number) => number;
    readonly webconfigref_genesis_non_linear_color_scale: (a: number) => number;
    readonly webconfigref_genesis_remove_sprite_limits: (a: number) => number;
    readonly webconfigref_genesis_render_horizontal_border: (a: number) => number;
    readonly webconfigref_genesis_render_vertical_border: (a: number) => number;
    readonly webconfigref_gg_aspect_ratio: (a: number) => [number, number];
    readonly webconfigref_new: () => number;
    readonly webconfigref_preprocess_shader: (a: number) => [number, number];
    readonly webconfigref_restore_defaults: (a: number) => void;
    readonly webconfigref_set_auto_prescale: (a: number, b: number) => void;
    readonly webconfigref_set_filter_mode: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_gba_audio_interpolation: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_gba_color_correction: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_gba_frame_blending: (a: number, b: number) => void;
    readonly webconfigref_set_gba_psg_low_pass: (a: number, b: number) => void;
    readonly webconfigref_set_gba_skip_bios_animation: (a: number, b: number) => void;
    readonly webconfigref_set_genesis_aspect_ratio: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_genesis_emulate_low_pass: (a: number, b: number) => void;
    readonly webconfigref_set_genesis_m68k_divider: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_genesis_non_linear_color_scale: (a: number, b: number) => void;
    readonly webconfigref_set_genesis_remove_sprite_limits: (a: number, b: number) => void;
    readonly webconfigref_set_genesis_render_horizontal_border: (a: number, b: number) => void;
    readonly webconfigref_set_genesis_render_vertical_border: (a: number, b: number) => void;
    readonly webconfigref_set_gg_aspect_ratio: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_preprocess_shader: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_sms_aspect_ratio: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_sms_crop_left_border: (a: number, b: number) => void;
    readonly webconfigref_set_sms_crop_vertical_border: (a: number, b: number) => void;
    readonly webconfigref_set_sms_fm_enabled: (a: number, b: number) => void;
    readonly webconfigref_set_sms_remove_sprite_limit: (a: number, b: number) => void;
    readonly webconfigref_set_sms_timing_mode: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_snes_aspect_ratio: (a: number, b: number, c: number) => void;
    readonly webconfigref_set_snes_audio_interpolation: (a: number, b: number, c: number) => void;
    readonly webconfigref_sms_aspect_ratio: (a: number) => [number, number];
    readonly webconfigref_sms_crop_left_border: (a: number) => number;
    readonly webconfigref_sms_crop_vertical_border: (a: number) => number;
    readonly webconfigref_sms_fm_enabled: (a: number) => number;
    readonly webconfigref_sms_remove_sprite_limit: (a: number) => number;
    readonly webconfigref_sms_timing_mode: (a: number) => [number, number];
    readonly webconfigref_snes_aspect_ratio: (a: number) => [number, number];
    readonly webconfigref_snes_audio_interpolation: (a: number) => [number, number];
    readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
    readonly rust_zstd_wasm_shim_free: (a: number) => void;
    readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
    readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue__core_5854fc1c5a87a903___result__Result_____wasm_bindgen_29489cd87e3265b5___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___js_sys_8bb2303fd900241a___Function_fn_wasm_bindgen_29489cd87e3265b5___JsValue_____wasm_bindgen_29489cd87e3265b5___sys__Undefined___js_sys_8bb2303fd900241a___Function_fn_wasm_bindgen_29489cd87e3265b5___JsValue_____wasm_bindgen_29489cd87e3265b5___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___js_sys_8bb2303fd900241a___Function_fn_wasm_bindgen_29489cd87e3265b5___JsValue_____wasm_bindgen_29489cd87e3265b5___sys__Undefined___js_sys_8bb2303fd900241a___Function_fn_wasm_bindgen_29489cd87e3265b5___JsValue_____wasm_bindgen_29489cd87e3265b5___sys__Undefined_______true__77: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___js_sys_8bb2303fd900241a___Function_fn_wasm_bindgen_29489cd87e3265b5___JsValue_____wasm_bindgen_29489cd87e3265b5___sys__Undefined___js_sys_8bb2303fd900241a___Function_fn_wasm_bindgen_29489cd87e3265b5___JsValue_____wasm_bindgen_29489cd87e3265b5___sys__Undefined_______true__78: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true__3: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true__4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true__5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true__6: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true__7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true__8: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke___wasm_bindgen_29489cd87e3265b5___JsValue______true__9: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_29489cd87e3265b5___convert__closures_____invoke_______true_: (a: number, b: number) => void;
    readonly memory: WebAssembly.Memory;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
    readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
