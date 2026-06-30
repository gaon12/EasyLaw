import { ImageResponse } from "next/og";
import { siteDescription, siteName } from "@/lib/metadata";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(135deg, #f6fbff 0%, #eaf4ff 100%)",
        color: "#0b385b",
        fontFamily: "Arial",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 96,
            height: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 28,
            background: "#0b77f0",
            color: "white",
            fontSize: 56,
            fontWeight: 900,
          }}
        >
          E
        </div>
        <div style={{ fontSize: 48, fontWeight: 900 }}>{siteName}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            maxWidth: 850,
            fontSize: 76,
            fontWeight: 900,
            lineHeight: 1.08,
          }}
        >
          판결문을 이해하기 쉽게
        </div>
        <div
          style={{
            maxWidth: 860,
            marginTop: 28,
            color: "#486a83",
            fontSize: 30,
            lineHeight: 1.35,
          }}
        >
          {siteDescription}
        </div>
      </div>
      <div style={{ color: "#0b77f0", fontSize: 26, fontWeight: 800 }}>
        공개 판결문 검색 · AI 법률 질문 · 비공개 문서
      </div>
    </div>,
    size,
  );
}
