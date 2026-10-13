import subprocess
import os
import shutil
import logging
import threading
from django.conf import settings
from homecareOS.event_broadcaster import broadcast_event

logger = logging.getLogger(__name__)


def get_ffmpeg_binary():
    cmd = shutil.which('ffmpeg')
    if not cmd:
        try:
            import imageio_ffmpeg
            cmd = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            cmd = 'ffmpeg'
    return cmd


def transcode_lecture_hls(lecture_id):
    """
    Background job that runs ffmpeg on an uploaded mp4 and creates HLS renditions:
      360p, 720p, 1080p + master.m3u8 + thumbnail.jpg
    Sets Lecture.status = 'ready' on completion or 'failed' on error.
    Broadcasts real-time 'lecture.ready' or 'lecture.failed' to role_admin.
    """
    from lms.models import Lecture
    lecture = Lecture.objects.filter(pk=lecture_id).first()
    if not lecture or not lecture.video_file:
        logger.warning(f"[Transcode] Lecture {lecture_id} has no video file.")
        return

    lecture.status = 'processing'
    lecture.processing_error = ''
    lecture.save(update_fields=['status', 'processing_error'])

    input_path = lecture.video_file.path
    if not os.path.exists(input_path):
        lecture.status = 'failed'
        lecture.processing_error = f"Video file not found at {input_path}"
        lecture.save(update_fields=['status', 'processing_error'])
        return

    output_dir = os.path.join(settings.MEDIA_ROOT, 'lms', 'hls', f'lecture_{lecture.id}')
    os.makedirs(output_dir, exist_ok=True)

    ffmpeg_bin = get_ffmpeg_binary()

    try:
        # 1. Video Thumbnail
        thumb_path = os.path.join(output_dir, 'thumbnail.jpg')
        subprocess.run([
            ffmpeg_bin, '-y', '-ss', '00:00:01', '-i', input_path,
            '-vframes', '1', '-q:v', '2', thumb_path
        ], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 2. HLS Renditions: 360p, 720p, 1080p
        # 360p
        r360_dir = os.path.join(output_dir, '360p')
        os.makedirs(r360_dir, exist_ok=True)
        subprocess.run([
            ffmpeg_bin, '-y', '-i', input_path,
            '-vf', 'scale=w=640:h=360:force_original_aspect_ratio=decrease',
            '-c:a', 'aac', '-ar', '48000', '-c:v', 'h264', '-profile:v', 'main', '-crf', '24',
            '-sc_threshold', '0', '-g', '48', '-keyint_min', '48',
            '-hls_time', '4', '-hls_playlist_type', 'vod',
            '-b:v', '800k', '-maxrate', '856k', '-bufsize', '1200k',
            '-b:a', '96k', '-hls_segment_filename', os.path.join(r360_dir, '%03d.ts'),
            os.path.join(r360_dir, 'index.m3u8')
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 720p
        r720_dir = os.path.join(output_dir, '720p')
        os.makedirs(r720_dir, exist_ok=True)
        subprocess.run([
            ffmpeg_bin, '-y', '-i', input_path,
            '-vf', 'scale=w=1280:h=720:force_original_aspect_ratio=decrease',
            '-c:a', 'aac', '-ar', '48000', '-c:v', 'h264', '-profile:v', 'main', '-crf', '22',
            '-sc_threshold', '0', '-g', '48', '-keyint_min', '48',
            '-hls_time', '4', '-hls_playlist_type', 'vod',
            '-b:v', '2500k', '-maxrate', '2675k', '-bufsize', '3750k',
            '-b:a', '128k', '-hls_segment_filename', os.path.join(r720_dir, '%03d.ts'),
            os.path.join(r720_dir, 'index.m3u8')
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 1080p
        r1080_dir = os.path.join(output_dir, '1080p')
        os.makedirs(r1080_dir, exist_ok=True)
        subprocess.run([
            ffmpeg_bin, '-y', '-i', input_path,
            '-vf', 'scale=w=1920:h=1080:force_original_aspect_ratio=decrease',
            '-c:a', 'aac', '-ar', '48000', '-c:v', 'h264', '-profile:v', 'main', '-crf', '20',
            '-sc_threshold', '0', '-g', '48', '-keyint_min', '48',
            '-hls_time', '4', '-hls_playlist_type', 'vod',
            '-b:v', '5000k', '-maxrate', '5350k', '-bufsize', '7500k',
            '-b:a', '192k', '-hls_segment_filename', os.path.join(r1080_dir, '%03d.ts'),
            os.path.join(r1080_dir, 'index.m3u8')
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 3. Master Playlist
        master_content = (
            "#EXTM3U\n"
            "#EXT-X-VERSION:3\n"
            "#EXT-X-STREAM-INF:BANDWIDTH=896000,RESOLUTION=640x360\n"
            "360p/index.m3u8\n"
            "#EXT-X-STREAM-INF:BANDWIDTH=2628000,RESOLUTION=1280x720\n"
            "720p/index.m3u8\n"
            "#EXT-X-STREAM-INF:BANDWIDTH=5192000,RESOLUTION=1920x1080\n"
            "1080p/index.m3u8\n"
        )
        master_path = os.path.join(output_dir, 'master.m3u8')
        with open(master_path, 'w', encoding='utf-8') as f:
            f.write(master_content)

        relative_url = f"{settings.MEDIA_URL.rstrip('/')}/lms/hls/lecture_{lecture.id}/master.m3u8"
        lecture.hls_master_url = relative_url
        lecture.status = 'ready'
        lecture.processing_error = ''
        lecture.save(update_fields=['hls_master_url', 'status', 'processing_error'])

        logger.info(f"[Transcode] Successfully created HLS for lecture {lecture.id}")

        broadcast_event(
            event_type='lecture.ready',
            data={
                'lecture_id': lecture.id,
                'course_id': lecture.course_id,
                'title': lecture.title,
                'status': 'ready',
                'hls_master_url': lecture.hls_master_url,
            },
            groups=['role_admin']
        )

    except Exception as e:
        logger.error(f"[Transcode] Failed for lecture {lecture.id}: {e}", exc_info=True)
        lecture.status = 'failed'
        lecture.processing_error = str(e)
        lecture.save(update_fields=['status', 'processing_error'])

        broadcast_event(
            event_type='lecture.failed',
            data={'lecture_id': lecture.id, 'error': str(e)},
            groups=['role_admin']
        )


def trigger_transcoding(lecture_id):
    """Launch transcoding job asynchronously in background thread."""
    thread = threading.Thread(target=transcode_lecture_hls, args=[lecture_id], daemon=True)
    thread.start()
    return thread
