// 朗讀英文單字（瀏覽器 SpeechSynthesis）。synth 可注入，方便測試。
export function createSpeaker(synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance) {
  const available = Boolean(synth && Utterance);
  return {
    available,
    /** 念出文字；回傳是否有送出。 */
    speak(text, lang = 'en-US') {
      const t = String(text || '').trim();
      if (!available || !t) return false;
      synth.cancel();
      const u = new Utterance(t);
      u.lang = lang;
      u.rate = 0.9;
      synth.speak(u);
      return true;
    },
    stop() {
      if (available) synth.cancel();
    },
  };
}

/** 卡片正面看起來是英文才朗讀（含拉丁字母、不含中日韓字）。 */
export function looksEnglish(text) {
  return /[A-Za-z]/.test(text) && !/[㐀-鿿぀-ヿ]/.test(text);
}
