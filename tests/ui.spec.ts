import { expect, test } from '@playwright/test'

test('renders the research timeline and analysis workspace', async ({ page }, testInfo) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: '霍尔木兹海峡通行风险' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '事件时间线' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '后续分析' })).toBeVisible()
  await expect(
    page.getByRole('img', { name: '中东地缘风险监测示意图' }),
  ).toBeVisible()
  await expect(page.getByText('实时服务', { exact: true })).toBeVisible()

  const pageHasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(pageHasHorizontalOverflow).toBe(false)

  await page.getByRole('tab', { name: '情景推演' }).click()
  await expect(page.getByText('基准情景', { exact: true })).toBeVisible()

  await page.screenshot({
    path: testInfo.outputPath('workspace.png'),
    fullPage: false,
  })
})

test('keeps the mobile layout usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only interaction')
  await page.goto('/')

  const pageHasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(pageHasHorizontalOverflow).toBe(false)

  await page.getByRole('button', { name: '打开导航' }).click()
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.getByRole('button', { name: '关闭导航' }).first().click()

  await page.screenshot({
    path: testInfo.outputPath('workspace-mobile.png'),
    fullPage: false,
  })
})

test('submits a follow-up question and refreshes the analysis', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop workflow coverage')
  await page.goto('/')
  await expect(page.getByText('实时服务', { exact: true })).toBeVisible()

  await page
    .getByRole('textbox', { name: '向 Agent 提问' })
    .fill('哪些市场会最先反映风险升级？')
  await page.getByRole('button', { name: '发送问题' }).click()

  await expect(page.getByRole('status')).toContainText('Agent 已完成分析更新', {
    timeout: 10_000,
  })
  await expect(page.getByText(/围绕“哪些市场会最先反映风险升级/)).toBeVisible()
})
