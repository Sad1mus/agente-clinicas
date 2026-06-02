/**
 * Renderiza el HTML del boceto a PNG con Puppeteer (Chromium headless).
 * Import perezoso: si Puppeteer/Chromium no está disponible, el generador
 * sigue produciendo el HTML y avisa.
 */
export async function htmlToPng(html: string): Promise<Buffer> {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 460, height: 900, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const card = await page.$('#card');
    const target = card ?? page;
    const buf = await target.screenshot({ type: 'png' });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
