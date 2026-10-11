// Khung chờ hiện ngay khi bấm sang màn khác, trong lúc server đọc dữ liệu: menu giữ nguyên, phần nội dung
// hiện khối mờ thay cho màn trắng.
export default function Loading() {
  return (
    <div className="c-skel-page" role="status" aria-label="Đang tải">
      <div className="c-skel is-title" />
      <div className="c-skel-row">
        <div className="c-skel is-tile" />
        <div className="c-skel is-tile" />
        <div className="c-skel is-tile" />
      </div>
      <div className="c-card c-skel-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="c-skel is-line" />
        ))}
      </div>
    </div>
  );
}
