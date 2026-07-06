#!/usr/bin/env python3
"""Patches jgenesis-web Rust source to support loading ROMs from URL/bytes
instead of only via the rfd file picker.

Changes:
1. config.rs: Add EmulatorCommand::OpenRomBytes { rom, rom_file_name } and
   EmulatorChannel::request_open_rom_bytes() so JS can feed ROM bytes directly.
2. lib.rs: Handle OpenRomBytes in drain_emulator_channel + add open_rom_bytes()
   async function that loads saves from IDB and sends FileOpen event.
"""

import sys
from pathlib import Path


def patch_config_rs(path: Path) -> None:
    content = path.read_text(encoding="utf-8")

    # 1. Add OpenRomBytes variant to EmulatorCommand enum
    old_enum = """#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmulatorCommand {
    OpenFile,
    OpenSegaCdBios,
    OpenGbaBios,
    Reset,
    UploadSaveFile,
    ConfigureInput { name: String },
}"""
    new_enum = """#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmulatorCommand {
    OpenFile,
    OpenRomBytes { rom: Vec<u8>, rom_file_name: String },
    OpenSegaCdBios,
    OpenGbaBios,
    Reset,
    UploadSaveFile,
    ConfigureInput { name: String },
}"""
    assert content.count(old_enum) == 1, "expected exactly one EmulatorCommand enum"
    content = content.replace(old_enum, new_enum, 1)

    # 2. Add request_open_rom_bytes method to EmulatorChannel impl
    old_method = """    pub fn request_open_file(&self) {
        self.commands.borrow_mut().push_back(EmulatorCommand::OpenFile);
    }"""
    new_method = """    pub fn request_open_file(&self) {
        self.commands.borrow_mut().push_back(EmulatorCommand::OpenFile);
    }

    pub fn request_open_rom_bytes(&self, rom: Vec<u8>, rom_file_name: String) {
        self.commands
            .borrow_mut()
            .push_back(EmulatorCommand::OpenRomBytes { rom, rom_file_name });
    }"""
    assert content.count(old_method) == 1, "expected exactly one request_open_file"
    content = content.replace(old_method, new_method, 1)

    path.write_text(content, encoding="utf-8")
    print(f"  Patched {path.name}")


def patch_lib_rs(path: Path) -> None:
    content = path.read_text(encoding="utf-8")

    # 1. Handle OpenRomBytes in drain_emulator_channel
    old_handler = """                EmulatorCommand::OpenFile => {
                    wasm_bindgen_futures::spawn_local(open_file(event_loop_proxy.clone()));
                }"""
    new_handler = """                EmulatorCommand::OpenFile => {
                    wasm_bindgen_futures::spawn_local(open_file(event_loop_proxy.clone()));
                }
                EmulatorCommand::OpenRomBytes { rom, rom_file_name } => {
                    wasm_bindgen_futures::spawn_local(open_rom_bytes(
                        event_loop_proxy.clone(),
                        rom,
                        rom_file_name,
                    ));
                }"""
    assert content.count(old_handler) == 1, "expected exactly one OpenFile handler"
    content = content.replace(old_handler, new_handler, 1)

    # 2. Add open_rom_bytes async function after open_file
    old_open_file_end = """    event_loop_proxy
        .send_event(JgenesisUserEvent::FileOpen {
            rom: contents,
            bios_rom,
            rom_file_name: file_name,
            save_files,
        })
        .expect("Unable to send file opened event");
}

async fn open_bios(key: &str, supported_extensions: &[&str]) {"""
    new_open_file_end = """    event_loop_proxy
        .send_event(JgenesisUserEvent::FileOpen {
            rom: contents,
            bios_rom,
            rom_file_name: file_name,
            save_files,
        })
        .expect("Unable to send file opened event");
}

async fn open_rom_bytes(
    event_loop_proxy: EventLoopProxy<JgenesisUserEvent>,
    rom: Vec<u8>,
    rom_file_name: String,
) {
    let extension = Path::new(&rom_file_name)
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase());

    let bios_rom = match extension.as_deref() {
        Some("chd") => {
            let Some(bios_rom) = read_bios_from_idb(SCD_BIOS_KEY).await else {
                js::alert("Sega CD emulation requires a Sega CD BIOS ROM to be configured");
                return;
            };
            Some(bios_rom)
        }
        Some("gba") => {
            let Some(bios_rom) = read_bios_from_idb(GBA_BIOS_KEY).await else {
                js::alert("GBA emulation requires a GBA BIOS ROM to be configured");
                return;
            };
            Some(bios_rom)
        }
        _ => None,
    };

    let save_files = save::load_all(&rom_file_name).await;

    event_loop_proxy
        .send_event(JgenesisUserEvent::FileOpen {
            rom,
            bios_rom,
            rom_file_name: rom_file_name,
            save_files,
        })
        .expect("Unable to send file opened event");
}

async fn open_bios(key: &str, supported_extensions: &[&str]) {"""
    assert content.count(old_open_file_end) == 1, "expected exactly one open_file end / open_bios start"
    content = content.replace(old_open_file_end, new_open_file_end, 1)

    path.write_text(content, encoding="utf-8")
    print(f"  Patched {path.name}")


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <jgenesis-web-source-dir>")
        sys.exit(1)

    src_dir = Path(sys.argv[1])
    if not src_dir.is_dir():
        print(f"Error: {src_dir} is not a directory")
        sys.exit(1)

    print("Patching jgenesis-web source for URL-based ROM loading...")
    patch_config_rs(src_dir / "src" / "config.rs")
    patch_lib_rs(src_dir / "src" / "lib.rs")
    print("Done.")


if __name__ == "__main__":
    main()