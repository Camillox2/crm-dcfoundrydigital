import { useEffect, useRef, useState } from 'react';
import { Mic, Paperclip, Send, Smile, Square, Trash2, X } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker.js';
import { QuickReplies, type QuickReply } from './QuickReplies.js';

export function Composer({
  text,
  file,
  asSticker,
  closed,
  disconnected,
  busy,
  error,
  lead,
  replies,
  onText,
  onFile,
  onSticker,
  onSend,
  onReopen,
  onConnect,
}: {
  text: string;
  file?: File;
  asSticker: boolean;
  closed: boolean;
  disconnected: boolean;
  busy: boolean;
  error: string;
  lead: { name: string; company: string };
  replies: QuickReply[];
  onText: (value: string) => void;
  onFile: (file?: File) => void;
  onSticker: (value: boolean) => void;
  onSend: () => void;
  onReopen: () => void;
  onConnect: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [emoji, setEmoji] = useState(false);
  const [preview, setPreview] = useState('');
  const [recording, setRecording] = useState(false);
  const [fileError, setFileError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 144)}px`;
  }, [text]);
  useEffect(() => {
    if (!file || (!file.type.startsWith('image/') && !file.type.startsWith('audio/'))) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(
    () => () => {
      const current = recorder.current;
      clearInterval(timer.current);
      if (!current || current.state === 'inactive') return;
      current.onstop = () => current.stream.getTracks().forEach((track) => track.stop());
      current.stop();
    },
    [],
  );
  const insert = (value: string) => {
    const node = field.current;
    const start = node?.selectionStart ?? text.length;
    const end = node?.selectionEnd ?? start;
    const next = text.slice(0, start) + value + text.slice(end);
    onText(next);
    requestAnimationFrame(() => {
      node?.focus();
      const caret = start + value.length;
      node?.setSelectionRange(caret, caret);
    });
  };
  const pickFile = (next?: File) => {
    if (next && next.size > 16 * 1024 * 1024) {
      setFileError('O limite por arquivo é 16 MB.');
      return;
    }
    setFileError('');
    onSticker(false);
    onFile(next);
  };
  const stopRecording = (keep: boolean) => {
    clearInterval(timer.current);
    const current = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!current) return;
    const stream = current.stream;
    current.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (!keep) return;
      const mime = current.mimeType || 'audio/webm';
      const blob = new Blob(chunks.current, { type: mime });
      const base = mime.split(';')[0] || 'audio/webm';
      const extension = base.includes('ogg') ? 'ogg' : base.includes('mp4') ? 'mp4' : 'webm';
      onFile(new File([blob], `audio-${Date.now()}.${extension}`, { type: base }));
    };
    if (current.state !== 'inactive') current.stop();
    else stream.getTracks().forEach((track) => track.stop());
  };
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = [
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ].find((item) => MediaRecorder.isTypeSupported(item));
    const media = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
    chunks.current = [];
    media.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    media.start();
    recorder.current = media;
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
  };
  if (closed)
    return (
      <div className="wa-banner" role="status">
        <p>Conversa encerrada. Ela volta para Abertas se o cliente escrever.</p>
        <button type="button" onClick={onReopen}>
          Reabrir
        </button>
      </div>
    );
  return (
    <form
      className="wa-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSend();
      }}
    >
      {disconnected && (
        <div className="wa-banner is-warn" role="status">
          <p>WhatsApp desconectado. Conecte a sessão para enviar.</p>
          <button type="button" onClick={onConnect}>
            Abrir conexão
          </button>
        </div>
      )}
      <QuickReplies
        items={replies}
        query={text}
        onPick={(content) =>
          onText(content.replaceAll('{nome}', lead.name).replaceAll('{empresa}', lead.company))
        }
      />
      {file && (
        <div className="wa-file-card">
          {file.type.startsWith('image/') && preview ? <img src={preview} alt="" /> : null}
          {file.type.startsWith('audio/') && preview ? <audio controls src={preview} /> : null}
          <span>
            <strong>{file.name}</strong>
            <small>{Math.ceil(file.size / 1024)} KB</small>
          </span>
          {file.type.startsWith('image/') && (
            <label>
              <input
                type="checkbox"
                checked={asSticker}
                onChange={(event) => onSticker(event.target.checked)}
              />
              Enviar como figurinha
            </label>
          )}
          <button type="button" aria-label="Remover anexo" onClick={() => onFile(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
      {recording && (
        <div className="wa-recording" role="status">
          <Mic size={16} /> Gravando {Math.floor(seconds / 60)}:
          {String(seconds % 60).padStart(2, '0')}
          <button type="button" onClick={() => stopRecording(false)}>
            <Trash2 size={16} /> Cancelar
          </button>
          <button type="button" onClick={() => stopRecording(true)}>
            <Square size={16} /> Usar áudio
          </button>
        </div>
      )}
      <div className="wa-composer-row">
        <button
          type="button"
          className="icon-button wa-emoji-toggle"
          aria-label="Inserir emoji"
          aria-expanded={emoji}
          onClick={() => setEmoji((value) => !value)}
        >
          <Smile size={18} />
        </button>
        <label className="wa-attachment">
          <Paperclip size={18} />
          <span className="sr-only">Anexar</span>
          <input
            type="file"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        <textarea
          ref={field}
          rows={1}
          maxLength={10000}
          value={text}
          aria-label="Mensagem"
          placeholder="Escreva para o cliente…"
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!busy) onSend();
            }
          }}
        />
        <button
          type="button"
          className="icon-button wa-mic"
          aria-label="Gravar áudio"
          onClick={() =>
            void startRecording().catch(() => setFileError('Não foi possível acessar o microfone.'))
          }
        >
          <Mic size={18} />
        </button>
        <button
          type="submit"
          className="wa-send"
          disabled={busy || disconnected || (!text.trim() && !file)}
          aria-label="Enviar"
        >
          <Send size={16} />
        </button>
      </div>
      {emoji && <EmojiPicker onPick={insert} onClose={() => setEmoji(false)} />}
      {(fileError || error) && <p role="alert">{fileError || error}</p>}
    </form>
  );
}
