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
  const pendingCapture = useRef(null);

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
        const blob = new Blob([e.data], { type: 'image/png' });
        pendingCapture.current.resolve(URL.createObjectURL(blob));
        pendingCapture.current = null;
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useImperativeHandle(ref, () => ({
    capture: () => new Promise((resolve, reject) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) { reject(new Error('Canvas iframe not found. Please refresh.')); return; }

      pendingCapture.current = { resolve, reject };
      // Force request flat image
      win.postMessage("app.activeDocument.saveToOE('png');", '*');

      setTimeout(() => {
        if (pendingCapture.current) {
          pendingCapture.current.reject(new Error('Capture timed out. Make sure you drew something on the canvas.'));
          pendingCapture.current = null;
        }
      }, 8000);
    }),
    // Replaces the canvas contents with a data URL (or any URL Photopea can
    // fetch) — used to load an AI Studio result back onto the working canvas.
    openImage: (dataUrl) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(`app.open("${dataUrl}")`, '*');
    },
  }));

  const handleLoad = async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    await new Promise(r => setTimeout(r, 2200));
    try {
      if (file) {
        const buf = await file.arrayBuffer();
        win.postMessage(buf, '*');
      } else if (svgMarkup) {
        const png = await rasterizeSvgToPng(svgMarkup, 900, 1080);
        if (png) win.postMessage(`app.open("${png}")`, '*');
      }
    } catch (e) {
      console.error("Canvas load error:", e);
    } finally {
      setStatus('ready');
    }
  };

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