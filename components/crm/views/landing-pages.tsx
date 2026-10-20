"use client";

import { LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatMoney } from "@/lib/format";
import { shrinkImage } from "@/lib/images/shrink";
import { slugify, type LandingSettings } from "@/lib/landing/contract";

import { PageHead } from "../parts";

// Marketing → Landing page (Owner chốt 20/10/2026): trang bán hàng chạy trên CRM ở /lp/<đường dẫn>. Ghế, giá (bảng giá
// và khuyến mãi đang chạy), quà, liên hệ lấy từ CRM; khách điền form là thành lead nguồn Landing page. Bản thật nhận dữ
// liệu từ server, bản demo truyền dữ liệu mẫu.

type Result = { ok: boolean; message: string };
const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

export interface LandingPageRow {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  settings: LandingSettings;
  /** Đã tải HTML riêng; không thì trang dùng mẫu có sẵn. */
  customHtml: boolean;
  htmlUpdatedAt: string | null;
  leads7: number;
  leadsTotal: number;
  lastLeadAt: string | null;
}

export interface LandingProductEdit {
  variantId: string;
  sku: string;
  name: string;
  listPrice: number;
  price: number;
  promotions: string[];
  show: boolean;
  sort: number | null;
  badge: string;
  shortDesc: string;
  giftText: string;
  imageUrl: string | null;
}

/** Quà trong danh mục Quà tặng (Sản phẩm → Quà tặng): ở đây chỉ tải ảnh hiện trên trang. */
export interface LandingGiftEdit {
  variantId: string;
  sku: string;
  name: string;
  value: number;
  imageUrl: string | null;
}

/** Ảnh tải lên: ảnh ghế, quà (`product`) hoặc ảnh của trang (logo, ảnh lớn đầu trang máy tính, điện thoại). */
type ImageTarget = "product" | "logo" | "banner" | "banner_mobile";

export interface LandingActions {
  savePage: (input: {
    id?: string;
    slug: string;
    title: string;
    status: "draft" | "published";
    settings: LandingSettings;
  }) => Promise<Result>;
  setStatus: (input: { id: string; status: "draft" | "published" }) => Promise<Result>;
  uploadHtml: (form: FormData) => Promise<Result>;
  uploadImage: (form: FormData) => Promise<Result>;
  removeImage: (input: { target: ImageTarget; id: string }) => Promise<Result>;
  saveProduct: (input: {
    variantId: string;
    show: boolean;
    sort: number | null;
    badge: string;
    shortDesc: string;
    giftText: string;
  }) => Promise<Result>;
}

const EMPTY_SETTINGS: LandingSettings = {
  hotline: "",
  zalo: "",
  address: "",
  openHours: "",
  kakao: "",
  mapUrl: "",
  logoUrl: "",
  bannerUrl: "",
  bannerMobileUrl: "",
  countdownEnd: "",
};

/** Cạnh dài tối đa khi trình duyệt thu nhỏ ảnh trước khi gửi, theo chỗ ảnh hiện trên trang. */
const MAX_SIDE: Record<ImageTarget, number> = { product: 1600, logo: 800, banner: 2000, banner_mobile: 1400 };

/** Gửi một ảnh lên (đã thu nhỏ trên trình duyệt) cho ghế, quà hoặc trang. */
function uploadForm(target: ImageTarget, id: string, file: File, actions: LandingActions) {
  return async () => {
    const form = new FormData();
    form.set("id", id);
    form.set("target", target);
    form.set("file", await shrinkImage(file, MAX_SIDE[target]));
    return actions.uploadImage(form);
  };
}

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      let r: Result;
      try {
        r = await fn();
      } catch {
        // Lệnh gửi lên bị máy chủ từ chối (file quá lớn) hoặc mất mạng: báo lỗi, không làm hỏng màn hình.
        r = {
          ok: false,
          message: "Chưa gửi được, file có thể quá lớn hoặc mạng chập chờn. Thử lại sau ít phút.",
        };
      }
      toast(r.message, r.ok ? "ok" : "err");
      after?.(r);
      if (r.ok) router.refresh();
    });
  return { pending, run };
}

export function LandingPagesView({
  pages,
  products,
  gifts,
  origin,
  canManage,
  actions,
}: {
  pages: LandingPageRow[];
  products: LandingProductEdit[];
  /** Quà đang dùng trong danh mục Quà tặng (hiện trên trang). */
  gifts: LandingGiftEdit[];
  /** Địa chỉ CRM, để dựng link đầy đủ gửi khách. */
  origin: string;
  canManage: boolean;
  actions: LandingActions;
}) {
  const [editing, setEditing] = useState<LandingPageRow | "new" | null>(null);
  const shown = products.filter((p) => p.show).length;
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={LayoutTemplate} color="var(--brand)" kicker="Marketing" title="Landing page">
          {canManage ? (
            <button type="button" className="c-btn is-brand" onClick={() => setEditing("new")}>
              Tạo landing page
            </button>
          ) : null}
        </PageHead>
        <p className="c-lbl mx-4 mt-0 mb-3">
          Trang bán hàng chạy ngay trên CRM, gửi link cho khách hoặc gắn vào quảng cáo. Khách điền form là
          thành lead nguồn Landing page, chia cho tư vấn viên đang trực như lead quảng cáo. Ghế, giá (bảng giá
          và khuyến mãi đang chạy), quà, liên hệ lấy từ CRM: đổi giá ở Sản phẩm là trang tự cập nhật sau
          khoảng một phút.
        </p>
      </section>

      {editing ? (
        <PageForm
          key={editing === "new" ? "new" : editing.id}
          page={editing === "new" ? null : editing}
          save={actions.savePage}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <section className="c-card" aria-label="Danh sách landing page">
        <ul className="m-0 list-none p-0">
          {pages.length === 0 ? (
            <li className="c-empty p-4">
              Chưa có landing page nào.{canManage ? " Bấm Tạo landing page để bắt đầu." : ""}
            </li>
          ) : null}
          {pages.map((p) => (
            <PageItem
              key={p.id}
              page={p}
              origin={origin}
              canManage={canManage}
              actions={actions}
              onEdit={() => setEditing(p)}
            />
          ))}
        </ul>
      </section>

      <section className="c-card" aria-label="Ghế hiện trên landing">
        <div className="c-ch">
          <h2>Ghế hiện trên landing</h2>
          <span className="c-lbl">
            {shown}/{products.length} ghế đang hiện
          </span>
        </div>
        <p className="c-lbl mx-4 mt-0 mb-2">
          Giá niêm yết lấy từ bảng giá ở Sản phẩm. Muốn trang hiện giá giảm thì tạo khuyến mãi ở Chính sách
          (kênh Online hoặc mọi kênh): trang, báo giá và lên đơn cùng tính một giá.
        </p>
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Hiện</th>
                <th>Ghế</th>
                <th>Ảnh</th>
                <th className="text-right">Giá trên trang</th>
                <th>Nhãn, mô tả, quà</th>
                <th>Thứ tự</th>
                {canManage ? <th aria-label="Thao tác" /> : null}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow key={p.variantId} p={p} canManage={canManage} actions={actions} />
              ))}
            </tbody>
          </table>
        </div>
        {products.length === 0 ? (
          <p className="c-empty">Chưa có ghế nào có giá trong bảng giá. Thêm giá ở Sản phẩm trước.</p>
        ) : null}
      </section>

      <section className="c-card" aria-label="Quà tặng trên landing">
        <div className="c-ch">
          <h2>Quà tặng trên landing</h2>
          <span className="c-lbl">{gifts.length} quà từ danh mục Quà tặng</span>
        </div>
        <p className="c-lbl mx-4 mt-0 mb-2">
          Các quà này hiện ở mục Quà tặng kèm theo của trang. Tên, trị giá sửa ở Sản phẩm → Quà tặng; ở đây
          tải ảnh cho từng quà (ảnh vuông, nền trắng nhìn rõ nhất).
        </p>
        {gifts.length ? (
          <div className="c-tw">
            <table className="c-table">
              <thead>
                <tr>
                  <th>Quà</th>
                  <th>Ảnh</th>
                  <th className="text-right">Trị giá</th>
                </tr>
              </thead>
              <tbody>
                {gifts.map((g) => (
                  <GiftRow key={g.variantId} g={g} canManage={canManage} actions={actions} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-empty">Chưa có quà nào trong danh mục Quà tặng.</p>
        )}
      </section>
    </div>
  );
}

/** Ảnh nhỏ xem trước, nút tải (trình duyệt thu nhỏ ảnh trước khi gửi) và nút gỡ. */
function ImageSlot({
  url,
  alt,
  label,
  contain = false,
  canManage,
  pending,
  onUpload,
  onRemove,
}: {
  url: string | null;
  alt: string;
  /** Nhãn của ô chọn file, cũng là tên nút gỡ. */
  label: string;
  /** Logo, ảnh có nền trong suốt: hiện trọn ảnh thay vì cắt cho vừa khung. */
  contain?: boolean;
  canManage: boolean;
  pending: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh ở bucket công khai, không qua tối ưu ảnh
        <img
          src={url}
          alt={alt}
          className={`h-10 rounded ${contain ? "w-20 bg-line-2 object-contain" : "w-10 object-cover"}`}
        />
      ) : (
        <span className="c-lbl">Chưa có</span>
      )}
      {canManage ? (
        <>
          <label className="c-btn is-ghost cursor-pointer">
            {url ? "Đổi" : "Tải ảnh"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={label}
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) onUpload(file);
              }}
            />
          </label>
          {url ? (
            <button
              type="button"
              className="c-btn is-ghost"
              aria-label={`Gỡ: ${label}`}
              disabled={pending}
              onClick={onRemove}
            >
              Gỡ
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function GiftRow({
  g,
  canManage,
  actions,
}: {
  g: LandingGiftEdit;
  canManage: boolean;
  actions: LandingActions;
}) {
  const { pending, run } = useRun();
  return (
    <tr aria-label={`Quà ${g.sku}`}>
      <td className="whitespace-normal">
        <b>{g.name}</b> <span className="c-lbl tabular">{g.sku}</span>
      </td>
      <td>
        <ImageSlot
          url={g.imageUrl}
          alt={g.name}
          label={`Ảnh quà ${g.sku}`}
          canManage={canManage}
          pending={pending}
          onUpload={(file) => run(uploadForm("product", g.variantId, file, actions))}
          onRemove={() => run(() => actions.removeImage({ target: "product", id: g.variantId }))}
        />
      </td>
      <td className="text-right tabular">{g.value > 0 ? formatMoney(g.value) : "Chưa nhập"}</td>
    </tr>
  );
}

function PageItem({
  page: p,
  origin,
  canManage,
  actions,
  onEdit,
}: {
  page: LandingPageRow;
  origin: string;
  canManage: boolean;
  actions: LandingActions;
  onEdit: () => void;
}) {
  const toast = useToast();
  const { pending, run } = useRun();
  const url = `${origin}/lp/${p.slug}`;
  const live = p.status === "published";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Đã chép link", "ok");
    } catch {
      toast("Không chép được, bấm giữ vào link để chép tay", "err");
    }
  };
  const uploadHtml = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("id", p.id);
    form.set("file", file);
    run(() => actions.uploadHtml(form));
  };
  const images: { target: ImageTarget; title: string; label: string; url: string }[] = [
    {
      target: "logo",
      title: "Logo (thanh đầu trang)",
      label: `Logo cho ${p.title}`,
      url: p.settings.logoUrl,
    },
    {
      target: "banner",
      title: "Ảnh lớn đầu trang, máy tính",
      label: `Banner máy tính cho ${p.title}`,
      url: p.settings.bannerUrl,
    },
    {
      target: "banner_mobile",
      title: "Ảnh lớn đầu trang, điện thoại",
      label: `Banner điện thoại cho ${p.title}`,
      url: p.settings.bannerMobileUrl,
    },
  ];
  return (
    <li className="border-t border-line-2 px-4 py-3 first:border-t-0" aria-label={`Landing page ${p.title}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b>{p.title}</b>
        <span className={`c-pill ${live ? "is-ok" : "is-n"}`}>{live ? "Đang chạy" : "Đang tắt"}</span>
      </div>
      <a className="c-link mt-1 block break-all" href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      <p className="c-lbl m-0 mt-1">
        Lead 7 ngày: <b className="tabular">{p.leads7}</b> · Tổng: <b className="tabular">{p.leadsTotal}</b>
        {p.lastLeadAt ? ` · Gần nhất: ${formatDateTime(p.lastLeadAt)}` : ""}
      </p>
      <p className="c-lbl m-0">
        {p.customHtml
          ? `Giao diện: HTML tải lên${p.htmlUpdatedAt ? ` lúc ${formatDateTime(p.htmlUpdatedAt)}` : ""}`
          : "Giao diện: mẫu khai trương có sẵn của CRM"}
        {p.settings.hotline ? ` · Hotline ${p.settings.hotline}` : " · Chưa nhập hotline"}
        {p.settings.countdownEnd ? ` · Hạn ưu đãi ${p.settings.countdownEnd.replace("T", " ")}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <a className="c-btn" href={url} target="_blank" rel="noreferrer">
          {live ? "Mở trang" : "Xem trước"}
        </a>
        <button type="button" className="c-btn" onClick={copy}>
          Chép link
        </button>
        {canManage ? (
          <>
            <button
              type="button"
              className={`c-btn ${live ? "" : "is-brand"}`}
              disabled={pending}
              onClick={() => run(() => actions.setStatus({ id: p.id, status: live ? "draft" : "published" }))}
            >
              {live ? "Tắt trang" : "Bật trang"}
            </button>
            <button type="button" className="c-btn" onClick={onEdit}>
              Sửa thông tin
            </button>
            <label className="c-btn cursor-pointer">
              Tải HTML lên
              <input
                type="file"
                accept=".html,.htm,text/html"
                aria-label={`Tải HTML cho ${p.title}`}
                className="sr-only"
                disabled={pending}
                onChange={(e) => uploadHtml(e.currentTarget)}
              />
            </label>
            {p.customHtml ? (
              <button
                type="button"
                className="c-btn is-ghost"
                disabled={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set("id", p.id);
                  form.set("reset", "1");
                  run(() => actions.uploadHtml(form));
                }}
              >
                Dùng mẫu có sẵn
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label={`Ảnh của ${p.title}`}>
        {images.map((img) => (
          <div key={img.target}>
            <span className="c-lbl mb-1 block">{img.title}</span>
            <ImageSlot
              url={img.url || null}
              alt={img.title}
              label={img.label}
              contain
              canManage={canManage}
              pending={pending}
              onUpload={(file) => run(uploadForm(img.target, p.id, file, actions))}
              onRemove={() => run(() => actions.removeImage({ target: img.target, id: p.id }))}
            />
          </div>
        ))}
      </div>
      {canManage ? (
        <p className="c-lbl m-0 mt-1">
          Logo nên là ảnh PNG nền trong suốt, chữ sáng (thanh đầu trang màu xanh đậm). Có ảnh đầu trang thì
          trang hiện ảnh tràn hết chiều ngang kèm hai nút Xem bảng giá, Đặt lịch trải nghiệm, bỏ phần chữ đầu
          trang mặc định, nên thiết kế chữ ngay trong ảnh. Gợi ý máy tính 1920×800, điện thoại 1080×1350; chưa
          có ảnh điện thoại thì trang dùng ảnh máy tính.
        </p>
      ) : null}
    </li>
  );
}

function PageForm({
  page,
  save,
  onClose,
}: {
  page: LandingPageRow | null;
  save: LandingActions["savePage"];
  onClose: () => void;
}) {
  const { pending, run } = useRun();
  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(page));
  const [live, setLive] = useState(page ? page.status === "published" : true);
  const [s, setS] = useState<LandingSettings>(page?.settings ?? EMPTY_SETTINGS);
  const set = <K extends keyof LandingSettings>(k: K, v: LandingSettings[K]) =>
    setS((x) => ({ ...x, [k]: v }));
  const field = (k: keyof LandingSettings, label: string, placeholder?: string) => (
    <label className="c-lbl">
      {label}
      <input
        aria-label={label}
        value={s[k]}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
        className={FIELD}
      />
    </label>
  );
  const heading = page ? `Sửa ${page.title}` : "Tạo landing page";
  return (
    <form
      className="c-card c-cb grid gap-2 sm:grid-cols-2"
      style={{ paddingTop: 14 }}
      aria-label={heading}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            save({
              id: page?.id,
              slug,
              title,
              status: live ? "published" : "draft",
              settings: s,
            }),
          (r) => r.ok && onClose(),
        );
      }}
    >
      <b className="sm:col-span-2">{heading}</b>
      <label className="c-lbl">
        Tên trang
        <input
          aria-label="Tên trang"
          required
          maxLength={120}
          value={title}
          placeholder="Ví dụ: Khai trương Quận 4"
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Đường dẫn (/lp/…)
        <input
          aria-label="Đường dẫn"
          required
          maxLength={60}
          value={slug}
          placeholder="khai-truong-q4"
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          className={FIELD}
        />
      </label>
      {field("hotline", "Hotline", "Ví dụ: 0909 123 456")}
      {field("zalo", "Zalo (số hoặc link)", "Số Zalo OA hoặc link zalo.me")}
      {field("address", "Địa chỉ showroom")}
      {field("openHours", "Giờ mở cửa", "8:30 – 21:00, tất cả các ngày")}
      {field("kakao", "KakaoTalk ID cho khách ở Hàn")}
      {field("mapUrl", "Link Google Maps", "https://maps.app.goo.gl/…")}
      <label className="c-lbl">
        Hạn ưu đãi (giờ VN, để trống là không đếm ngược)
        <input
          aria-label="Hạn ưu đãi"
          type="datetime-local"
          value={s.countdownEnd}
          onChange={(e) => set("countdownEnd", e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="flex items-center gap-1.5 self-end">
        <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
        Bật trang (khách mở link là xem được)
      </label>
      <p className="c-lbl m-0 sm:col-span-2">
        Trang mới dùng mẫu khai trương có sẵn. Muốn giao diện khác thì tải file HTML lên sau khi tạo; HTML chỉ
        cần đọc dữ liệu CRM chèn sẵn và gửi form qua CRM (hướng dẫn ở docs/integrations/landing_page.md).
      </p>
      <div className="flex gap-1.5 sm:col-span-2">
        <button type="submit" className="c-btn is-brand" disabled={pending || !title.trim() || !slug.trim()}>
          Lưu
        </button>
        <button type="button" className="c-btn" onClick={onClose}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function ProductRow({
  p,
  canManage,
  actions,
}: {
  p: LandingProductEdit;
  canManage: boolean;
  actions: LandingActions;
}) {
  const { pending, run } = useRun();
  const [show, setShow] = useState(p.show);
  const [sort, setSort] = useState(p.sort === null ? "" : String(p.sort));
  const [badge, setBadge] = useState(p.badge);
  const [shortDesc, setShortDesc] = useState(p.shortDesc);
  const [giftText, setGiftText] = useState(p.giftText);
  const dirty =
    show !== p.show ||
    sort !== (p.sort === null ? "" : String(p.sort)) ||
    badge !== p.badge ||
    shortDesc !== p.shortDesc ||
    giftText !== p.giftText;
  const discounted = p.price < p.listPrice;
  const small = "block w-full rounded-control border border-line bg-surface px-1.5 py-1 text-text";
  return (
    <tr aria-label={`Ghế ${p.sku}`}>
      <td>
        <input
          type="checkbox"
          aria-label={`Hiện ${p.sku} trên landing`}
          checked={show}
          disabled={!canManage}
          onChange={(e) => setShow(e.target.checked)}
        />
      </td>
      <td className="whitespace-normal">
        <b>{p.name}</b> <span className="c-lbl tabular">{p.sku}</span>
      </td>
      <td>
        <ImageSlot
          url={p.imageUrl}
          alt={p.name}
          label={`Ảnh ${p.sku}`}
          canManage={canManage}
          pending={pending}
          onUpload={(file) => run(uploadForm("product", p.variantId, file, actions))}
          onRemove={() => run(() => actions.removeImage({ target: "product", id: p.variantId }))}
        />
      </td>
      <td className="text-right tabular whitespace-nowrap">
        <b>{formatMoney(p.price)}</b>
        {discounted ? <span className="c-lbl block line-through">{formatMoney(p.listPrice)}</span> : null}
        {p.promotions.length ? <span className="c-lbl block">{p.promotions.join(", ")}</span> : null}
      </td>
      <td className="min-w-56 space-y-1">
        {canManage ? (
          <>
            <input
              aria-label={`Nhãn ${p.sku}`}
              placeholder="Nhãn, ví dụ BÁN CHẠY"
              maxLength={40}
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
              className={small}
            />
            <input
              aria-label={`Mô tả ngắn ${p.sku}`}
              placeholder="Mô tả ngắn: con lăn, chương trình…"
              maxLength={300}
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              className={small}
            />
            <input
              aria-label={`Quà kèm ${p.sku}`}
              placeholder="Dòng quà, ví dụ Tặng quạt điện DQ120X"
              maxLength={200}
              value={giftText}
              onChange={(e) => setGiftText(e.target.value)}
              className={small}
            />
          </>
        ) : (
          <span className="c-lbl">
            {[p.badge, p.shortDesc, p.giftText].filter(Boolean).join(" · ") || "Chưa có"}
          </span>
        )}
      </td>
      <td>
        <input
          aria-label={`Thứ tự ${p.sku}`}
          inputMode="numeric"
          value={sort}
          disabled={!canManage}
          onChange={(e) => setSort(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          className={`${small} w-16`}
        />
      </td>
      {canManage ? (
        <td className="text-right">
          <button
            type="button"
            className="c-btn is-blue"
            aria-label={`Lưu ${p.sku}`}
            disabled={pending || !dirty}
            onClick={() =>
              run(() =>
                actions.saveProduct({
                  variantId: p.variantId,
                  show,
                  sort: sort === "" ? null : Number(sort),
                  badge,
                  shortDesc,
                  giftText,
                }),
              )
            }
          >
            Lưu
          </button>
        </td>
      ) : null}
    </tr>
  );
}
