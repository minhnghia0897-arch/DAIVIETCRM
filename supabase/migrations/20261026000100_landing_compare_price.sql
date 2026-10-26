-- Giá công bố của ghế trên landing (Owner chốt 26/10/2026, bảng giá ghế massage + quà tặng): trang hiện giá này gạch
-- ngang kèm % giảm cạnh giá bán. Chỉ để hiện trên landing; đơn hàng vẫn tính theo bảng giá qua hàm định giá. Sửa ở
-- Marketing → Landing page qua save_landing_product như các thông tin landing khác.

alter table public.products add column if not exists compare_price bigint;

-- Chạy lại file này cũng không lỗi (Owner chạy tay trên NGHIA).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_compare_price_range') then
    alter table public.products
      add constraint products_compare_price_range
      check (compare_price is null or (compare_price >= 0 and compare_price <= 10000000000));
  end if;
end;
$$;

-- p: {variant_id, show_on_landing?, landing_sort?, landing_badge?, short_desc?, gift_text?, image_url?, gallery?,
-- landing_detail?, compare_price?}. Chỉ đổi khóa có trong p. compare_price là số đồng; trống thì xóa giá công bố.
create or replace function public.save_landing_product(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid;
  v_image text := nullif(btrim(coalesce(p ->> 'image_url', '')), '');
  v_gallery text[];
  v_compare bigint;
begin
  perform public.assert_writer();
  if not (public.has_perm('marketing.manage') or public.has_perm('product.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select product_id into v_product from public.product_variants
  where id = nullif(p ->> 'variant_id', '')::uuid and showroom_id = public.current_showroom_id();
  if v_product is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if p ? 'gallery' then
    if jsonb_typeof(p -> 'gallery') <> 'array' then
      raise exception 'invalid landing product' using errcode = '22023';
    end if;
    select coalesce(array_agg(btrim(u) order by n), '{}') into v_gallery
    from jsonb_array_elements_text(p -> 'gallery') with ordinality as g (u, n)
    where btrim(u) <> '';
    if cardinality(v_gallery) > 4
       or exists (select 1 from unnest(v_gallery) u where u !~ '^https?://' or length(u) > 1000) then
      raise exception 'invalid landing product' using errcode = '22023';
    end if;
  end if;
  if p ? 'compare_price' then
    if nullif(btrim(coalesce(p ->> 'compare_price', '')), '') is not null then
      if btrim(p ->> 'compare_price') !~ '^\d{1,11}$' then
        raise exception 'invalid landing product' using errcode = '22023';
      end if;
      v_compare := btrim(p ->> 'compare_price')::bigint;
      if v_compare > 10000000000 then
        raise exception 'invalid landing product' using errcode = '22023';
      end if;
    end if;
  end if;
  if length(coalesce(p ->> 'landing_badge', '')) > 40 or length(coalesce(p ->> 'short_desc', '')) > 300
     or length(coalesce(p ->> 'gift_text', '')) > 200 or length(coalesce(v_image, '')) > 1000
     or length(coalesce(p ->> 'landing_detail', '')) > 4000
     or (v_image is not null and v_image !~ '^https?://') then
    raise exception 'invalid landing product' using errcode = '22023';
  end if;
  update public.products set
    show_on_landing = case when p ? 'show_on_landing' then coalesce((p ->> 'show_on_landing')::boolean, false)
                           else show_on_landing end,
    landing_sort = case when p ? 'landing_sort' then nullif(p ->> 'landing_sort', '')::int else landing_sort end,
    landing_badge = case when p ? 'landing_badge' then nullif(btrim(p ->> 'landing_badge'), '') else landing_badge end,
    short_desc = case when p ? 'short_desc' then nullif(btrim(p ->> 'short_desc'), '') else short_desc end,
    gift_text = case when p ? 'gift_text' then nullif(btrim(p ->> 'gift_text'), '') else gift_text end,
    image_url = case when p ? 'image_url' then v_image else image_url end,
    gallery = case when p ? 'gallery' then v_gallery else gallery end,
    landing_detail = case when p ? 'landing_detail' then nullif(btrim(p ->> 'landing_detail'), '') else landing_detail end,
    compare_price = case when p ? 'compare_price' then v_compare else compare_price end
  where id = v_product;
  -- Nhật ký ghi độ dài thông tin chi tiết thay cho cả đoạn chữ.
  perform public.write_audit('landing.product', 'products', v_product::text,
    case when p ? 'landing_detail'
         then (p - 'variant_id' - 'landing_detail') || jsonb_build_object('landing_detail_len', length(p ->> 'landing_detail'))
         else p - 'variant_id' end);
end;
$$;

revoke all on function public.save_landing_product(jsonb) from public, anon;
grant execute on function public.save_landing_product(jsonb) to authenticated;
