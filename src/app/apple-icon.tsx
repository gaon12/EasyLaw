import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 36,
        background: "linear-gradient(135deg, #0b77f0, #5cc7c8)",
      }}
    >
      <div
        style={{
          width: 126,
          height: 126,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "6px solid #0b385b",
          borderRadius: "50%",
          background: "#fff7e7",
          color: "#0b385b",
          fontSize: 74,
          fontWeight: 900,
        }}
      >
        E
      </div>
    </div>,
    size,
  );
}
