declare const qz: any;

let _connected = false;
let _connecting: Promise<boolean> | null = null;

function getQz(): any {
  return (window as any).qz;
}

export async function qzConnect(): Promise<boolean> {
  const q = getQz();
  if (!q) throw new Error('QZ Tray no está cargado. Asegúrate de que qz-tray.js esté en /public.');

  if (_connected && q.websocket.isActive()) return true;
  _connected = false;

  if (_connecting) return _connecting;

  _connecting = (async () => {
    q.security.setCertificatePromise((resolve: any, reject: any) => {
      fetch('/api/qz/cert')
        .then((r) => r.text())
        .then(resolve)
        .catch(reject);
    });

    q.security.setSignaturePromise(async (toSign: string) => {
      const res = await fetch('/api/qz/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: toSign }),
      });
      const json = await res.json();
      return json.signature;
    });

    await q.websocket.connect({
      host: ['localhost'],
      port: { secure: [8183, 8181], insecure: [8182, 8080] },
      usingSecure: location.protocol === 'https:',
      keepAlive: 60,
      retries: 1,
    });

    q.security.setSignatureAlgorithm('SHA512');
    _connected = true;
    _connecting = null;
    return true;
  })();

  _connecting.catch(() => { _connecting = null; _connected = false; });
  return _connecting;
}

export function qzIsConnected(): boolean {
  const q = getQz();
  return !!(q && _connected && q.websocket.isActive());
}

export async function qzGetPrinters(): Promise<string[]> {
  await qzConnect();
  return (await getQz().printers.find()) as string[];
}

export async function qzPrintHtml(printerName: string, html: string, options?: { size?: string }): Promise<void> {
  await qzConnect();
  const q = getQz();
  const cfg = q.configs.create(printerName, {
    margins: 0,
    colorType: 'blackwhite',
    scaleContent: true,
  });
  await q.print(cfg, [{ type: 'html', format: 'plain', data: html }]);
}

export async function qzPrintRaw(printerName: string, commands: string[]): Promise<void> {
  await qzConnect();
  const q = getQz();
  const cfg = q.configs.create(printerName);
  await q.print(cfg, commands.map((d) => ({ type: 'raw', format: 'plain', data: d })));
}
