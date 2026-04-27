// Voice recorder hook — MediaRecorder API with iOS Safari fallback
import { useState, useRef, useCallback } from 'react';

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const getMimeType = () => {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    return 'audio/webm';
  };

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      recorder.start(1000);
      mediaRef.current = recorder;
      setRecording(true);
      setDuration(0);
      setAudioUrl(null);
      setAudioBlob(null);
      timerRef.current = setInterval(() => {
        setDuration(d => {
          if (d >= 59) { recorder.stop(); return 60; }
          return d + 1;
        });
      }, 1000);
    } catch (e: any) {
      setError(e?.message || 'Microphone access denied');
    }
  }, []);

  const stop = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const clear = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setDuration(0);
  }, [audioUrl]);

  const ext = () => {
    const mime = mediaRef.current?.mimeType || 'audio/webm';
    return mime.includes('mp4') ? 'mp4' : 'webm';
  };

  return { recording, audioUrl, audioBlob, duration, error, start, stop, clear, ext };
}
