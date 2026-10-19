import { expect, test } from '@playwright/test';
import path from 'node:path';

const response={data:[{id:'9001',name:'Cơ sở minh họa lịch cố định',district:'Phường Hải Châu',address:'Địa chỉ dùng cho screenshot candidate',cover_image_url:null,amenities:[{id:'1',name:'Bãi đỗ xe'}],matching_courts:[{id:'9002',name:'Sân định kỳ 1'}]}],meta:{server_time:'2026-10-17T01:00:00.000Z',page:1,page_size:20,total:1,occurrence_count:1}};
const screenshotNames={'recurring-desktop':'recurring-search-redesign-desktop.png','recurring-tablet':'recurring-search-redesign-tablet.png','recurring-mobile':'recurring-search-redesign-mobile.png'};

test('public recurring search is responsive, URL-backed and sends one search request',async({page},testInfo)=>{
  const runtimeErrors=[];
  let recurringRequests=0;
  page.on('pageerror',error=>runtimeErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('401 (Unauthorized)'))runtimeErrors.push(message.text());});
  await page.route('**/api/v1/auth/session',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'UNAUTHENTICATED'}})}));
  await page.route('**/api/v1/facilities/recurring-search**',route=>{recurringRequests+=1;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});});
  await page.goto('/facilities?mode=recurring');
  await expect(page.getByRole('button',{name:'Đặt lịch cố định'})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('heading',{name:'Tìm sân cho lịch cố định của bạn'})).toBeVisible();
  expect(recurringRequests).toBe(0);
  await page.screenshot({path:path.resolve('../docs/ui-reference',screenshotNames[testInfo.project.name]),fullPage:true});
  await page.getByLabel('Thứ trong tuần').selectOption('3');
  await page.getByLabel('Ngày bắt đầu').fill('2026-10-21');
  await page.getByLabel('Ngày kết thúc').fill('2026-10-21');
  await page.getByLabel('Giờ bắt đầu').selectOption('18:00');
  await page.getByLabel('Giờ kết thúc').selectOption('19:00');
  await page.getByRole('button',{name:/Tìm sân phù hợp/}).click();
  await expect(page).toHaveURL(/mode=recurring.*weekday=3/);
  await expect(page.getByText('Cơ sở minh họa lịch cố định')).toBeVisible();
  await expect(page.getByText(/1 buổi.*1 sân phù hợp/)).toBeVisible();
  expect(recurringRequests).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect(runtimeErrors).toEqual([]);
  if(testInfo.project.name==='recurring-desktop')await page.screenshot({path:path.resolve('../docs/ui-reference/recurring-search-results-redesign-desktop.png'),fullPage:true});
});
