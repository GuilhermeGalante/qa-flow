use std::{
    fs,
    sync::mpsc::Receiver,
    time::{Duration, Instant},
};

use windows::{
    core::HSTRING,
    Win32::{
        Media::MediaFoundation::{
            MFCreateMediaType, MFCreateMemoryBuffer, MFCreateSample, MFCreateSinkWriterFromURL,
            MFMediaType_Video, MFShutdown, MFStartup, MFVideoFormat_H264, MFVideoFormat_RGB32,
            MFVideoInterlace_Progressive, MFSTARTUP_FULL, MF_MT_AVG_BITRATE, MF_MT_DEFAULT_STRIDE,
            MF_MT_FIXED_SIZE_SAMPLES, MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE, MF_MT_INTERLACE_MODE,
            MF_MT_MAJOR_TYPE, MF_MT_PIXEL_ASPECT_RATIO, MF_MT_SAMPLE_SIZE, MF_MT_SUBTYPE,
            MF_VERSION,
        },
        System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
    },
};

use crate::{
    capture::{capture_bgra, BgraFrame, CaptureRect},
    contracts::{DesktopError, DesktopErrorCode},
    error::DesktopResult,
};

const VIDEO_MAX_WIDTH: u32 = 1280;
const VIDEO_MAX_HEIGHT: u32 = 720;
const VIDEO_FRAME_RATE: u32 = 10;
const VIDEO_BIT_RATE: u32 = 800_000;
const VIDEO_MAX_DURATION: Duration = Duration::from_secs(60);
const HUNDRED_NANOSECONDS_PER_SECOND: i64 = 10_000_000;

fn recording_error(message: &str) -> DesktopError {
    DesktopError::new(DesktopErrorCode::Io, message).retryable(true)
}

fn set_media_type_size(
    media_type: &windows::Win32::Media::MediaFoundation::IMFMediaType,
    key: &windows::core::GUID,
    first: u32,
    second: u32,
) -> windows::core::Result<()> {
    // Media Foundation stores size and ratio attributes as two packed UINT32 values.
    unsafe { media_type.SetUINT64(key, ((first as u64) << 32) | second as u64) }
}

struct MediaFoundationGuard;

impl MediaFoundationGuard {
    fn initialize() -> DesktopResult<Self> {
        // SAFETY: this worker owns the COM apartment and balances both shutdown calls in Drop.
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .ok()
                .map_err(|_| recording_error("O Windows não iniciou o serviço de gravação."))?;
            if MFStartup(MF_VERSION, MFSTARTUP_FULL).is_err() {
                CoUninitialize();
                return Err(recording_error(
                    "O Windows não disponibilizou o codificador de vídeo.",
                ));
            }
        }
        Ok(Self)
    }
}

impl Drop for MediaFoundationGuard {
    fn drop(&mut self) {
        // SAFETY: paired with the successful initialization performed on this same worker.
        unsafe {
            let _ = MFShutdown();
            CoUninitialize();
        }
    }
}

fn even(value: u32) -> u32 {
    value.saturating_sub(value % 2).max(2)
}

fn crop_to_even(frame: BgraFrame) -> BgraFrame {
    let width = even(frame.width);
    let height = even(frame.height);
    if width == frame.width && height == frame.height {
        return frame;
    }
    let source_stride = frame.width as usize * 4;
    let target_stride = width as usize * 4;
    let mut bytes = Vec::with_capacity(target_stride * height as usize);
    for row in frame
        .bytes
        .chunks_exact(source_stride)
        .take(height as usize)
    {
        bytes.extend_from_slice(&row[..target_stride]);
    }
    BgraFrame {
        width,
        height,
        bytes,
    }
}

pub fn record_region(rect: CaptureRect, stop: Receiver<()>) -> DesktopResult<Vec<u8>> {
    record_frames(stop, || {
        let frame = capture_bgra(rect, VIDEO_MAX_WIDTH, VIDEO_MAX_HEIGHT)?;
        Ok(crop_to_even(frame))
    })
}

fn record_frames(
    stop: Receiver<()>,
    mut next_frame: impl FnMut() -> DesktopResult<BgraFrame>,
) -> DesktopResult<Vec<u8>> {
    let _media_foundation = MediaFoundationGuard::initialize()?;
    let initial = next_frame()?;
    let width = initial.width;
    let height = initial.height;
    let frame_bytes = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| recording_error("A resolução da gravação não é suportada."))?;
    let frame_duration = HUNDRED_NANOSECONDS_PER_SECOND / VIDEO_FRAME_RATE as i64;

    let temp_directory = tempfile::tempdir()
        .map_err(|_| recording_error("Não foi possível preparar o arquivo temporário."))?;
    let output_path = temp_directory.path().join("qaflow-recording.mp4");
    let output_url = HSTRING::from(output_path.to_string_lossy().as_ref());

    // SAFETY: all Media Foundation interfaces remain on this COM-initialized worker thread.
    unsafe {
        let output_type = MFCreateMediaType()
            .map_err(|_| recording_error("Não foi possível configurar o vídeo MP4."))?;
        output_type
            .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
            .map_err(|_| recording_error("Não foi possível configurar o vídeo MP4."))?;
        output_type
            .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)
            .map_err(|_| recording_error("O codificador H.264 não está disponível."))?;
        output_type
            .SetUINT32(&MF_MT_AVG_BITRATE, VIDEO_BIT_RATE)
            .map_err(|_| recording_error("Não foi possível limitar o tamanho do vídeo."))?;
        output_type
            .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
            .map_err(|_| recording_error("Não foi possível configurar o vídeo progressivo."))?;
        set_media_type_size(&output_type, &MF_MT_FRAME_SIZE, width, height)
            .map_err(|_| recording_error("A resolução do vídeo não é suportada."))?;
        set_media_type_size(&output_type, &MF_MT_FRAME_RATE, VIDEO_FRAME_RATE, 1)
            .map_err(|_| recording_error("A taxa de quadros não é suportada."))?;
        set_media_type_size(&output_type, &MF_MT_PIXEL_ASPECT_RATIO, 1, 1)
            .map_err(|_| recording_error("A proporção do vídeo não é suportada."))?;

        let writer = MFCreateSinkWriterFromURL(&output_url, None, None)
            .map_err(|_| recording_error("Não foi possível criar o arquivo de vídeo."))?;
        let stream_index = writer
            .AddStream(&output_type)
            .map_err(|_| recording_error("O codificador H.264 não pôde ser iniciado."))?;

        let input_type = MFCreateMediaType()
            .map_err(|_| recording_error("Não foi possível preparar os quadros da tela."))?;
        input_type
            .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
            .map_err(|_| recording_error("Não foi possível preparar os quadros da tela."))?;
        input_type
            .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32)
            .map_err(|_| recording_error("O formato da tela não é suportado."))?;
        input_type
            .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
            .map_err(|_| recording_error("Não foi possível preparar os quadros da tela."))?;
        input_type
            .SetUINT32(&MF_MT_FIXED_SIZE_SAMPLES, 1)
            .map_err(|_| recording_error("Não foi possível preparar os quadros da tela."))?;
        input_type
            .SetUINT32(&MF_MT_SAMPLE_SIZE, frame_bytes)
            .map_err(|_| recording_error("Não foi possível preparar os quadros da tela."))?;
        input_type
            .SetUINT32(&MF_MT_DEFAULT_STRIDE, (width as i32 * -4) as u32)
            .map_err(|_| recording_error("Não foi possível orientar os quadros da tela."))?;
        set_media_type_size(&input_type, &MF_MT_FRAME_SIZE, width, height)
            .map_err(|_| recording_error("A resolução da tela não é suportada."))?;
        set_media_type_size(&input_type, &MF_MT_FRAME_RATE, VIDEO_FRAME_RATE, 1)
            .map_err(|_| recording_error("A taxa de quadros não é suportada."))?;
        set_media_type_size(&input_type, &MF_MT_PIXEL_ASPECT_RATIO, 1, 1)
            .map_err(|_| recording_error("A proporção da tela não é suportada."))?;

        writer
            .SetInputMediaType(stream_index, &input_type, None)
            .map_err(|_| recording_error("O Windows não conseguiu converter a tela em H.264."))?;
        writer
            .BeginWriting()
            .map_err(|_| recording_error("A gravação não pôde ser iniciada."))?;

        let started_at = Instant::now();
        let frame_interval = Duration::from_secs_f64(1.0 / VIDEO_FRAME_RATE as f64);
        let mut frame_index: i64 = 0;
        let mut first_frame = Some(initial);

        loop {
            if frame_index > 0
                && (stop.try_recv().is_ok() || started_at.elapsed() >= VIDEO_MAX_DURATION)
            {
                break;
            }

            let frame = match first_frame.take() {
                Some(frame) => frame,
                None => next_frame()?,
            };
            let buffer = MFCreateMemoryBuffer(frame_bytes)
                .map_err(|_| recording_error("A memória da gravação ficou indisponível."))?;
            let mut destination = std::ptr::null_mut();
            buffer
                .Lock(&mut destination, None, None)
                .map_err(|_| recording_error("Não foi possível copiar um quadro da tela."))?;
            std::ptr::copy_nonoverlapping(frame.bytes.as_ptr(), destination, frame_bytes as usize);
            buffer
                .Unlock()
                .map_err(|_| recording_error("Não foi possível concluir um quadro da tela."))?;
            buffer
                .SetCurrentLength(frame_bytes)
                .map_err(|_| recording_error("Não foi possível concluir um quadro da tela."))?;

            let sample = MFCreateSample()
                .map_err(|_| recording_error("Não foi possível criar um quadro do vídeo."))?;
            sample
                .AddBuffer(&buffer)
                .map_err(|_| recording_error("Não foi possível anexar um quadro ao vídeo."))?;
            sample
                .SetSampleTime(frame_index * frame_duration)
                .map_err(|_| recording_error("Não foi possível temporizar o vídeo."))?;
            sample
                .SetSampleDuration(frame_duration)
                .map_err(|_| recording_error("Não foi possível temporizar o vídeo."))?;
            writer
                .WriteSample(stream_index, &sample)
                .map_err(|_| recording_error("A gravação foi interrompida pelo codificador."))?;

            frame_index += 1;
            let deadline = started_at + frame_interval.mul_f64(frame_index as f64);
            let now = Instant::now();
            if deadline > now {
                std::thread::sleep(deadline - now);
            }
        }

        writer
            .Finalize()
            .map_err(|_| recording_error("Não foi possível finalizar o vídeo MP4."))?;
    }

    let bytes = fs::read(&output_path)
        .map_err(|_| recording_error("Não foi possível ler o vídeo finalizado."))?;
    if bytes.is_empty() {
        return Err(recording_error("O vídeo finalizado ficou vazio."));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encoder_dimensions_are_even() {
        assert_eq!(even(1280), 1280);
        assert_eq!(even(719), 718);
        assert_eq!(even(1), 2);
    }

    #[test]
    fn odd_width_frames_are_cropped_row_by_row() {
        let frame = BgraFrame {
            width: 3,
            height: 3,
            bytes: (0..36).collect(),
        };
        let cropped = crop_to_even(frame);
        assert_eq!((cropped.width, cropped.height), (2, 2));
        assert_eq!(
            cropped.bytes,
            [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15, 16, 17, 18, 19]
        );
    }

    #[test]
    #[ignore = "smoke test manual: usa o codificador H.264 real do Windows"]
    fn native_mp4_encoder_smoke_stays_inside_the_evidence_limit() {
        let (stop, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(1));
            let _ = stop.send(());
        });
        let bytes = record_frames(receiver, || {
            Ok(BgraFrame {
                width: 640,
                height: 360,
                bytes: vec![24; 640 * 360 * 4],
            })
        })
        .expect("native MP4 recording");
        assert!(bytes.len() >= 12 && &bytes[4..8] == b"ftyp");
        assert!(bytes.len() < 10 * 1024 * 1024);
    }
}
