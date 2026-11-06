"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritable } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { isLandingSlug, landingSettingsSchema, type LandingSettings } from "@/lib/landing/contract";

import type { ActionResult } from "../settings/types";

// Landing page (migration 20261020000100_landing_pages.sql): quyền marketing.manage, kiểm lại ở database trong
// save_landing_page, save_landing_product; ảnh tải lên bucket product-images bằng khóa máy chủ sau khi kiểm quyền.

const DB_ERROR: Record<string, string> = {
  slug_taken: "Đường dẫn này đã có trang khác dùng, chọn đường dẫn khác.",
  "landing page not found": "Không còn trang này.",
  "product not found": "Không còn sản phẩm này.",
};

function failure(error: { message?: string; code?: string }): ActionResult {
  if (error.message && DB_ERROR[error.message]) return { ok: false, message: DB_ERROR[error.message] };
  if (error.code === "42501") return { ok: false, message: "Anh chị chưa được cấp quyền sửa landing page." };
  if (error.code === "22023") return { ok: false, message: "Thông tin chưa đúng, kiểm lại rồi lưu." };
  return { ok: false, message: "Chưa lưu được, thử lại sau ít phút." };
}

function refresh() {
  revalidatePath("/landing-pages");
}

const pageSchema = z.object({
  id: z.uuid().optional(),
  slug: z.string().trim().toLowerCase().refine(isLandingSlug, "slug"),
  title: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "published"]),
  settings: landingSettingsSchema,
});

export type LandingPageInput = z.input<typeof pageSchema>;

export async function saveLandingPage(input: LandingPageInput): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      message:
        field === "slug"
          ? "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang, ví dụ khai-truong-q4."
          : field === "settings"
            ? "Kiểm lại liên hệ, Messenger (link m.me hoặc tên Page), đường dẫn bản đồ, ảnh (bắt đầu bằng https://) và hạn ưu đãi."
            : "Nhập tên trang.",
    };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_landing_page", {
    p: { id: p.id ?? "", slug: p.slug, title: p.title, status: p.status, settings: p.settings },
  });
  if (error) return failure(error);
  refresh();
  return { ok: true, message: p.id ? `Đã lưu ${p.title}` : `Đã tạo ${p.title}` };
}

async function readPage(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("landing_pages")
    .select("id, slug, title, status, settings")
    .eq("id", id)
    .maybeSingle();
  return { supabase, page: data };
}

export async function setLandingStatus(input: {
  id: string;
  status: "draft" | "published";
}): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const id = z.uuid().safeParse(input.id);
  if (!id.success || !["draft", "published"].includes(input.status))
    return { ok: false, message: "Không tìm thấy trang." };
  const { supabase, page } = await readPage(id.data);
  if (!page) return { ok: false, message: "Không tìm thấy trang." };
  const { error } = await supabase.rpc("save_landing_page", {
    p: { id: page.id, slug: page.slug, title: page.title, status: input.status },
  });
  if (error) return failure(error);
  refresh();
  return {
    ok: true,
    message:
      input.status === "published"
        ? `Đã bật ${page.title}: khách mở link là xem được.`
        : `Đã tắt ${page.title}: khách mở link thấy trang đã kết thúc.`,
  };
}

const MAX_HTML = 2_000_000;

/** Tải HTML của trang lên (làm ở nơi khác, ví dụ nhờ trợ lý AI dựng). Bỏ trống file là quay về mẫu có sẵn. */
export async function uploadLandingHtml(form: FormData): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, message: "Không tìm thấy trang." };
  const reset = form.get("reset") === "1";
  let html: string | null = null;
  if (!reset) {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, message: "Chọn file HTML để tải lên." };
    if (file.size > MAX_HTML)
      return { ok: false, message: "File HTML tối đa 2MB (ảnh nên để ở link riêng)." };
    if (!/\.html?$/i.test(file.name)) return { ok: false, message: "Chỉ nhận file .html." };
    html = await file.text();
    if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html))
      return { ok: false, message: "File không phải trang HTML." };
  }
  const { supabase, page } = await readPage(id.data);
  if (!page) return { ok: false, message: "Không tìm thấy trang." };
  const { error } = await supabase.rpc("save_landing_page", {
    p: { id: page.id, slug: page.slug, title: page.title, status: page.status, html: html ?? "" },
  });
  if (error) return failure(error);
  refresh();
  return {
    ok: true,
    message: reset ? `${page.title} quay về dùng mẫu có sẵn.` : `Đã tải HTML mới cho ${page.title}.`,
  };
}

const productSchema = z.object({
  variantId: z.uuid(),
  show: z.boolean(),
  sort: z.number().int().min(0).max(9999).nullable(),
  badge: z.string().trim().max(40),
  shortDesc: z.string().trim().max(300),
  giftText: z.string().trim().max(200),
  /** Thông tin chi tiết ở khung xem chi tiết; trống thì trang dùng mô tả sản phẩm ở Sản phẩm. */
  detail: z.string().trim().max(4000),
  /** Giá công bố (đồng) hiện gạch ngang trên landing; null thì xóa. */
  comparePrice: z.number().int().min(0).max(10_000_000_000).nullable(),
});

export type LandingProductInput = z.infer<typeof productSchema>;

export async function saveLandingProduct(input: LandingProductInput): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Thông tin chưa đúng, kiểm lại rồi lưu." };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_landing_product", {
    p: {
      variant_id: p.variantId,
      show_on_landing: p.show,
      landing_sort: p.sort === null ? "" : String(p.sort),
      landing_badge: p.badge,
      short_desc: p.shortDesc,
      gift_text: p.giftText,
      landing_detail: p.detail,
      compare_price: p.comparePrice === null ? "" : String(p.comparePrice),
    },
  });
  if (error) return failure(error);
  refresh();
  return { ok: true, message: p.show ? "Đã lưu, ghế này hiện trên landing." : "Đã lưu, ghế này không hiện." };
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Ảnh của trang lưu trong landing_pages.settings: logo, ảnh lớn đầu trang trên máy tính và trên điện thoại. */
const PAGE_IMAGE: Record<string, "logoUrl" | "bannerUrl" | "bannerMobileUrl"> = {
  logo: "logoUrl",
  banner: "bannerUrl",
  banner_mobile: "bannerMobileUrl",
};

async function setPageImage(id: string, key: "logoUrl" | "bannerUrl" | "bannerMobileUrl", url: string) {
  const { supabase, page } = await readPage(id);
  if (!page) return { error: { message: "landing page not found" } };
  const settings: LandingSettings = { ...landingSettingsSchema.parse(page.settings ?? {}), [key]: url };
  return supabase.rpc("save_landing_page", {
    p: { id: page.id, slug: page.slug, title: page.title, status: page.status, settings },
  });
}

/** Ảnh chi tiết thêm của một ghế (ngoài ảnh chính): khung xem chi tiết hiện ảnh chính cùng tối đa 4 ảnh này. */
const GALLERY_MAX = 4;

/** Phiên bản sản phẩm thuộc showroom, kèm ảnh chi tiết hiện có (đọc bằng khóa máy chủ sau khi đã kiểm quyền). */
async function readVariant(id: string, showroomId: string) {
  const { data } = await createAdminClient()
    .from("product_variants")
    .select("id, products!inner(gallery)")
    .eq("id", id)
    .eq("showroom_id", showroomId)
    .maybeSingle();
  return data ? { id: data.id, gallery: data.products.gallery ?? [] } : null;
}

/**
 * Ảnh ghế, quà (target=product: ảnh chính; target=gallery: thêm một ảnh chi tiết; id là phiên bản sản phẩm) hoặc ảnh
 * của trang (target=logo, banner, banner_mobile, id là trang), vào bucket công khai product-images.
 */
export async function uploadLandingImage(form: FormData): Promise<ActionResult> {
  const user = await requireWritable("marketing.manage");
  const target = String(form.get("target") ?? "");
  const id = z.uuid().safeParse(form.get("id"));
  const file = form.get("file");
  const forProduct = target === "product" || target === "gallery";
  if (!id.success || (!forProduct && !PAGE_IMAGE[target]))
    return { ok: false, message: "Chưa rõ ảnh của mục nào." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Chọn ảnh để tải lên." };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { ok: false, message: "Chỉ nhận ảnh JPG, PNG, WEBP." };
  if (file.size > 4 * 1024 * 1024) return { ok: false, message: "Ảnh tối đa 4MB." };

  const supabase = await createClient();
  // Kiểm mục thuộc showroom và người dùng xem được trước khi ghi ảnh bằng khóa máy chủ.
  let gallery: string[] = [];
  if (!forProduct) {
    const { page } = await readPage(id.data);
    if (!page) return { ok: false, message: "Không tìm thấy trang." };
  } else {
    const own = await readVariant(id.data, user.showroomId);
    if (!own) return { ok: false, message: "Không tìm thấy sản phẩm." };
    gallery = own.gallery;
    if (target === "gallery" && gallery.length >= GALLERY_MAX)
      return { ok: false, message: `Tối đa ${GALLERY_MAX} ảnh chi tiết, gỡ bớt rồi thêm ảnh mới.` };
  }

  const admin = createAdminClient();
  const path = `${user.showroomId}/${target}/${id.data}/${randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, message: "Chưa tải được ảnh lên, thử lại sau ít phút." };
  const url = admin.storage.from("product-images").getPublicUrl(path).data.publicUrl;

  const { error } =
    target === "product"
      ? await supabase.rpc("save_landing_product", { p: { variant_id: id.data, image_url: url } })
      : target === "gallery"
        ? await supabase.rpc("save_landing_product", {
            p: { variant_id: id.data, gallery: [...gallery, url] },
          })
        : await setPageImage(id.data, PAGE_IMAGE[target], url);
  if (error) {
    await admin.storage.from("product-images").remove([path]);
    return failure(error);
  }
  refresh();
  return { ok: true, message: "Đã tải ảnh lên." };
}

/**
 * Gỡ ảnh: logo quay về chữ thương hiệu, ảnh đầu trang quay về phần đầu trang mặc định, ghế và quà quay về khung trống;
 * target=gallery gỡ một ảnh chi tiết (url).
 */
export async function removeLandingImage(input: {
  target: string;
  id: string;
  url?: string;
}): Promise<ActionResult> {
  const user = await requireWritable("marketing.manage");
  const id = z.uuid().safeParse(input.id);
  const target = input.target;
  if (!id.success || (target !== "product" && target !== "gallery" && !PAGE_IMAGE[target]))
    return { ok: false, message: "Chưa rõ ảnh của mục nào." };
  const supabase = await createClient();
  let result;
  if (target === "gallery") {
    const own = await readVariant(id.data, user.showroomId);
    if (!own) return { ok: false, message: "Không tìm thấy sản phẩm." };
    result = await supabase.rpc("save_landing_product", {
      p: { variant_id: id.data, gallery: own.gallery.filter((u) => u !== input.url) },
    });
  } else if (target === "product") {
    result = await supabase.rpc("save_landing_product", { p: { variant_id: id.data, image_url: "" } });
  } else {
    result = await setPageImage(id.data, PAGE_IMAGE[target], "");
  }
  const { error } = result;
  if (error) return failure(error);
  refresh();
  return { ok: true, message: "Đã gỡ ảnh." };
}
