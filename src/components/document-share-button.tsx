"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/page.module.css";
import { DownloadIcon, LinkIcon, ShareIcon, XIcon } from "@/components/icons";

type ShareImage = {
  blob: Blob;
  file: File;
  objectUrl: string;
};

export function DocumentShareButton({
  caseNumber,
  dateLabel,
  documentLabel,
  documentNumberLabel,
  issuer,
  title,
}: {
  caseNumber: string;
  dateLabel: string;
  documentLabel: string;
  documentNumberLabel: string;
  issuer: string;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [image, setImage] = useState<ShareImage | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const revokeImage = useCallback((shareImage: ShareImage | null) => {
    if (shareImage) {
      URL.revokeObjectURL(shareImage.objectUrl);
    }
  }, []);

  useEffect(() => () => revokeImage(image), [image, revokeImage]);

  const ensureImage = useCallback(async () => {
    const url = window.location.href;
    setCurrentUrl(url);
    setBusy(true);
    try {
      const nextImage = await createShareImage({
        caseNumber,
        dateLabel,
        documentLabel,
        documentNumberLabel,
        issuer,
        title,
        url,
      });
      setImage((previousImage) => {
        revokeImage(previousImage);
        return nextImage;
      });
      return nextImage;
    } finally {
      setBusy(false);
    }
  }, [
    caseNumber,
    dateLabel,
    documentLabel,
    documentNumberLabel,
    issuer,
    revokeImage,
    title,
  ]);

  async function openShareModal() {
    setOpen(true);
    setStatus(null);
    await ensureImage();
  }

  async function copyUrl() {
    const url = currentUrl || window.location.href;
    await navigator.clipboard.writeText(url);
    setCurrentUrl(url);
    setStatus("URL이 복사되었습니다.");
  }

  async function shareUrl() {
    const url = currentUrl || window.location.href;
    if (navigator.share) {
      await navigator.share({
        text: `${documentLabel} ${caseNumber}`,
        title,
        url,
      });
      return;
    }
    await copyUrl();
  }

  async function shareImage() {
    const shareImage = image ?? (await ensureImage());
    const url = currentUrl || window.location.href;
    if (
      navigator.share &&
      (!navigator.canShare || navigator.canShare({ files: [shareImage.file] }))
    ) {
      await navigator.share({
        files: [shareImage.file],
        text: `${documentLabel} ${caseNumber}`,
        title,
        url,
      });
      return;
    }
    downloadImage(shareImage, caseNumber);
    setStatus("이미지를 내려받았습니다.");
  }

  function closeModal() {
    setOpen(false);
    setStatus(null);
  }

  return (
    <>
      <button
        className={styles.secondaryButton}
        onClick={openShareModal}
        type="button"
      >
        <ShareIcon size={18} />
        공유
      </button>
      {open && (
        <div
          aria-labelledby="document-share-title"
          aria-modal="true"
          className={styles.documentShareBackdrop}
          role="dialog"
        >
          <button
            aria-label="공유 창 바깥 영역 닫기"
            className={styles.documentShareDismiss}
            onClick={closeModal}
            type="button"
          />
          <article className={styles.documentShareModal}>
            <header>
              <div>
                <span className={styles.badge}>공유</span>
                <h2 id="document-share-title">{title}</h2>
              </div>
              <button
                aria-label="공유 창 닫기"
                onClick={closeModal}
                type="button"
              >
                <XIcon size={18} />
              </button>
            </header>
            <div className={styles.documentShareUrl}>
              <span>{currentUrl}</span>
              <button onClick={copyUrl} type="button">
                <LinkIcon size={16} />
                URL 복사
              </button>
            </div>
            <div className={styles.documentSharePreview}>
              {image ? (
                <div
                  aria-label={`${title} 공유 이미지`}
                  className={styles.documentSharePreviewImage}
                  role="img"
                  style={{ backgroundImage: `url(${image.objectUrl})` }}
                />
              ) : (
                <div>{busy ? "이미지 생성 중" : "이미지 준비 중"}</div>
              )}
            </div>
            {status && <output>{status}</output>}
            <div className={styles.documentShareActions}>
              <button onClick={shareUrl} type="button">
                <ShareIcon size={17} />
                URL 공유
              </button>
              <button disabled={busy} onClick={shareImage} type="button">
                <ShareIcon size={17} />
                이미지 공유
              </button>
              <button
                disabled={!image}
                onClick={() => image && downloadImage(image, caseNumber)}
                type="button"
              >
                <DownloadIcon size={17} />
                이미지 저장
              </button>
            </div>
          </article>
        </div>
      )}
    </>
  );
}

async function createShareImage({
  caseNumber,
  dateLabel,
  documentLabel,
  documentNumberLabel,
  issuer,
  title,
  url,
}: {
  caseNumber: string;
  dateLabel: string;
  documentLabel: string;
  documentNumberLabel: string;
  issuer: string;
  title: string;
  url: string;
}): Promise<ShareImage> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available.");
  }

  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#e0f2fe";
  context.fillRect(0, 0, canvas.width, 630);
  context.fillStyle = "#ffffff";
  roundRect(context, 72, 64, 1056, 502, 28);
  context.fill();

  context.fillStyle = "#0f172a";
  context.font =
    "800 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("EasyLaw", 112, 124);

  context.fillStyle = "#2563eb";
  roundRect(context, 112, 152, 128, 42, 21);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font =
    "800 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(documentLabel, 136, 181);

  context.fillStyle = "#0f172a";
  context.font =
    "800 52px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const titleLines = wrapCanvasText(context, title, 930, 3);
  titleLines.forEach((line, index) => {
    context.fillText(line, 112, 262 + index * 64);
  });

  context.fillStyle = "#475569";
  context.font =
    "700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(`${documentNumberLabel} ${caseNumber}`, 112, 472);
  context.fillText(`${issuer} · ${dateLabel}`, 112, 512);

  context.strokeStyle = "#bfdbfe";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(112, 534);
  context.lineTo(1088, 534);
  context.stroke();

  context.fillStyle = "#64748b";
  context.font =
    "600 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const urlLines = wrapCanvasText(context, url, 920, 1);
  context.fillText(urlLines[0] ?? url, 112, 580);

  const blob = await canvasToBlob(canvas);
  const file = new File([blob], `easylaw-${sanitizeFileName(caseNumber)}.png`, {
    type: "image/png",
  });
  return {
    blob,
    file,
    objectUrl: URL.createObjectURL(blob),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create share image."));
      }
    }, "image/png");
  });
}

function downloadImage(image: ShareImage, caseNumber: string) {
  const anchor = document.createElement("a");
  anchor.download = `easylaw-${sanitizeFileName(caseNumber)}.png`;
  anchor.href = image.objectUrl;
  anchor.click();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(text)) {
    const nextLine = `${line}${char}`;
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = char.trimStart();
      if (lines.length === maxLines) {
        break;
      }
    } else {
      line = nextLine;
    }
  }
  if (lines.length < maxLines && line) {
    lines.push(line);
  }
  if (lines.length === maxLines && lines.join("").length < text.length) {
    let lastLine = `${lines[maxLines - 1]}...`;
    while (
      context.measureText(lastLine).width > maxWidth &&
      lastLine.length > 3
    ) {
      lastLine = `${lastLine.slice(0, -4)}...`;
    }
    lines[maxLines - 1] = lastLine;
  }
  return lines;
}
