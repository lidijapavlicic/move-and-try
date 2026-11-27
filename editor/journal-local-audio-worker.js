/* Local multilingual Whisper transcription. Audio never leaves this worker/browser.
   Model/library assets are downloaded from Hugging Face / jsDelivr on first use. */
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';

let transcriberPromise = null;

self.onmessage = async (event) => {
  const { audio, language } = event.data || {};
  if (!(audio instanceof Float32Array) || !audio.length) {
    self.postMessage({ type: 'error', message: 'Neispravna snimka.' });
    return;
  }
  try {
    if (!transcriberPromise) {
      self.postMessage({ type: 'status', message: 'Prvi put preuzimam model za prepoznavanje govora…' });
      transcriberPromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        device: 'wasm',
        progress_callback(progress) {
          if (progress?.status === 'progress' && Number.isFinite(progress.progress)) {
            self.postMessage({ type: 'progress', percent: Math.min(100, Math.round(progress.progress)) });
          }
        }
      });
    }
    const transcriber = await transcriberPromise;
    self.postMessage({ type: 'status', message: 'Pretvaram snimku u tekst na tvojem uređaju…' });
    const output = await transcriber(audio, {
      language: language === 'en' ? 'english' : 'croatian',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5
    });
    const transcript = String(output?.text || '').trim();
    if (!transcript) {
      self.postMessage({ type: 'error', message: 'Nisam uspjela prepoznati govor u snimci.' });
      return;
    }
    self.postMessage({ type: 'result', text: transcript });
  } catch (error) {
    // Don't log audio or raw model response.
    transcriberPromise = null;
    self.postMessage({
      type: 'error',
      message: 'Lokalna transkripcija nije uspjela. Pokušaj na računalu ili s kraćom snimkom.'
    });
  }
};
