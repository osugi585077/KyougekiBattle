import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const LOGO_SRC = '/original-aoyama.png';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
  name: string;
};

type Point = {
  x: number;
  y: number;
};

type EditorState = {
  logo: {
    x: number;
    y: number;
    widthRatio: number;
  };
  letterbox: {
    enabled: boolean;
    heightRatio: number;
  };
  text: {
    enabled: boolean;
    value: string;
    x: number;
    y: number;
    sizeRatio: number;
    color: string;
    shadow: boolean;
  };
  look: {
    dark: boolean;
    contrast: boolean;
    blue: boolean;
    vignette: boolean;
  };
  safeArea: boolean;
};

type DragTarget = 'logo' | 'text' | null;

const initialState: EditorState = {
  logo: {
    x: 0.5,
    y: 0.78,
    widthRatio: 0.26,
  },
  letterbox: {
    enabled: false,
    heightRatio: 0.09,
  },
  text: {
    enabled: false,
    value: 'COMING SOON',
    x: 0.5,
    y: 0.18,
    sizeRatio: 0.058,
    color: '#ffffff',
    shadow: true,
  },
  look: {
    dark: false,
    contrast: false,
    blue: false,
    vignette: false,
  },
  safeArea: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function fitCanvasSize(width: number, height: number) {
  const maxWidth = Math.min(980, Math.max(320, window.innerWidth - 32));
  const maxHeight = Math.min(680, Math.max(300, window.innerHeight - 250));
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function getLogoBox(state: EditorState, logo: HTMLImageElement, width: number, height: number) {
  const aspect = logo.naturalHeight / logo.naturalWidth;
  const boxWidth = Math.min(width * state.logo.widthRatio, height / aspect);
  const boxHeight = boxWidth * aspect;
  const x = clamp(state.logo.x * width, boxWidth / 2, width - boxWidth / 2);
  const y = clamp(state.logo.y * height, boxHeight / 2, height - boxHeight / 2);

  return {
    x: x - boxWidth / 2,
    y: y - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
    centerX: x,
    centerY: y,
  };
}

function drawBlueTint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 26, 70, 0.24)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.72, 'rgba(0, 0, 0, 0.2)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
  ctx.save();
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines = value.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const totalHeight = Math.max(0, lines.length - 1) * lineHeight;

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y - totalHeight / 2 + index * lineHeight, maxWidth);
  });
}

function drawScene(
  canvas: HTMLCanvasElement,
  image: LoadedImage,
  logo: HTMLImageElement | null,
  state: EditorState,
  includeGuides: boolean,
  outputWidth: number,
  outputHeight: number,
) {
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, outputWidth, outputHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const imageFilters = [
    state.look.dark ? 'brightness(0.78)' : '',
    state.look.contrast ? 'contrast(1.24)' : '',
  ].filter(Boolean);
  ctx.filter = imageFilters.join(' ') || 'none';
  ctx.drawImage(image.element, 0, 0, outputWidth, outputHeight);
  ctx.filter = 'none';

  if (state.look.blue) {
    drawBlueTint(ctx, outputWidth, outputHeight);
  }

  if (state.look.vignette) {
    drawVignette(ctx, outputWidth, outputHeight);
  }

  if (state.letterbox.enabled) {
    const bandHeight = outputHeight * state.letterbox.heightRatio;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, outputWidth, bandHeight);
    ctx.fillRect(0, outputHeight - bandHeight, outputWidth, bandHeight);
  }

  if (state.text.enabled && state.text.value.trim()) {
    ctx.save();
    const fontSize = Math.max(12, outputHeight * state.text.sizeRatio);
    ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (state.text.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
      ctx.shadowBlur = fontSize * 0.16;
      ctx.shadowOffsetY = fontSize * 0.08;
    }
    ctx.fillStyle = state.text.color;
    drawTextBlock(
      ctx,
      state.text.value,
      clamp(state.text.x, 0.04, 0.96) * outputWidth,
      clamp(state.text.y, 0.04, 0.96) * outputHeight,
      outputWidth * 0.92,
      fontSize * 1.16,
    );
    ctx.restore();
  }

  if (logo) {
    const box = getLogoBox(state, logo, outputWidth, outputHeight);
    ctx.drawImage(logo, box.x, box.y, box.width, box.height);
  }

  if (includeGuides && state.safeArea) {
    const marginX = outputWidth * 0.08;
    const marginY = outputHeight * 0.08;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.setLineDash([outputWidth * 0.012, outputWidth * 0.01]);
    ctx.lineWidth = Math.max(1, outputWidth * 0.002);
    ctx.strokeRect(marginX, marginY, outputWidth - marginX * 2, outputHeight - marginY * 2);
    ctx.restore();
  }
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center justify-between text-sm font-medium text-slate-700">
        <span>{label}</span>
        <span className="tabular-nums text-slate-500">{Math.round(value * 100)}%</span>
      </span>
      <input
        className="h-8 w-full"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input
        className="h-5 w-5 accent-teal-700"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ target: DragTarget; offset: Point } | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [state, setState] = useState<EditorState>(initialState);
  const [canvasSize, setCanvasSize] = useState({ width: 720, height: 405 });
  const [message, setMessage] = useState('JPG / PNG / WebPを1枚アップロードしてください。');

  useEffect(() => {
    let alive = true;
    loadImage(LOGO_SRC)
      .then((loadedLogo) => {
        if (alive) {
          setLogo(loadedLogo);
          setLogoError(false);
        }
      })
      .catch(() => {
        if (alive) {
          setLogoError(true);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) {
      return;
    }
    drawScene(canvas, image, logo, state, true, canvasSize.width, canvasSize.height);
  }, [canvasSize.height, canvasSize.width, image, logo, state]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (!image) {
      return;
    }
    const handleResize = () => {
      setCanvasSize(fitCanvasSize(image.width, image.height));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [image]);

  const updateState = (updater: (current: EditorState) => EditorState) => {
    setState((current) => updater(current));
  };

  const readUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('JPG / PNG / WebPのみアップロードできます。');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage('ファイルサイズは10MB以下にしてください。');
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    loadImage(objectUrl)
      .then((loadedImage) => {
        setImage({
          element: loadedImage,
          width: loadedImage.naturalWidth,
          height: loadedImage.naturalHeight,
          name: file.name,
        });
        setCanvasSize(fitCanvasSize(loadedImage.naturalWidth, loadedImage.naturalHeight));
        setState(initialState);
        setMessage(`${file.name} (${loadedImage.naturalWidth} x ${loadedImage.naturalHeight})`);
      })
      .catch(() => {
        setMessage('画像を読み込めませんでした。別のファイルを試してください。');
      });
  };

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasSize.width,
      y: ((event.clientY - rect.top) / rect.height) * canvasSize.height,
    };
  };

  const textPoint = useMemo(
    () => ({
      x: state.text.x * canvasSize.width,
      y: state.text.y * canvasSize.height,
      radius: Math.max(30, canvasSize.height * state.text.sizeRatio),
    }),
    [canvasSize.height, canvasSize.width, state.text.sizeRatio, state.text.x, state.text.y],
  );

  const beginDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image) {
      return;
    }
    const point = canvasPoint(event);

    if (logo) {
      const box = getLogoBox(state, logo, canvasSize.width, canvasSize.height);
      const inLogo =
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height;

      if (inLogo) {
        dragRef.current = {
          target: 'logo',
          offset: { x: point.x - box.centerX, y: point.y - box.centerY },
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (state.text.enabled) {
      const distance = Math.hypot(point.x - textPoint.x, point.y - textPoint.y);
      if (distance <= textPoint.radius * 1.6) {
        dragRef.current = {
          target: 'text',
          offset: { x: point.x - textPoint.x, y: point.y - textPoint.y },
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
  };

  const drag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) {
      return;
    }
    const point = canvasPoint(event);
    const target = dragRef.current.target;
    const nextX = point.x - dragRef.current.offset.x;
    const nextY = point.y - dragRef.current.offset.y;

    if (target === 'logo' && logo) {
      const box = getLogoBox(state, logo, canvasSize.width, canvasSize.height);
      updateState((current) => ({
        ...current,
        logo: {
          ...current.logo,
          x: clamp(nextX, box.width / 2, canvasSize.width - box.width / 2) / canvasSize.width,
          y: clamp(nextY, box.height / 2, canvasSize.height - box.height / 2) / canvasSize.height,
        },
      }));
    }

    if (target === 'text') {
      updateState((current) => ({
        ...current,
        text: {
          ...current.text,
          x: clamp(nextX / canvasSize.width, 0.04, 0.96),
          y: clamp(nextY / canvasSize.height, 0.04, 0.96),
        },
      }));
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const savePng = () => {
    if (!image) {
      setMessage('先に画像をアップロードしてください。');
      return;
    }

    const exportCanvas = document.createElement('canvas');
    drawScene(exportCanvas, image, logo, state, false, image.width, image.height);

    const link = document.createElement('a');
    const baseName = image.name.replace(/\.[^.]+$/, '') || 'edited-image';
    link.download = `${baseName}-aoyama.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-4 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal text-slate-950 sm:text-2xl">
                Aoyama Overlay Editor
              </h1>
              <p className="mt-1 text-sm text-slate-600">{message}</p>
            </div>
            <div className="flex gap-2">
              <button
                className="min-h-11 rounded-md bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                画像を選択
              </button>
              <button
                className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                type="button"
                disabled={!image}
                onClick={savePng}
              >
                PNG保存
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={readUpload}
            />
          </div>

          <div className="checkerboard grid min-h-[340px] place-items-center overflow-hidden rounded-md border border-slate-200 bg-white p-2 shadow-soft sm:min-h-[520px]">
            {image ? (
              <canvas
                ref={canvasRef}
                className="max-h-full max-w-full touch-none rounded-sm shadow-lg"
                style={{ width: canvasSize.width, height: canvasSize.height }}
                onPointerDown={beginDrag}
                onPointerMove={drag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            ) : (
              <button
                className="grid min-h-52 w-full max-w-xl place-items-center rounded-md border-2 border-dashed border-slate-300 bg-white/80 px-4 text-center text-slate-600"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <span>
                  画像をアップロード
                  <span className="mt-2 block text-sm text-slate-500">10MBまでのJPG / PNG / WebP</span>
                </span>
              </button>
            )}
          </div>
        </section>

        <aside className="grid content-start gap-3">
          {logoError ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-semibold">ロゴ素材が見つかりません。</span>
              <span className="mt-1 block">public/original-aoyama.pngを配置してください。</span>
            </div>
          ) : null}

          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">ロゴ</h2>
              <button
                className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"
                type="button"
                onClick={() => setState(initialState)}
              >
                リセット
              </button>
            </div>
            <Slider
              label="サイズ"
              value={state.logo.widthRatio}
              min={0.08}
              max={0.8}
              step={0.005}
              onChange={(widthRatio) =>
                updateState((current) => ({
                  ...current,
                  logo: { ...current.logo, widthRatio },
                }))
              }
            />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              ロゴまたはテキストをキャンバス上でドラッグできます。
            </p>
          </div>

          <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">効果</h2>
            <Toggle
              label="上下黒帯"
              checked={state.letterbox.enabled}
              onChange={(enabled) =>
                updateState((current) => ({
                  ...current,
                  letterbox: { ...current.letterbox, enabled },
                }))
              }
            />
            <Slider
              label="黒帯の高さ"
              value={state.letterbox.heightRatio}
              min={0.02}
              max={0.24}
              step={0.005}
              onChange={(heightRatio) =>
                updateState((current) => ({
                  ...current,
                  letterbox: { ...current.letterbox, heightRatio },
                }))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                label="暗め"
                checked={state.look.dark}
                onChange={(dark) =>
                  updateState((current) => ({
                    ...current,
                    look: { ...current.look, dark },
                  }))
                }
              />
              <Toggle
                label="高コントラスト"
                checked={state.look.contrast}
                onChange={(contrast) =>
                  updateState((current) => ({
                    ...current,
                    look: { ...current.look, contrast },
                  }))
                }
              />
              <Toggle
                label="青み"
                checked={state.look.blue}
                onChange={(blue) =>
                  updateState((current) => ({
                    ...current,
                    look: { ...current.look, blue },
                  }))
                }
              />
              <Toggle
                label="ビネット"
                checked={state.look.vignette}
                onChange={(vignette) =>
                  updateState((current) => ({
                    ...current,
                    look: { ...current.look, vignette },
                  }))
                }
              />
            </div>
            <Toggle
              label="セーフエリアガイド"
              checked={state.safeArea}
              onChange={(safeArea) => updateState((current) => ({ ...current, safeArea }))}
            />
          </div>

          <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">テキスト</h2>
              <input
                className="h-5 w-5 accent-teal-700"
                type="checkbox"
                checked={state.text.enabled}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    text: { ...current.text, enabled: event.target.checked },
                  }))
                }
                aria-label="テキスト追加"
              />
            </div>
            <textarea
              className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              value={state.text.value}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  text: { ...current.text, value: event.target.value },
                }))
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Slider
                label="横位置"
                value={state.text.x}
                min={0.04}
                max={0.96}
                step={0.005}
                onChange={(x) =>
                  updateState((current) => ({
                    ...current,
                    text: { ...current.text, x },
                  }))
                }
              />
              <Slider
                label="縦位置"
                value={state.text.y}
                min={0.04}
                max={0.96}
                step={0.005}
                onChange={(y) =>
                  updateState((current) => ({
                    ...current,
                    text: { ...current.text, y },
                  }))
                }
              />
            </div>
            <Slider
              label="文字サイズ"
              value={state.text.sizeRatio}
              min={0.025}
              max={0.18}
              step={0.002}
              onChange={(sizeRatio) =>
                updateState((current) => ({
                  ...current,
                  text: { ...current.text, sizeRatio },
                }))
              }
            />
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              色
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white p-1"
                type="color"
                value={state.text.color}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    text: { ...current.text, color: event.target.value },
                  }))
                }
              />
            </label>
            <Toggle
              label="影"
              checked={state.text.shadow}
              onChange={(shadow) =>
                updateState((current) => ({
                  ...current,
                  text: { ...current.text, shadow },
                }))
              }
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
