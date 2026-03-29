/**
 * Renders the SAM segmentation mask as an RGBA PNG overlay
 * positioned absolutely on top of the preview image.
 * The parent container must have position: relative.
 */
export default function SegmentationOverlay({ maskBase64 }) {
  if (!maskBase64) return null;

  return (
    <img
      src={`data:image/png;base64,${maskBase64}`}
      alt="Disease segmentation overlay"
      className="seg-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        mixBlendMode: "multiply",
        borderRadius: "inherit",
      }}
    />
  );
}
