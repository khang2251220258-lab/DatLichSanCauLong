/* oxlint-disable react/only-export-components, react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { money } from '../facilities/detailRules';
import { OwnerLayout, OwnerPager, ownerError, useOwnerRead } from './OwnerShared';
import { listResponse, ownerAnalyticsCourtsResponse, ownerAnalyticsOverviewResponse } from '../../services/responseValidators';
import './owner-analytics.css';

const WEEKDAYS = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 20;

const epochDay = value => {
  if (!DATE.test(value || '')) return null;
  const [year,month,day] = value.split('-').map(Number), date = new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day ? date.getTime()/86400000 : null;
};
const dateFromDay = day => new Date(day*86400000).toISOString().slice(0,10);
export function hoChiMinhToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
export function defaultAnalyticsRange(now = new Date()) {
  const to = hoChiMinhToday(now); return { from:dateFromDay(epochDay(to)-29), to };
}
export function normalizeAnalyticsQuery(params, now = new Date()) {
  const fallback=defaultAnalyticsRange(now), from=params.get('from'), to=params.get('to'), facility=params.get('facility_id'), rawPage=params.get('page');
  const fromDay=epochDay(from), toDay=epochDay(to), validRange=fromDay!==null&&toDay!==null&&toDay>=fromDay&&toDay-fromDay<366;
  return { from:validRange?from:fallback.from,to:validRange?to:fallback.to,facility_id:/^[1-9]\d*$/.test(facility||'')?facility:'',page:/^[1-9]\d*$/.test(rawPage||'')?Number(rawPage):1 };
}
const canonical = state => { const result=new URLSearchParams({from:state.from,to:state.to}); if(state.facility_id)result.set('facility_id',state.facility_id);if(state.page>1)result.set('page',String(state.page));return result; };
const percentage = value => value===null?'Chưa có capacity':`${Number(value).toLocaleString('vi-VN',{maximumFractionDigits:1})}%`;
const hours = value => `${Number(value).toLocaleString('vi-VN',{maximumFractionDigits:1})} giờ`;
const sameParams = (a,b) => a.toString()===b.toString();

function rangeFor(preset,today){const end=epochDay(today);if(preset==='today')return{from:today,to:today};if(preset==='7')return{from:dateFromDay(end-6),to:today};if(preset==='30')return{from:dateFromDay(end-29),to:today};const [year,month]=today.split('-').map(Number);if(preset==='month')return{from:`${today.slice(0,7)}-01`,to:today};const first=Date.UTC(year,month-2,1)/86400000,last=Date.UTC(year,month-1,0)/86400000;return{from:dateFromDay(first),to:dateFromDay(last)};}

function Loading(){return <div className="oa-loading" role="status" aria-label="Đang tải thống kê"><div/><div/><div/><div/></div>}
function ReadError({error,retry}){return <div className="oa-error" role="alert"><div><h2>Chưa thể tải thống kê</h2><p>{ownerError(error)}</p></div><button onClick={retry}>Thử lại</button></div>}
function Section({title,subtitle,children,className=''}){return <section className={`oa-section ${className}`}><header><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div></header>{children}</section>}

function Kpis({summary}){const items=[['Giá trị booking đã xác nhận',money(summary.confirmed_booking_value),'Tổng giá trị lịch đã xác nhận, không phải tổng tiền thực nhận.'],['Booking đã xác nhận',summary.confirmed_booking_count.toLocaleString('vi-VN'),'Bao gồm booking CONFIRMED và COMPLETED.'],['Giờ đã xác nhận',hours(summary.confirmed_hours),'Tổng thời lượng slot đã xác nhận.'],['Tỷ lệ lấp đầy',percentage(summary.utilization_rate),summary.utilization_rate===null?'Không có capacity sân hoạt động trong khoảng đã chọn.':`${summary.confirmed_occupied_slots} / ${summary.operational_capacity_slots} slot`]];return <section className="oa-kpis" aria-label="Chỉ số tổng quan">{items.map(([label,value,help])=><article key={label}><span>{label}</span><strong>{value}</strong><small>{help}</small></article>)}</section>}
function Trend({rows}){const max=Math.max(1,...rows.map(row=>Math.max(row.confirmed_count,row.cancelled_count)));return <Section title="Xu hướng đặt sân" subtitle="Booking xác nhận, hủy và giá trị booking theo tháng."><div className="oa-trend" role="list">{rows.map(row=><article key={row.month} role="listitem"><div><strong>{row.month.slice(5)}/{row.month.slice(0,4)}</strong><span>{money(row.confirmed_booking_value)}</span></div><div className="oa-bars" aria-label={`${row.confirmed_count} booking xác nhận, ${row.cancelled_count} booking đã hủy`}><i style={{'--size':`${row.confirmed_count/max*100}%`}}/><i className="cancelled" style={{'--size':`${row.cancelled_count/max*100}%`}}/></div><small><b>{row.confirmed_count}</b> xác nhận · <b>{row.cancelled_count}</b> hủy</small></article>)}</div></Section>}
function Weekdays({rows}){return <Section title="Mức sử dụng theo thứ"><div className="oa-weekdays">{rows.map(row=><article key={row.weekday}><span>{WEEKDAYS[row.weekday-1]}</span><strong>{percentage(row.utilization_rate)}</strong><small>{row.capacity_slots===0?'Không có capacity':`${row.occupied_slots} / ${row.capacity_slots} slot`}</small><i aria-hidden="true" style={{'--size':`${row.utilization_rate??0}%`}}/></article>)}</div></Section>}
function Heatmap({rows}){const times=[...new Set(rows.map(row=>row.start_time))].sort();const byKey=new Map(rows.map(row=>[`${row.weekday}:${row.start_time}`,row]));return <Section title="Khung giờ sử dụng sân" subtitle="Mỗi ô thể hiện mức sử dụng của một khung 30 phút." className="oa-heat-section"><div className="oa-heat-scroll" tabIndex="0" aria-label="Bảng nhiệt mức sử dụng theo thứ và giờ"><div className="oa-heat" style={{'--columns':times.length}}><span/><>{times.map(time=><strong key={time}>{time}</strong>)}</>{WEEKDAYS.map((day,index)=><div className="oa-heat-row" key={day}><b>{day}</b>{times.map(time=>{const cell=byKey.get(`${index+1}:${time}`);const value=cell?.utilization_rate;const text=!cell||cell.capacity_slots===0?'Không có capacity':`${cell.occupied_slots}/${cell.capacity_slots} slot, ${percentage(value)}`;return <span key={time} tabIndex="0" className="oa-heat-cell" style={{'--level':`${value??0}%`}} aria-label={`${day}, ${time}: ${text}`} title={`${day}, ${time}: ${text}`}><i>{value===null||value===undefined?'—':`${Math.round(Number(value))}%`}</i></span>})}</div>)}</div></div></Section>}
function Daily({rows}){const shown=rows.length<=14?rows:[...rows.slice(0,7),...rows.slice(-7)];return <Section title="Tình trạng sân theo ngày" subtitle={rows.length>14?'Hiển thị 7 ngày đầu và 7 ngày cuối của khoảng đã chọn.':''}><div className="oa-daily">{shown.map(row=><article key={row.date}><time dateTime={row.date}>{row.date.split('-').reverse().join('/')}</time><div aria-label={`${row.occupied_slots} đã sử dụng, ${row.blocked_slots} bị chặn, ${row.available_slots} còn trống`}><i className="occupied" style={{'--size':`${row.capacity_slots?row.occupied_slots/row.capacity_slots*100:0}%`}}/><i className="blocked" style={{'--size':`${row.capacity_slots?row.blocked_slots/row.capacity_slots*100:0}%`}}/></div><small>{row.occupied_slots} dùng · {row.blocked_slots} chặn · {row.available_slots} trống / {row.capacity_slots}</small></article>)}</div></Section>}
function Courts({read,onPage}){const rows=read.data?.data||[];if(read.loading&&!read.data)return <Loading/>;if(read.error&&!read.data)return <ReadError error={read.error} retry={read.refresh}/>;return <Section title="Hiệu suất từng sân" subtitle={read.data?`${read.data.meta.total} sân trong phạm vi đã chọn`:''} className="oa-courts">{read.busy&&<span className="oa-sync" role="status">Đang cập nhật…</span>}{read.error&&<p className="oa-inline-error" role="alert">Không thể cập nhật. Dữ liệu gần nhất vẫn được giữ lại.</p>}{rows.length===0?<p className="oa-empty">Chưa có sân hoạt động trong phạm vi đã chọn.</p>:<div className="oa-table" role="table" aria-label="Hiệu suất từng sân"><div className="oa-table-row head" role="row"><span>Sân</span><span>Booking</span><span>Giờ sử dụng</span><span>Giá trị booking</span><span>Lấp đầy</span></div><div role="rowgroup">{rows.map(row=><article className="oa-table-row" role="row" key={row.court_id}><div role="cell" data-label="Sân"><strong>{row.court_name}</strong><small>{row.facility_name}</small></div><strong role="cell" data-label="Booking">{row.confirmed_booking_count}</strong><span role="cell" data-label="Giờ sử dụng">{hours(row.confirmed_hours)}</span><span role="cell" data-label="Giá trị booking">{money(row.confirmed_booking_value)}</span><div role="cell" data-label="Lấp đầy"><strong>{percentage(row.utilization_rate)}</strong><small>{row.capacity_slots===0?'Không có capacity':`${row.occupied_slots} / ${row.capacity_slots} slot`}</small></div></article>)}</div></div>}{read.data&&<OwnerPager meta={read.data.meta} onPage={onPage}/>}</Section>}

export function OwnerAnalytics(){const [params,setParams]=useSearchParams(),today=hoChiMinhToday(),state=normalizeAnalyticsQuery(params),[draft,setDraft]=useState(state);const normalized=canonical(state);
  useEffect(()=>{if(!sameParams(params,normalized))setParams(normalized,{replace:true});},[params,normalized,setParams]);
  useEffect(()=>setDraft(state),[state.from,state.to,state.facility_id]);
  const filter=new URLSearchParams({from:state.from,to:state.to});if(state.facility_id)filter.set('facility_id',state.facility_id);
  const overview=useOwnerRead(`/owner/analytics/overview?${filter}`,ownerAnalyticsOverviewResponse,{cache:true});
  const courtQuery=new URLSearchParams(filter);courtQuery.set('page',String(state.page));courtQuery.set('page_size',String(PAGE_SIZE));
  const courts=useOwnerRead(`/owner/analytics/courts?${courtQuery}`,ownerAnalyticsCourtsResponse,{cache:true});
  const facilities=useOwnerRead('/owner/facilities?page=1&page_size=100',listResponse,{cache:true});
  const update=(next)=>setParams(canonical({...state,...next}));
  const apply=event=>{event.preventDefault();const fromDay=epochDay(draft.from),toDay=epochDay(draft.to);if(fromDay===null||toDay===null||toDay<fromDay||toDay-fromDay>=366)return;update({from:draft.from,to:draft.to,facility_id:draft.facility_id,page:1});};
  const data=overview.data?.data, hasOverview=Boolean(overview.data);
  return <OwnerLayout><header className="oa-heading"><span>Phân tích vận hành</span><h1>Thống kê hoạt động</h1><p>Theo dõi tình hình đặt sân và mức sử dụng sân.</p></header>
    <form className="oa-filters" onSubmit={apply}><label><span>Cơ sở</span><select value={draft.facility_id} onChange={event=>setDraft(current=>({...current,facility_id:event.target.value}))}><option value="">Tất cả cơ sở</option>{(facilities.data?.data||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Từ ngày</span><input id="oa-from" type="date" value={draft.from} max={draft.to} onChange={event=>setDraft(current=>({...current,from:event.target.value}))}/></label><label><span>Đến ngày</span><input type="date" value={draft.to} min={draft.from} onChange={event=>setDraft(current=>({...current,to:event.target.value}))}/></label><button type="submit">Áp dụng</button><div className="oa-presets" aria-label="Khoảng thời gian nhanh">{[['today','Hôm nay'],['7','7 ngày'],['30','30 ngày'],['month','Tháng này'],['previous','Tháng trước']].map(([key,label])=><button type="button" key={key} onClick={()=>update({...rangeFor(key,today),page:1})}>{label}</button>)}<button type="button" onClick={()=>document.getElementById('oa-from')?.focus()}>Tùy chỉnh</button></div></form>
    {overview.loading&&!hasOverview?<Loading/>:overview.error&&!hasOverview?<ReadError error={overview.error} retry={overview.refresh}/>:data&&<>{overview.busy&&<span className="oa-sync" role="status">Đang cập nhật thống kê…</span>}{overview.error&&<p className="oa-inline-error" role="alert">Không thể cập nhật dữ liệu mới nhất. Snapshot gần nhất vẫn được giữ lại.</p>}<Kpis summary={data.summary}/>{data.summary.confirmed_booking_count===0&&<p className="oa-empty">Chưa có booking đã xác nhận trong khoảng thời gian này.</p>}{data.summary.utilization_rate===null&&<p className="oa-zero">Không có capacity sân hoạt động trong khoảng thời gian đã chọn.</p>}<div className="oa-primary-grid"><Trend rows={data.monthly_trend}/><Weekdays rows={data.weekday_usage}/></div><Heatmap rows={data.hourly_heatmap}/><Daily rows={data.daily_capacity}/></>}
    <Courts read={courts} onPage={page=>update({page})}/>
  </OwnerLayout>}
