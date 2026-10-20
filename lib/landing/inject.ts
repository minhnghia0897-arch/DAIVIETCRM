import type { LandingData } from "./contract";

// Chèn dữ liệu CRM và bộ gửi form vào HTML của landing page. Trang chạy trong vùng cách ly (header CSP sandbox) nên
// không đọc được phiên đăng nhập CRM; gửi form là gọi sang /api/lp/<slug>/lead (CORS mở cho trang này).

const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

/** JSON đặt trong <script>: chặn "</script>" và ký tự xuống dòng U+2028, U+2029 làm vỡ mã. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LS, "\\u2028")
    .replace(PS, "\\u2029");
}

/**
 * window.CRMLanding: submit(form) gửi form về CRM, money(n) định dạng tiền. Form có thuộc tính data-crm-lead thì tự gửi,
 * hiện kết quả ở phần tử [data-crm-result] trong form (không có thì hiện hộp thông báo).
 */
export const LANDING_HELPER = `(function(){
var D=window.CRM_LANDING||{};
var KEYS=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid","ttclid"];
function utm(){var o={};try{var q=new URLSearchParams(location.search);KEYS.forEach(function(k){var v=q.get(k);if(v)o[k]=v.slice(0,200);});}catch(e){}return o;}
function submit(form){
var body={};var fd=new FormData(form);
fd.forEach(function(v,k){if(typeof v==="string")body[k]=v;});
var c=form.querySelector("[name=consent]");body.consent=!!(c&&c.checked);
body.utm=utm();body.referrer=(document.referrer||"").slice(0,500);
return fetch(D.leadUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
.then(function(r){return r.json().catch(function(){return {};}).then(function(j){
return {ok:!!(r.ok&&j.ok),message:j.message||(r.ok?"":"Chưa gửi được, vui lòng thử lại hoặc gọi hotline.")};});})
.catch(function(){return {ok:false,message:"Mất kết nối, vui lòng thử lại."};});}
function money(n){return Number(n||0).toLocaleString("vi-VN")+"đ";}
window.CRMLanding={data:D,submit:submit,money:money};
document.addEventListener("submit",function(e){
var f=e.target;if(!f||!f.hasAttribute||!f.hasAttribute("data-crm-lead"))return;
e.preventDefault();var b=f.querySelector("[type=submit]");if(b)b.disabled=true;
submit(f).then(function(res){if(b)b.disabled=false;var out=f.querySelector("[data-crm-result]");
var msg=res.message||(res.ok?"Đã nhận thông tin!":"Chưa gửi được.");
if(out){out.textContent=msg;out.style.display="block";}else{alert(msg);}
if(res.ok)f.reset();});},true);
})();`;

/** Chèn dữ liệu và bộ gửi form ngay sau <head> để mã của trang dùng được ngay khi chạy. */
export function injectLanding(html: string, data: LandingData): string {
  const tag = `<script>window.CRM_LANDING=${scriptJson(data)};</script><script>${LANDING_HELPER}</script>`;
  const head = html.match(/<head(\s[^>]*)?>/i);
  if (head && head.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  return tag + html;
}
