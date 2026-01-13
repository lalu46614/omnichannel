export const playAudioBlob = async (blob: Blob): Promise<void> => {
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  try {
    await audio.play();
  } finally {
    audio.onended = () => {
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
    };
  }
};


