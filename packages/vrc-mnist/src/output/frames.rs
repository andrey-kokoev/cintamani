use anyhow::Result;
use std::path::Path;

pub fn save_grayscale(
    path: impl AsRef<Path>,
    pixels: &[f32],
    width: u32,
    height: u32,
) -> Result<()> {
    let data: Vec<u8> = pixels
        .iter()
        .map(|x| (x.clamp(0.0, 1.0) * 255.0).round() as u8)
        .collect();
    image::save_buffer(path, &data, width, height, image::ColorType::L8)?;
    Ok(())
}
