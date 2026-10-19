import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const reference = name => resolve('../docs/ui-reference', name);
const localDate = days => {
  const value = new Date(); value.setUTCDate(value.getUTCDate()+days);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
};

test('guest interval search is public, durable and responsive', async ({ page }, testInfo) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  if(testInfo.project.name==='guest-search-desktop')await page.screenshot({path:reference('guest-search-home-desktop.png'),fullPage:true});
  await page.getByLabel('Ngày chơi').fill(localDate(1));
  await page.getByLabel('Giờ bắt đầu').selectOption('09:00');
  await page.getByLabel('Giờ kết thúc').selectOption('10:00');
  await page.getByRole('button',{name:/Tìm sân/}).click();
  await expect(page).toHaveURL(/date=.*start_time=09%3A00.*end_time=10%3A00/);
  await expect(page.getByRole('heading',{name:'Sân phù hợp với thời gian đã chọn'})).toBeVisible();
  await expect(page.getByText('Phù hợp với thời gian đã chọn').first()).toBeVisible();
  await expect(page.getByRole('link',{name:'Xem chi tiết'}).first()).toBeVisible();
  const screenshot={
    'guest-search-desktop':'guest-search-results-desktop.png',
    'guest-search-tablet':'guest-search-results-tablet.png',
    'guest-search-mobile':'guest-search-results-mobile.png',
  }[testInfo.project.name];
  await page.screenshot({path:reference(screenshot),fullPage:true});
  const width=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(width).toBeLessThanOrEqual(1);
  if(testInfo.project.name==='guest-search-desktop'){
    await page.getByRole('link',{name:'Xem chi tiết'}).first().click();
    await expect(page).toHaveURL(/\/facilities\/\d+\?.*date=/);
    await expect(page.getByText(/Đang kiểm tra lại lịch cho/)).toBeVisible();
    await page.screenshot({path:reference('guest-search-facility-detail-desktop.png'),fullPage:true});
    await page.getByRole('link',{name:/Danh sách sân/}).click();
    await expect(page).toHaveURL(/\/facilities\?.*date=/);
  }
  expect(errors).toEqual([]);
});
