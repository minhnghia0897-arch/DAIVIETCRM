-- Đơn đã hoàn tất mà còn phải thu (thường là đơn được duyệt thu khi giao, giao xong rồi mới về tiền) vẫn ghi nhận được
-- khoản thu còn lại để đóng công nợ. Trước đây record_payment khóa mọi đơn hoàn tất nên số còn phải thu không bao giờ
-- về 0 (Owner báo 18/10/2026, đơn Q4-2610-0008).
--
-- Chỉ đổi hai điểm so với 20261011000500_sales_flow.sql: bỏ 'completed' khỏi danh sách khóa; khoản thu của đơn đã hoàn
-- tất luôn là 'balance'. Giữ nguyên: không ghi quá số còn phải thu, tách người ghi và người xác nhận (qua hàng chờ duyệt
-- payment_confirm), đơn hủy, trả hàng, nháp, chờ duyệt vẫn khóa. Doanh số người bán không đổi vì chỉ tính theo trạng
-- thái đơn (sales_credits).

create or replace function public.record_payment(p_order_id uuid, p_method text, p_amount bigint, p_reference text,
                                                 p_proof_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
  v_paid record;
  v_type text;
  v_id uuid;
begin
  if not public.has_perm('payment.record') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_o := public.assert_order_editor(p_order_id);
  if v_o.status in ('draft', 'pending_approval', 'cancelled', 'returned', 'return_requested') then
    raise exception 'payment_locked' using errcode = 'P0001';
  end if;
  if p_method not in ('bank_transfer', 'cash', 'cod') then
    raise exception 'invalid method' using errcode = '22023';
  end if;
  select * into v_paid from public.order_paid(v_o.id);
  if p_amount is null or p_amount <= 0 or p_amount > v_o.total - v_paid.confirmed - v_paid.pending then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_proof_path is not null and p_proof_path not like v_o.showroom_id::text || '/' || v_o.id::text || '/%' then
    raise exception 'invalid proof' using errcode = '22023';
  end if;
  -- Tiền thu sau khi đơn đã giao xong luôn là phần còn lại, không phải cọc.
  v_type := case when v_o.status = 'completed'
                   or exists (select 1 from public.payments where order_id = v_o.id and status <> 'rejected'
                                and type <> 'refund') then 'balance' else 'deposit' end;
  insert into public.payments (showroom_id, order_id, type, method, amount, reference, proof_path, recorded_by)
  values (v_o.showroom_id, v_o.id, v_type, p_method, p_amount, nullif(btrim(coalesce(p_reference, '')), ''),
          p_proof_path, v_user)
  returning id into v_id;
  insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason, payload)
  values (v_o.showroom_id, 'payment_confirm', 'payments', v_id, v_user,
          format('%s %s đồng cho đơn %s (%s%s)', case v_type when 'deposit' then 'Cọc' else 'Thanh toán' end,
                 public.money_text(p_amount), v_o.code,
                 case p_method when 'bank_transfer' then 'chuyển khoản' when 'cash' then 'tiền mặt' else 'thu khi giao' end,
                 case when nullif(btrim(coalesce(p_reference, '')), '') is null then ''
                      else ', nội dung "' || btrim(p_reference) || '"' end),
          jsonb_build_object('order_id', v_o.id, 'code', v_o.code, 'amount', p_amount));
  insert into public.notifications (showroom_id, user_id, type, title, link)
  select p.showroom_id, p.id, 'payment_confirm',
         format('Đơn %s có khoản %s đồng chờ xác nhận', v_o.code, public.money_text(p_amount)), '/tasks'
  from public.profiles p
  where p.showroom_id = v_o.showroom_id and p.is_active and p.id <> v_user
    and public.has_perm_for(p.id, 'payment.confirm');
  perform public.order_event(v_o.id, 'payment_recorded', jsonb_build_object('amount', p_amount, 'type', v_type));
  perform public.write_audit('payment.record', 'payments', v_id::text,
    jsonb_build_object('order_id', v_o.id, 'amount', p_amount));
  return v_id;
end;
$$;

revoke all on function public.record_payment(uuid, text, bigint, text, text) from public, anon;
grant execute on function public.record_payment(uuid, text, bigint, text, text) to authenticated;
