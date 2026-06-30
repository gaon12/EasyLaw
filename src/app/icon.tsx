import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        background: "#0b77f0",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          background: "#fff7e7",
          color: "#0b385b",
          fontSize: 28,
          fontWeight: 900,
        }}
      >
        E
      </div>
    </div>,
    size,
  );
}
