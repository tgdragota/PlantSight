import { useCallback, useState } from "react";

export default function ImageUpload({ onImage }) {
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      onImage(file, url);
    },
    [onImage]
  );

  return (
    <div
      className={`upload-zone ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        processFile(e.dataTransfer.files[0]);
      }}
    >
      <p className="upload-icon">📷</p>
      <p className="upload-text">Drop a plant photo here</p>
      <p className="upload-or">— or —</p>
      <label className="upload-btn">
        Browse file
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => processFile(e.target.files[0])}
        />
      </label>
      <p className="upload-hint">JPEG · PNG · WebP · max 5 MB</p>
    </div>
  );
}
