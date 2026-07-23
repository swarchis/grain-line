import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

function rasterizeSvgToPng(svgMarkup, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      resolve(); // fail silently and just open blank canvas rather than freezing
    };
    img.src = url;
  });
}

const PhotopeaEditor = forwardRef(function PhotopeaEditor({ svgMarkup, file, onStatusChange }, ref) {
  const iframeRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [loadTick, setLoadTick] = useState(0); // bumped on each iframe (re)load
  const pendingCapture = useRef(null);
  // Content already pushed into the CURRENT iframe document. Loading used to
  // happen once inside onLoad, which silently dropped content that arrived
  // after the iframe finished loading (e.g. a saved design image fetched from
  // storage) — leaving Photopea stuck on its start screen.
  const lastLoadedRef = useRef(null);

  useEffect(() => { onStatusChange?.(status); }, [status]);

  // Fallback: forcefully set to ready after 3 seconds just in case onLoad misses
  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus('ready');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleMessage(e) {
      if (e.data instanceof ArrayBuffer && pendingCapture.current) {
        const pending = pendingCapture.current;
        pendingCapture.current = null;
        if (pending.kind === 'psd') {
          // Full layered document — hand back the raw blob for upload.
          pending.resolve(new Blob([e.data], { type: 'image/vnd.adobe.photoshop' }));
        } else {
          const blob = new Blob([e.data], { type: 'image/png' });
          pending.resolve(URL.createObjectURL(blob));
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Each capture carries its own token so a stale capture's timeout can never
  // reject a newer pending capture (autosave chains a PNG + PSD capture
  // back-to-back, which made that race real).
  const requestCapture = (kind, script, timeoutMs, timeoutMessage) => new Promise((resolve, reject) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) { reject(new Error('Canvas iframe not found. Please refresh.')); return; }
    const token = {};
    pendingCapture.current = { resolve, reject, kind, token };
    win.postMessage(script, '*');
    setTimeout(() => {
      if (pendingCapture.current && pendingCapture.current.token === token) {
        pendingCapture.current.reject(new Error(timeoutMessage));
        pendingCapture.current = null;
      }
    }, timeoutMs);
  });

  useImperativeHandle(ref, () => ({
    // Flattened PNG (object URL) — previews, analysis, snapshots.
    capture: () => requestCapture(
      'png',
      "app.activeDocument.saveToOE('png');",
      8000,
      'Capture timed out. Make sure you drew something on the canvas.'
    ),
    // Full layered document (Blob) — the working file. Bigger + slower to
    // serialize than a PNG, so it gets a longer window.
    capturePsd: () => requestCapture(
      'psd',
      "app.activeDocument.saveToOE('psd');",
      20000,
      'PSD capture timed out.'
    ),
    // Replaces the canvas contents with a data URL (or any URL Photopea can
    // fetch) — used to load an AI Studio result back onto the working canvas.
    openImage: (dataUrl) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(`app.open("${dataUrl}")`, '*');
    },
    // Non-destructive counterpart to openImage: Photopea's own scripting API
    // inserts the given image as a new Smart Object layer on top of the
    // current document (rather than replacing it) when the third argument
    // to app.open is true — used for AI Studio "additions" (a generated
    // logo/graphic) so the founder's existing artwork is never overwritten;
    // the new element lands as its own movable, deletable layer.
    addLayer: (dataUrl) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(`app.open("${dataUrl}", "", true);`, '*');
    },
  }));

  const handleLoad = async () => {
    // Give Photopea a beat to boot its runtime, then mark this (fresh) iframe
    // document as empty so the content effect below (re)loads into it.
    await new Promise(r => setTimeout(r, 2200));
    lastLoadedRef.current = null;
    setStatus('ready');
    setLoadTick(t => t + 1);
  };

  // Push the canvas content whenever BOTH are true: Photopea is ready and we
  // have something to show — regardless of which happened first. Runs at most
  // once per iframe document (lastLoadedRef), so a fullscreen toggle or prop
  // identity change can't open duplicate documents over the user's work.
  useEffect(() => {
    if (status !== 'ready') return;
    if (lastLoadedRef.current) return; // this document already has content
    const win = iframeRef.current?.contentWindow;
    const content = file || svgMarkup;
    if (!win || !content) return;
    lastLoadedRef.current = content;
    (async () => {
      try {
        if (file) {
          const buf = await file.arrayBuffer();
          win.postMessage(buf, '*');
        } else {
          const png = await rasterizeSvgToPng(svgMarkup, 900, 1080);
          if (png) win.postMessage(`app.open("${png}")`, '*');
        }
      } catch (e) {
        console.error('Canvas load error:', e);
      }
    })();
  }, [file, svgMarkup, status, loadTick]);

  return (
    <iframe
      ref={iframeRef}
      title="Photopea design canvas"
      src="https://www.photopea.com#"
      onLoad={handleLoad}
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      allow="clipboard-read; clipboard-write"
    />
  );
});

export default PhotopeaEditor;