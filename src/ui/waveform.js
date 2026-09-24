export function drawWaveform(canvas, audioBuffer) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0d1113';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#233034';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  if (!audioBuffer) return;
  const channel = audioBuffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channel.length / width));
  ctx.strokeStyle = '#7be0cb';
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(channel.length, start + samplesPerPixel);
    let min = 1;
    let max = -1;
    const step = Math.max(1, Math.floor((end - start) / 24));
    for (let i = start; i < end; i += step) {
      min = Math.min(min, channel[i]);
      max = Math.max(max, channel[i]);
    }
    const y1 = (1 - max) * 0.5 * height;
    const y2 = (1 - min) * 0.5 * height;
    ctx.moveTo(x + 0.5, y1);
    ctx.lineTo(x + 0.5, y2);
  }
  ctx.stroke();
}
