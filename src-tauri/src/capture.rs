use std::ffi::c_void;

use serde::Serialize;
use windows::core::BOOL;
use windows::Win32::{
    Foundation::{HWND, LPARAM, RECT},
    Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER,
        CAPTUREBLT, DIB_RGB_COLORS, HALFTONE, HGDIOBJ, SRCCOPY,
    },
    UI::WindowsAndMessaging::{
        EnumWindows, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, IsWindow,
        IsWindowVisible, SetForegroundWindow, ShowWindow, SW_RESTORE,
    },
};

use crate::{
    contracts::{DesktopError, DesktopErrorCode},
    error::DesktopResult,
};

const MAX_CAPTURE_WIDTH: u32 = 2560;
const MAX_CAPTURE_HEIGHT: u32 = 1440;

#[derive(Clone, Copy, Debug)]
pub struct CaptureRect {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug)]
pub struct BgraFrame {
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureTarget {
    pub id: String,
    pub title: String,
}

fn capture_error(message: &str) -> DesktopError {
    DesktopError::new(DesktopErrorCode::Io, message).retryable(true)
}

fn scaled_dimensions(width: u32, height: u32, max_width: u32, max_height: u32) -> (u32, u32) {
    let scale = f64::min(
        1.0,
        f64::min(
            max_width as f64 / width as f64,
            max_height as f64 / height as f64,
        ),
    );
    (
        (width as f64 * scale).round().max(1.0) as u32,
        (height as f64 * scale).round().max(1.0) as u32,
    )
}

pub fn capture_bgra(
    rect: CaptureRect,
    max_width: u32,
    max_height: u32,
) -> DesktopResult<BgraFrame> {
    let CaptureRect {
        left,
        top,
        width,
        height,
    } = rect;
    if width == 0 || height == 0 {
        return Err(capture_error(
            "A área selecionada não possui tamanho válido.",
        ));
    }
    let (output_width, output_height) = scaled_dimensions(width, height, max_width, max_height);

    // SAFETY: os handles GDI são verificados antes do uso e liberados em todos os caminhos.
    unsafe {
        let screen_dc = GetDC(None);
        if screen_dc.0.is_null() {
            return Err(capture_error("O Windows não forneceu acesso à tela."));
        }
        let memory_dc = CreateCompatibleDC(Some(screen_dc));
        if memory_dc.0.is_null() {
            ReleaseDC(None, screen_dc);
            return Err(capture_error("O Windows não preparou a captura."));
        }
        let bitmap = CreateCompatibleBitmap(screen_dc, output_width as i32, output_height as i32);
        if bitmap.0.is_null() {
            let _ = DeleteDC(memory_dc);
            ReleaseDC(None, screen_dc);
            return Err(capture_error("O Windows não criou a imagem da captura."));
        }
        let previous = SelectObject(memory_dc, HGDIOBJ(bitmap.0));

        let result = (|| -> DesktopResult<BgraFrame> {
            SetStretchBltMode(memory_dc, HALFTONE);
            if !StretchBlt(
                memory_dc,
                0,
                0,
                output_width as i32,
                output_height as i32,
                Some(screen_dc),
                left,
                top,
                width as i32,
                height as i32,
                SRCCOPY | CAPTUREBLT,
            )
            .as_bool()
            {
                return Err(capture_error(
                    "O Windows não conseguiu copiar a área visível.",
                ));
            }

            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: output_width as i32,
                    biHeight: -(output_height as i32),
                    biPlanes: 1,
                    biBitCount: 32,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bgra = vec![0u8; output_width as usize * output_height as usize * 4];
            let rows = GetDIBits(
                memory_dc,
                bitmap,
                0,
                output_height,
                Some(bgra.as_mut_ptr().cast::<c_void>()),
                &mut info,
                DIB_RGB_COLORS,
            );
            if rows != output_height as i32 {
                return Err(capture_error("O Windows retornou uma imagem incompleta."));
            }

            Ok(BgraFrame {
                width: output_width,
                height: output_height,
                bytes: bgra,
            })
        })();

        SelectObject(memory_dc, previous);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(memory_dc);
        ReleaseDC(None, screen_dc);
        result
    }
}

pub fn capture_region(left: i32, top: i32, width: u32, height: u32) -> DesktopResult<Vec<u8>> {
    let mut frame = capture_bgra(
        CaptureRect {
            left,
            top,
            width,
            height,
        },
        MAX_CAPTURE_WIDTH,
        MAX_CAPTURE_HEIGHT,
    )?;
    for pixel in frame.bytes.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }

    let mut png_bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, frame.width, frame.height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder
            .write_header()
            .map_err(|_| capture_error("Não foi possível preparar o arquivo PNG."))?;
        writer
            .write_image_data(&frame.bytes)
            .map_err(|_| capture_error("Não foi possível finalizar o arquivo PNG."))?;
    }
    Ok(png_bytes)
}

unsafe extern "system" fn collect_window(hwnd: HWND, parameter: LPARAM) -> BOOL {
    if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
        return BOOL(1);
    }
    let title_length = unsafe { GetWindowTextLengthW(hwnd) };
    if title_length <= 0 {
        return BOOL(1);
    }
    let mut title_buffer = vec![0u16; title_length as usize + 1];
    let copied = unsafe { GetWindowTextW(hwnd, &mut title_buffer) };
    if copied <= 0 {
        return BOOL(1);
    }
    let title = String::from_utf16_lossy(&title_buffer[..copied as usize]);
    if title.starts_with("QA Flow — Assistente") {
        return BOOL(1);
    }
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err()
        || rect.right <= rect.left
        || rect.bottom <= rect.top
    {
        return BOOL(1);
    }
    let targets = unsafe { &mut *(parameter.0 as *mut Vec<CaptureTarget>) };
    targets.push(CaptureTarget {
        id: (hwnd.0 as usize).to_string(),
        title,
    });
    BOOL(1)
}

pub fn list_windows() -> DesktopResult<Vec<CaptureTarget>> {
    let mut targets: Vec<CaptureTarget> = Vec::new();
    // SAFETY: o callback usa o ponteiro somente durante a chamada síncrona de EnumWindows.
    unsafe {
        EnumWindows(
            Some(collect_window),
            LPARAM((&mut targets as *mut Vec<CaptureTarget>) as isize),
        )
        .map_err(|_| capture_error("O Windows não conseguiu listar as janelas abertas."))?;
    }
    targets.sort_by_cached_key(|target| target.title.to_lowercase());
    targets.dedup_by(|left, right| left.title == right.title);
    Ok(targets)
}

pub fn window_capture_rect(target_id: &str, focus: bool) -> DesktopResult<CaptureRect> {
    let raw = target_id.parse::<usize>().map_err(|_| {
        DesktopError::validation(
            "A janela selecionada é inválida.",
            "targetId",
            "Selecione novamente uma janela aberta.",
        )
    })?;
    let hwnd = HWND(raw as *mut c_void);
    // SAFETY: o handle é revalidado pelo Windows antes de qualquer operação.
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return Err(capture_error(
                "A janela selecionada não está mais disponível. Atualize a lista.",
            ));
        }
        if focus {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = SetForegroundWindow(hwnd);
        }
    }
    if focus {
        std::thread::sleep(std::time::Duration::from_millis(220));
    }
    let mut rect = RECT::default();
    // SAFETY: hwnd foi validado imediatamente antes desta leitura.
    unsafe { GetWindowRect(hwnd, &mut rect) }
        .map_err(|_| capture_error("Não foi possível obter o tamanho da janela."))?;
    Ok(CaptureRect {
        left: rect.left,
        top: rect.top,
        width: (rect.right - rect.left) as u32,
        height: (rect.bottom - rect.top) as u32,
    })
}

pub fn capture_window(target_id: &str) -> DesktopResult<Vec<u8>> {
    let rect = window_capture_rect(target_id, true)?;
    capture_region(rect.left, rect.top, rect.width, rect.height)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn large_capture_is_scaled_inside_the_evidence_budget() {
        assert_eq!(scaled_dimensions(3840, 2160, 2560, 1440), (2560, 1440));
        assert_eq!(scaled_dimensions(1920, 1080, 2560, 1440), (1920, 1080));
    }
}
