fn main() {
    let directory = std::path::Path::new("icons");
    std::fs::create_dir_all(directory).expect("create icons directory");
    let size = 32u32;
    let image_len = 40 + size * size * 4 + size * 4;
    let mut ico = Vec::new();
    ico.extend_from_slice(&[0, 0, 1, 0, 1, 0, 32, 32, 0, 0, 1, 0, 32, 0]);
    ico.extend_from_slice(&image_len.to_le_bytes());
    ico.extend_from_slice(&22u32.to_le_bytes());
    ico.extend_from_slice(&40u32.to_le_bytes());
    ico.extend_from_slice(&size.to_le_bytes());
    ico.extend_from_slice(&(size * 2).to_le_bytes());
    ico.extend_from_slice(&[1, 0, 32, 0]);
    ico.extend_from_slice(&[0; 24]);
    for y in (0..32i32).rev() {
        for x in 0..32i32 {
            let glyph = (x >= 8 && x <= 15 && (y - 15).abs() == x - 8) || (x >= 17 && x <= 24 && y >= 21 && y <= 22);
            ico.extend_from_slice(if glyph { &[217, 248, 229, 255] } else { &[61, 77, 33, 255] });
        }
    }
    ico.extend_from_slice(&[0; 128]);
    let path = directory.join("icon.ico");
    if std::fs::read(&path).ok().as_deref() != Some(ico.as_slice()) { std::fs::write(path, ico).expect("write application icon"); }
    tauri_build::build()
}
