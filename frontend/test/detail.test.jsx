import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { AppRoutes } from '../src/routes/AppRoutes';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { labels, localDate, money, selectionFrom } from '../src/features/facilities/detailRules';
const facility={id:'1',name:'Detail fixture',district:'Phường Hải Châu',address:'Fixture address',opening_time:'06:00',closing_time:'22:00',gallery:[],amenities:[],courts:[{id:'10',name:'Sân 10'},{id:'2',name:'Sân 2'}],price_rules:[],cancellation_policy:null};
const stamp='2026-10-04T18:00:00.000Z';
const slots=Array.from({length:8},(_,i)=>({start_at:new Date(Date.UTC(2026,9,5,2,i*30)).toISOString(),end_at:new Date(Date.UTC(2026,9,5,2,(i+1)*30)).toISOString(),state:'AVAILABLE',slot_amount:'40000.5'}));
const ok=data=>new Response(JSON.stringify({data,meta:{server_time:stamp}}),{status:200});
const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status});
function mock({detail=facility,availability,sessionError=false}={}) {
  const calls=[];
  vi.stubGlobal('fetch',vi.fn((url,options)=>{
    expect(options.method).toBe('GET');expect(options.credentials).toBe('include');const u=new URL(url);calls.push(u);
    if(u.pathname.endsWith('/auth/session'))return Promise.resolve(fail(sessionError?503:401,'SESSION_EXPIRED'));
    if(u.pathname.includes('/availability'))return Promise.resolve(availability?availability(u,options):ok({court_id:u.pathname.split('/')[4],slots,date:u.searchParams.get('date'),timezone:'Asia/Ho_Chi_Minh',slot_minutes:30}));
    const result=typeof detail==='function'?detail(u,options):detail;
    return Promise.resolve(result).then(value=>value instanceof Response?value:ok(value));
  }));return calls;
}
function NavigationProbe(){const navigate=useNavigate();return <button hidden data-testid="navigate-detail" onClick={()=>navigate('/facilities/2?date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=10')}>Navigate</button>;}
function mount(path='/facilities/1'){return render(<MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes/><NavigationProbe/></AuthProvider></MemoryRouter>);}
const selected=()=>screen.queryAllByRole('button',{pressed:true}).filter(b=>b.classList.contains('fd-slot'));
it('reads DTO, sorts default Court by numeric ID and selects local date from server time',async()=>{
  const calls=mock();mount();await screen.findByRole('button',{name:/09:00–09:30/});
  await waitFor(()=>expect(calls.some(u=>u.pathname==='/api/v1/courts/2/availability')).toBe(true));
  expect(screen.getByLabelText('Chọn ngày').value).toBe('2026-10-05');
  expect(calls.find(u=>u.pathname.includes('availability')).searchParams.get('date')).toBe('2026-10-05');
  expect(screen.getByRole('heading',{name:facility.name})).toBeTruthy();expect(screen.getByText('Chưa có ảnh cơ sở')).toBeTruthy();
  expect(screen.getByText('Chưa có bảng giá.')).toBeTruthy();expect(screen.getByText(/không có nghĩa là được hủy tự do/)).toBeTruthy();
});
it('malformed nested Facility collection shows error instead of crashing',async()=>{mock({detail:{...facility,courts:null}});mount();expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByRole('heading',{name:facility.name})).toBeNull();});
it('all states map correctly and only AVAILABLE is enabled; null price is not zero',async()=>{
  mock({availability:()=>ok({court_id:'2',slots:Object.keys(labels).map((state,i)=>({...slots[i],state,slot_amount:state==='UNPRICED'?null:'40000.5'}))})});mount();
  await screen.findByRole('button',{name:/09:00–09:30/});
  for(const state of Object.keys(labels)){const button=screen.getByRole('button',{name:new RegExp('.*, '+labels[state]+',')});expect(button.disabled).toBe(state!=='AVAILABLE');}
  expect(screen.getByRole('button',{name:/Chưa có giá, Chưa có giá/})).toBeTruthy();
  expect(screen.getByLabelText('Chú thích trạng thái khung giờ').textContent).toContain('Đang chọn');
});
it('selects one through six, rejects gaps and seventh, prepares range without mutation',async()=>{
  const calls=mock();mount();await screen.findByRole('button',{name:/09:00–09:30/});
  const buttons=screen.getAllByRole('button').filter(b=>b.classList.contains('fd-slot'));
  fireEvent.click(buttons[0]);fireEvent.click(buttons[2]);expect(selected()).toHaveLength(1);expect(screen.getByRole('alert')).toBeTruthy();
  for(let i=1;i<6;i++)fireEvent.click(buttons[i]);expect(selected()).toHaveLength(6);
  fireEvent.click(buttons[6]);expect(selected()).toHaveLength(6);
  fireEvent.click(buttons[2]);expect(selected()).toHaveLength(6);
  const summary=screen.getByRole('status');expect(summary.textContent).toContain('09:00–12:00');expect(summary.textContent).toContain('6 slot');
  const cta=screen.getByRole('button',{name:'Tiếp tục đặt sân ›'});expect(cta.disabled).toBe(false);
  expect(cta.classList.contains('fd-booking-cta')).toBe(true);
  expect(calls.some(u=>u.pathname.includes('bookings'))).toBe(false);
  fireEvent.click(screen.getByText('Bỏ chọn'));expect(selected()).toHaveLength(0);
});
it('court/date changes clear selection and fetch new availability',async()=>{
  const calls=mock();mount();fireEvent.click(await screen.findByRole('button',{name:/09:00–09:30/}));
  fireEvent.click(screen.getByRole('button',{name:'Sân 10 ›'}));await screen.findByRole('button',{name:/09:00–09:30/});expect(selected()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:/09:00–09:30/}));fireEvent.change(screen.getByLabelText('Chọn ngày'),{target:{value:'2026-10-06'}});
  await waitFor(()=>expect(calls.at(-1).searchParams.get('date')).toBe('2026-10-06'));expect(selected()).toHaveLength(0);
});
it('no Courts skips Availability; displays real amenities/rules/policy',async()=>{
  const calls=mock({detail:{...facility,courts:[],amenities:[{id:'1',name:'Amenity fixture'}],price_rules:[{id:'1',start_time:'06:00',end_time:'22:00',hourly_rate:'80001'}],cancellation_policy:{cutoff_hours:24}}});mount();await screen.findByText('Chưa có sân đang hoạt động.');
  expect(calls.some(u=>u.pathname.includes('availability'))).toBe(false);expect(screen.getByText('Amenity fixture')).toBeTruthy();expect(screen.getByText('80.001 ₫/giờ')).toBeTruthy();expect(screen.getByText(/không gồm đúng mốc/)).toBeTruthy();
});
it.each([1,2,3,4])('gallery exposes the intentional %s-image composition',async count=>{
  const gallery=Array.from({length:count},(_,i)=>`https://images.example.invalid/${count}-${i}.webp`);
  mock({detail:{...facility,courts:[],gallery}});mount();await screen.findByRole('heading',{name:facility.name});
  const region=screen.getByRole('region',{name:`Hình ảnh ${facility.name}`});
  expect(region.classList.contains(`fd-gallery-count-${count}`)).toBe(true);
  const images=screen.getAllByRole('img');expect(images).toHaveLength(count);
  expect(images[0].getAttribute('loading')).toBe('eager');
  for(const image of images.slice(1))expect(image.getAttribute('loading')).toBe('lazy');
});
it('gallery caps visible cells, reports remaining images and keeps broken-image fallback',async()=>{
  const gallery=Array.from({length:7},(_,i)=>`https://images.example.invalid/many-${i}.webp`);
  mock({detail:{...facility,courts:[],gallery}});mount();await screen.findByRole('heading',{name:facility.name});
  expect(screen.getAllByRole('img')).toHaveLength(5);expect(screen.getByText('+2 ảnh')).toBeTruthy();
  fireEvent.error(screen.getAllByRole('img')[0]);expect(screen.getByText('Không tải được ảnh')).toBeTruthy();
});
it.each([[404,'RESOURCE_NOT_FOUND'],[409,'PRICE_NOT_CONFIGURED'],[409,'FACILITY_NOT_CONFIGURED'],[422,'INVALID_DATE'],[503,'SERVICE_UNAVAILABLE']])('Availability %s %s is error, never empty',async(status,code)=>{
  mock({availability:()=>fail(status,code)});mount();await screen.findByRole('alert');expect(screen.queryByText('Không có khung giờ trong ngày này.')).toBeNull();expect(screen.getByRole('button',{name:'Tiếp tục đặt sân ›'}).disabled).toBe(true);
});
it('Facility 404 provides back link without availability',async()=>{
  const calls=mock({detail:fail(404,'RESOURCE_NOT_FOUND')});mount();await screen.findByText(/Không tìm thấy cơ sở/);expect(screen.getByRole('link',{name:'Về danh sách sân'}).getAttribute('href')).toBe('/facilities');expect(calls.some(u=>u.pathname.includes('availability'))).toBe(false);
});
it('network failure retries to distinct empty state',async()=>{
  let error=true;mock({availability:()=>error?Promise.reject(new TypeError('offline')):ok({court_id:'2',slots:[]})});mount();await screen.findByRole('alert');error=false;fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));await screen.findByText('Không có khung giờ trong ngày này.');
});
it('late old Court response cannot replace new Court state',async()=>{
  let finish;mock({availability:u=>u.pathname.includes('/2/')?new Promise(resolve=>{finish=resolve;}):ok({court_id:'10',slots:[]})});mount();await screen.findByText('Đang tải lịch trống…');await waitFor(()=>expect(finish).toBeTypeOf('function'));fireEvent.click(screen.getByRole('button',{name:'Sân 10 ›'}));await screen.findByText('Không có khung giờ trong ngày này.');await act(async()=>finish(ok({court_id:'2',slots})));expect(screen.queryByRole('button',{name:/09:00–09:30/})).toBeNull();
});
it('decimal formatting and selection reject cross-day, blocked and gapped intervals',()=>{
  expect(money('999999999999.5')).toBe('999.999.999.999,5 ₫');expect(money(null)).toBe('Chưa có giá');expect(localDate('2026-10-04T17:00:00Z')).toBe('2026-10-05');
  expect(selectionFrom(slots,[0,1],'2','2026-10-05')).toEqual({court_id:'2',start_at:slots[0].start_at,end_at:slots[1].end_at});
  expect(selectionFrom(slots,[0,2],'2','2026-10-05')).toBeNull();expect(selectionFrom(slots,[0],'2','2026-10-06')).toBeNull();expect(selectionFrom([{...slots[0],state:'BLOCKED'}],[0],'2','2026-10-05')).toBeNull();
});
it('restores search context, selects a matching court and requested available interval',async()=>{
  const calls=mock();mount('/facilities/1?district='+encodeURIComponent(facility.district)+'&date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=10%2C2');
  await screen.findByText(/Đang kiểm tra lại lịch cho 2026-10-05/);
  await waitFor(()=>expect(calls.some(url=>url.pathname==='/api/v1/courts/10/availability')).toBe(true));
  expect(screen.getAllByText('Phù hợp theo tìm kiếm')).toHaveLength(2);
  expect(selected()).toHaveLength(2);
  expect(screen.getByRole('link',{name:/Danh sách sân/}).getAttribute('href')).toContain('date=2026-10-05');
});
it('overlaps hinted Availability with Detail but keeps slots hidden until the Court is validated',async()=>{
  let resolveDetail,resolveAvailability;
  const detail=new Promise(resolve=>{resolveDetail=resolve;}), availability=new Promise(resolve=>{resolveAvailability=resolve;});
  const calls=mock({detail,availability:()=>availability});
  mount('/facilities/1?date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=10');
  await waitFor(()=>{
    expect(calls.some(url=>url.pathname==='/api/v1/facilities/1')).toBe(true);
    expect(calls.some(url=>url.pathname==='/api/v1/courts/10/availability')).toBe(true);
  });
  await act(async()=>resolveAvailability(ok({court_id:'10',slots,date:'2026-10-05',timezone:'Asia/Ho_Chi_Minh',slot_minutes:30})));
  expect(screen.queryByRole('button',{name:/09:00–09:30/})).toBeNull();
  await act(async()=>resolveDetail(facility));
  await screen.findByRole('button',{name:/09:00–09:30/});
  expect(calls.filter(url=>url.pathname==='/api/v1/courts/10/availability')).toHaveLength(1);
});
it('never exposes a provisional Availability result when Facility Detail fails',async()=>{
  let resolveDetail,resolveAvailability;
  const detail=new Promise(resolve=>{resolveDetail=resolve;}), availability=new Promise(resolve=>{resolveAvailability=resolve;});
  const calls=mock({detail,availability:()=>availability});
  mount('/facilities/1?date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=10');
  await waitFor(()=>expect(calls.some(url=>url.pathname==='/api/v1/courts/10/availability')).toBe(true));
  await act(async()=>resolveAvailability(ok({court_id:'10',slots,date:'2026-10-05',timezone:'Asia/Ho_Chi_Minh',slot_minutes:30})));
  await act(async()=>resolveDetail(fail(404,'RESOURCE_NOT_FOUND')));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button',{name:/09:00â€“09:30/})).toBeNull();
});
it('discards a cross-Facility hint, aborts its provisional request and falls back to the validated Court',async()=>{
  let aborted=false;
  const calls=mock();
  // Replace the default Availability response with an abort-aware provisional read.
  globalThis.fetch.mockImplementation((url,options)=>{
    expect(options.method).toBe('GET');const u=new URL(url);calls.push(u);
    if(u.pathname.endsWith('/auth/session'))return Promise.resolve(fail(401,'SESSION_EXPIRED'));
    if(u.pathname==='/api/v1/courts/999/availability')return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}));
    if(u.pathname.includes('/availability'))return Promise.resolve(ok({court_id:'2',slots,date:u.searchParams.get('date'),timezone:'Asia/Ho_Chi_Minh',slot_minutes:30}));
    return Promise.resolve(ok(facility));
  });
  mount('/facilities/1?date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=999');
  await screen.findByRole('button',{name:/09:00–09:30/});
  await waitFor(()=>expect(aborted).toBe(true));
  expect(calls.some(url=>url.pathname==='/api/v1/courts/2/availability')).toBe(true);
  expect(screen.getByText('Sân 2')).toBeTruthy();
});
it('aborts an in-flight provisional Availability request when the Court changes',async()=>{
  let aborted=false;
  mock({availability:(u,options)=>u.pathname==='/api/v1/courts/10/availability' ? new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true})) : ok({court_id:'2',slots:[],date:u.searchParams.get('date'),timezone:'Asia/Ho_Chi_Minh',slot_minutes:30})});
  mount('/facilities/1?date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=10');
  await screen.findByText('Đang tải lịch trống…');
  fireEvent.click(screen.getByRole('button',{name:'Sân 2 ›'}));
  await waitFor(()=>expect(aborted).toBe(true));
  await screen.findByText('Không có khung giờ trong ngày này.');
});
it('aborts an in-flight provisional Availability request when the date changes',async()=>{
  let aborted=false, first=true;
  mock({availability:(u,options)=>first ? (first=false,new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}))) : ok({court_id:'10',slots:[],date:u.searchParams.get('date'),timezone:'Asia/Ho_Chi_Minh',slot_minutes:30})});
  mount('/facilities/1?date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=10');
  await screen.findByText('Đang tải lịch trống…');
  fireEvent.change(screen.getByLabelText('Chọn ngày'),{target:{value:'2026-10-06'}});
  await waitFor(()=>expect(aborted).toBe(true));
  await screen.findByText('Không có khung giờ trong ngày này.');
});
it('aborts in-flight hint reads when the route changes',async()=>{
  let aborted=false;
  mock({availability:(_u,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}))});
  mount('/facilities/1?date=2026-10-05&start_time=09%3A00&end_time=10%3A00&matching_courts=10');
  await screen.findByText('Đang tải lịch trống…');
  fireEvent.click(screen.getByTestId('navigate-detail'));
  await waitFor(()=>expect(aborted).toBe(true));
});
it('direct Facility navigation still waits for Detail before requesting Availability',async()=>{
  let resolveDetail;
  const detail=new Promise(resolve=>{resolveDetail=resolve;});
  const calls=mock({detail});mount('/facilities/1');
  await waitFor(()=>expect(calls.some(url=>url.pathname==='/api/v1/facilities/1')).toBe(true));
  expect(calls.some(url=>url.pathname.includes('/availability'))).toBe(false);
  await act(async()=>resolveDetail(facility));
  await screen.findByRole('button',{name:/09:00–09:30/});
  expect(calls.some(url=>url.pathname==='/api/v1/courts/2/availability')).toBe(true);
});
